/**
 * The provider pipeline for one agent role: prompt → call → validate → repair
 * → (Ollama-only) chunked retry. Extracted from the HTTP route so the exact
 * same logic runs in three places: the Express route (local/self-host), the
 * Vercel function, and the browser (Ollama runs client-side against the
 * user's local server).
 *
 * Events leave through `deps.emit`; transports differ (NDJSON line on the
 * server, local event bus in the browser) but the sequence is identical.
 */
import type { ProviderConfig } from '../types/provider';
import type { EventEmit } from '../types/agentEvents';
import { ProviderCallError, type CallTrace, type ProviderCallResult } from './providerCore';
import { validateRoleOutput, buildRepairPrompt } from './roleSchemas';
import { isChunkableRole, type ChunkableRole } from './chunked';
import {
  buildJudgePrompt,
  buildImpowerPrompt,
  buildKeywordResearchPrompt,
  buildCreatorPrompt,
  buildReviewerPrompt,
  buildDesignerPrompt,
  buildImproverPrompt,
} from './agentPrompts';

export class AgentRunError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean,
    /** 400 for request problems (nothing was executed); 502 for run failures. */
    public readonly status: 400 | 502 = 502
  ) {
    super(message);
    this.name = 'AgentRunError';
  }
}

export interface RunAgentRequest {
  role: string;
  input: Record<string, unknown>;
  userProfile: unknown;
  providerConfig: ProviderConfig;
  /** Absent means the UI is not watching this run — no events are emitted. */
  runId?: string;
  eventLabel?: string;
  callId?: string;
}

export type CallProviderFn = (
  prompt: string,
  config: ProviderConfig,
  callTrace?: CallTrace
) => Promise<ProviderCallResult>;

export type CallOllamaChunkedFn = (
  prompt: string,
  role: ChunkableRole,
  config: ProviderConfig,
  callTrace?: CallTrace
) => Promise<ProviderCallResult>;

export interface AgentRunDeps {
  emit?: EventEmit;
  callProvider: CallProviderFn;
  /** Present only where the Ollama chunked fallback is available. */
  callOllamaChunked?: CallOllamaChunkedFn;
}

export interface RunAgentTelemetry {
  provider: string;
  model: string;
  requestedModel: string;
  attempts: number;
  usage?: { input?: number; output?: number };
  ms: number;
}

export interface RunAgentSuccess {
  data: unknown;
  telemetry: RunAgentTelemetry;
}

/**
 * Validates the request shape before anything executes. Throws
 * `AgentRunError` with status 400; the adapters answer such errors with a
 * plain JSON response because no events have been written yet.
 */
export function parseRunAgentRequest(body: unknown): RunAgentRequest {
  const { role, input = {}, userProfile, providerConfig, runId, eventLabel, callId } =
    (body ?? {}) as Record<string, any>;

  if (!role) throw new AgentRunError('role is required', false, 400);
  if (!providerConfig?.provider) {
    throw new AgentRunError('providerConfig is required', false, 400);
  }
  if (!userProfile) throw new AgentRunError('userProfile is required', false, 400);
  if (providerConfig.provider === 'ollama') {
    throw new AgentRunError(
      'Ollama runs in the browser against your local server — it is not executed here. Configure Ollama in the Providers view and run again.',
      false,
      400
    );
  }

  return {
    role,
    input,
    userProfile,
    providerConfig,
    runId: typeof runId === 'string' && runId.trim() ? runId.trim() : undefined,
    eventLabel: typeof eventLabel === 'string' ? eventLabel : undefined,
    callId: typeof callId === 'string' ? callId : undefined,
  };
}

function promptForRole(role: string, input: any, profile: any): string {
  switch (role) {
    case 'judge':
      return buildJudgePrompt(input, profile);
    case 'impower':
      return buildImpowerPrompt(input, profile);
    case 'research':
      return buildKeywordResearchPrompt(input.topic, profile);
    case 'creator':
      return buildCreatorPrompt(input, profile);
    case 'reviewer':
      return buildReviewerPrompt(input, profile);
    case 'designer':
      return buildDesignerPrompt(input, profile);
    case 'improver':
      return buildImproverPrompt(input, profile);
    default:
      throw new Error(`Unsupported role: ${role}`);
  }
}

/**
 * Runs one role to completion. Emits `call-start`/`repair`/`chunk`/`completed`
 * or `failed` through `deps.emit` (only when the request carries a runId) and
 * resolves with the validated output, or throws `AgentRunError`.
 */
