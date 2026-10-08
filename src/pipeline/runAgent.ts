import {
  AgentRunError,
  executeAgentRun,
  type RunAgentRequest,
  type RunAgentTelemetry,
} from '../server/agentRun';
import { callOllama, callOllamaChunked } from '../server/providers/ollama';
import type { PublishInput } from '../types/agentEvents';
import { publishLocalEvent } from './agentEvents';
import type { AnyRole } from './stages';
import type { ProviderConfig } from '../types/provider';
import type { UserProfile } from '../types/profile';
import type { UniversalRules } from '../config/universalRules';

export interface RunAgentOptions {
  role: AnyRole;
  input: Record<string, unknown>;
  userProfile: UserProfile;
  providerConfig: ProviderConfig;
  universalRules: UniversalRules;
  signal: AbortSignal;
  /** Identifies the run whose background activity the UI is watching. */
  runId?: string;
  /** Sub-grouping inside a run, e.g. a batch row. */
  eventLabel?: string;
}

export class AgentError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean,
    public readonly aborted = false
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

interface ResultChunk {
  kind: 'result';
  ok: boolean;
  data?: unknown;
  telemetry?: RunAgentTelemetry;
  error?: string;
  recoverable?: boolean;
}

type StreamChunk = { kind: 'event'; event: PublishInput } | ResultChunk;

function parseLine(line: string): StreamChunk | null {
  try {
    const parsed = JSON.parse(line) as StreamChunk;
    return parsed && typeof parsed === 'object' && 'kind' in parsed ? parsed : null;
  } catch {
    // A corrupt line is noise, not a failure — the run keeps streaming.
    return null;
  }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new AgentError('Request aborted', true, true);
}

/**
 * Ollama answers on the user's own machine, so the browser calls it directly —
 * the server cannot reach localhost of whoever is browsing. The full pipeline
 * (prompt → call → validate → repair → chunked retry) is the same
 * `executeAgentRun` the server route runs; only the transport differs:
 * events go straight to the local bus instead of an NDJSON line.
 */
async function runOllamaLocally(options: RunAgentOptions): Promise<any> {
  const request: RunAgentRequest = {
    role: options.role,
    input: options.input,
    userProfile: options.userProfile,
    providerConfig: options.providerConfig,
    runId: options.runId,
    eventLabel: options.eventLabel,
  };

  // Only a watched run (one with a runId the UI subscribes to) publishes;
  // executeAgentRun suppresses its own events otherwise.
  const publish = (event: PublishInput) => {
    if (options.runId) publishLocalEvent(event);
  };

  try {
    const result = await executeAgentRun(request, {
      emit: publish,
      // No transport trace for the plain call: attempt-level noise would make
      // the browser log diverge from what the server stream sends. The chunked
      // retry keeps its trace because section progress is the only signal that
      // a multi-minute rebuild is alive.
      callProvider: (prompt, config) => callOllama(prompt, config),
      callOllamaChunked: (prompt, role, config, trace) =>
        callOllamaChunked(prompt, role, config, trace),
    });
    return result.data;
  } catch (error) {
    if (error instanceof AgentRunError) {
      throw new AgentError(error.message, error.recoverable);
    }
    throw error;
  }
}

async function readNdjsonStream(
  response: Response,
  runId: string | undefined,
  role: string
): Promise<ResultChunk> {
  let lastResult: ResultChunk | null = null;
  const reader = response.body?.getReader();
  if (!reader) {
    const payload = await response.json().catch(() => ({}));
    return {
      kind: 'result',
      ok: Boolean(payload.ok),
      data: payload.data,
      error: payload.error,
      recoverable: payload.recoverable,
    };
  }

  const decoder = new TextDecoder();
  let buffer = '';

  const consume = (line: string) => {
    const chunk = parseLine(line);
    if (!chunk) return;
    if (chunk.kind === 'event') {
      publishLocalEvent(chunk.event);
    } else {
      lastResult = chunk;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) consume(line);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } finally {
    reader.releaseLock();
  }

  if (!lastResult) {
    // The log always gets a closing event, even when the transport died: the
    // server never had the chance to report its own failure.
    if (runId) {
      publishLocalEvent({
        runId,
        role,
        type: 'failed',
        message: 'Connection to the agent stream was lost before the run finished.',
      });
    }
    throw new AgentError('The connection to the agent run closed before it finished.', true);
  }
  return lastResult;
}

export async function runAgent(options: RunAgentOptions): Promise<any> {
  if (options.providerConfig.provider === 'ollama') {
    return runOllamaLocally(options);
  }

  const callId = options.runId
    ? `${options.role}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
    : undefined;

  let response: Response;
  try {
    response = await fetch('/api/run-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        role: options.role,
        input: options.input,
        userProfile: options.userProfile,
        providerConfig: options.providerConfig,
        universalRules: options.universalRules,
        runId: options.runId,
        eventLabel: options.eventLabel,
        callId,
      }),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new AgentError('Request aborted', true, true);
    }
    throw new AgentError((err as Error).message || 'Network error', true);
  }

  throwIfAborted(options.signal);

  const contentType = response.headers.get('content-type') ?? '';
  let result: ResultChunk;
  if (contentType.includes('application/x-ndjson') && response.body) {
    try {
      result = await readNdjsonStream(response, options.runId, options.role);
    } catch (err) {
      if (err instanceof AgentError) throw err;
      if ((err as Error).name === 'AbortError') {
        throw new AgentError('Request aborted', true, true);
      }
      throw new AgentError((err as Error).message || 'Stream read failed', true);
    }
  } else {
    // Plain JSON: either a pre-stream rejection (400 validation, a platform
    // error page) or a server without streaming. Same shape as the result line.
    const payload = await response.json().catch(() => ({}));
    if (!response.ok && payload.ok === undefined) {
      throw new AgentError(`Server responded with status ${response.status}`, true);
    }
    result = {
      kind: 'result',
      ok: Boolean(payload.ok),
      data: payload.data,
      error: payload.error,
      recoverable: payload.recoverable,
    };
  }

  if (!result.ok) {
    throw new AgentError(result.error || 'Agent call failed', result.recoverable !== false);
  }
  return result.data;
}