export async function executeAgentRun(
  request: RunAgentRequest,
  deps: AgentRunDeps
): Promise<RunAgentSuccess> {
  const { role, input, userProfile, providerConfig } = request;
  const startedAt = Date.now();

  const callTrace: CallTrace | undefined =
    request.runId && role
      ? {
          runId: request.runId,
          role,
          label: request.eventLabel,
          callId: request.callId,
          emit: deps.emit ?? (() => {}),
        }
      : undefined;

  const report = (type: 'completed' | 'failed', extra: Record<string, unknown> = {}) => {
    if (!callTrace) return;
    callTrace.emit({
      runId: callTrace.runId,
      role: callTrace.role,
      label: callTrace.label,
      callId: callTrace.callId,
      type,
      provider: providerConfig.provider,
      model: (extra.model as string) ?? providerConfig.model ?? '',
      durationMs: Date.now() - startedAt,
      ...extra,
    });
  };

  try {
    if (callTrace) {
      callTrace.emit({
        runId: callTrace.runId,
        role: callTrace.role,
        label: callTrace.label,
        callId: callTrace.callId,
        type: 'call-start',
        provider: providerConfig.provider,
        model: providerConfig.model,
        requestedModel: providerConfig.model,
      });
    }

    const prompt = promptForRole(role, input, userProfile);

    let call = await deps.callProvider(prompt, providerConfig, callTrace);
    let result = validateRoleOutput(role as any, call.text);

    // One repair attempt for shape problems. Transport failures already
    // exhausted the retry ladder inside callProvider, so this is the only extra
    // call a bad response can cost.
    if (!result.ok) {
      if (callTrace) {
        callTrace.emit({
          runId: callTrace.runId,
          role: callTrace.role,
          label: callTrace.label,
          callId: callTrace.callId,
          type: 'repair',
          provider: providerConfig.provider,
          model: call.model,
          message: `Invalid output — ${result.error}`.slice(0, 200),
        });
      }
      call = await deps.callProvider(
        buildRepairPrompt(role as any, call.text),
        providerConfig,
        callTrace
      );
      result = validateRoleOutput(role as any, call.text);
    }

    // The repair pass is a resend of the same shape, so a response that was cut
    // short by the output ceiling will be cut short again. Only then is it worth
    // asking for the body a section at a time. Ollama-only: the other providers
    // keep their current behaviour.
    if (!result.ok && providerConfig.provider === 'ollama' && isChunkableRole(role as string)) {
      if (callTrace) {
        callTrace.emit({
          runId: callTrace.runId,
          role: callTrace.role,
          label: callTrace.label,
          callId: callTrace.callId,
          type: 'chunk',
          provider: 'ollama',
          model: call.model,
          message: 'Retrying in sections — the single response did not fit.',
        });
      }
      if (!deps.callOllamaChunked) {
        report('failed', { model: call.model, message: result.error });
        throw new AgentRunError(result.error, false);
      }
      try {
        call = await deps.callOllamaChunked(
          prompt,
          role as ChunkableRole,
          providerConfig,
          callTrace
        );
        result = validateRoleOutput(role as any, call.text);
      } catch (chunkErr) {
        const message =
          chunkErr instanceof Error ? chunkErr.message : 'Chunked generation failed.';
        report('failed', { model: call.model, message });
        throw new AgentRunError(message, false);
      }
    }

    if (!result.ok) {
      report('failed', { model: call.model, message: result.error });
      throw new AgentRunError(result.error, false);
    }

    report('completed', {
      model: call.model,
      requestedModel: call.requestedModel,
      attempts: call.attempts,
      outputChars: call.text.length,
      usage: call.usage,
    });

    return {
      data: result.data,
      telemetry: {
        provider: call.provider,
        model: call.model,
        requestedModel: call.requestedModel,
        attempts: call.attempts,
        usage: call.usage,
        ms: Date.now() - startedAt,
      },
    };
  } catch (error) {
    // Inner paths already reported their own `failed` event before throwing.
    if (error instanceof AgentRunError) throw error;
    const message = error instanceof Error ? error.message : 'Agent call failed';
    report('failed', { message });
    // A transport failure that exhausted its retries still deserves its
    // recoverable flag on the way out — quota errors are worth another run.
    const recoverable =
      error instanceof ProviderCallError
        ? error.recoverable
        : (error as { recoverable?: boolean })?.recoverable === true;
    throw new AgentRunError(message, recoverable);
  }
}
