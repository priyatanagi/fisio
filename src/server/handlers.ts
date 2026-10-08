/**
 * Framework-agnostic HTTP handler cores. The Express routes (local/self-host)
 * and the Vercel functions are thin adapters over these, so validation,
 * messages and the NDJSON protocol are identical on every platform.
 */
import type { PublishInput } from '../types/agentEvents';
import {
  AgentRunError,
  executeAgentRun,
  parseRunAgentRequest,
  type AgentRunDeps,
  type RunAgentRequest,
  type RunAgentTelemetry,
} from './agentRun';
import { listModels } from './modelCatalog';
import { callProvider, cleanJsonOutput } from './providers';
import type { ProviderConfig } from '../types/provider';

export interface HttpResult<T = unknown> {
  status: number;
  payload: T;
}

const OLLAMA_ON_SERVER_ERROR =
  'Ollama runs in the browser against your local server — the server cannot reach it. Configure Ollama in the Providers view (see README -> "Using Ollama").';

export async function handleTestProvider(body: unknown): Promise<HttpResult> {
  try {
    const { provider = 'gemini', model, apiKey, baseUrl } = (body ?? {}) as Record<string, any>;
    if (provider === 'ollama') {
      return { status: 400, payload: { success: false, error: OLLAMA_ON_SERVER_ERROR } };
    }
    const testConfig: ProviderConfig = { provider, model, apiKey, baseUrl };

    // Listing the real catalog first means the message names models the
    // provider actually offers, instead of only confirming the endpoint.
    const catalog = await listModels({ provider, apiKey, baseUrl }, { refresh: true });
    const requested = typeof model === 'string' ? model.trim() : '';
    const known = catalog.models.some((m) => m.id === requested);
    const catalogLine = catalog.live
      ? `Found ${catalog.models.length} model(s) available to this credential.`
      : `Could not list models (${catalog.error}).`;
    const missingLine =
      requested && !known
        ? ` "${requested}" is not in that list — it may still work if the provider hides it.`
        : '';

    if (provider === 'openai') {
      if (!catalog.live) throw new Error(catalog.error ?? 'Model listing failed.');
      return {
        status: 200,
        payload: {
          success: true,
          message: `Successfully connected to ${provider.toUpperCase()}! ${catalogLine}${missingLine}`,
          modelCount: catalog.models.length,
        },
      };
    }

    const testPrompt =
      'Respond strictly with valid JSON: {"status": "ok", "message": "connection successful"}';
    const result = await callProvider(testPrompt, testConfig);
    const cleaned = cleanJsonOutput(result.text);
    JSON.parse(cleaned);

    return {
      status: 200,
      payload: {
        success: true,
        message: `Successfully connected to ${provider.toUpperCase()}! "${result.model}" answered the probe. ${catalogLine}${missingLine}`,
        model: result.model,
        modelCount: catalog.models.length,
      },
    };
  } catch (error: any) {
    return {
      status: 400,
      payload: { success: false, error: error.message || 'Connection test failed' },
    };
  }
}

export async function handleModels(body: unknown): Promise<HttpResult> {
  const { provider, apiKey, baseUrl, refresh } = (body ?? {}) as Record<string, any>;
  const supported = ['gemini', 'openai', 'anthropic', 'ollama'];
  if (!supported.includes(provider)) {
    return { status: 400, payload: { ok: false, error: `Unsupported provider: ${provider}` } };
  }
  if (provider === 'ollama') {
    return { status: 400, payload: { ok: false, error: OLLAMA_ON_SERVER_ERROR } };
  }
  const catalog = await listModels({ provider, apiKey, baseUrl }, { refresh: Boolean(refresh) });
  return { status: 200, payload: { ok: true, ...catalog } };
}

/** One line of the run-agent response stream. */
export type StreamChunk =
  | { kind: 'event'; event: PublishInput }
  | { kind: 'result'; ok: true; data: unknown; telemetry: RunAgentTelemetry }
  | { kind: 'result'; ok: false; error: string; recoverable: boolean };

export function encodeChunk(chunk: StreamChunk): string {
  return `${JSON.stringify(chunk)}\n`;
}

/**
 * Executes a parsed run-agent request, forwarding every event as an NDJSON
 * line and finishing with exactly one `result` line — success or failure.
 * Request-shape errors (400) never reach here; adapters answer those with
 * plain JSON before the stream starts.
 */
export async function runAgentStream(
  request: RunAgentRequest,
  deps: Omit<AgentRunDeps, 'emit'>,
  onLine: (line: string) => void
): Promise<void> {
  const emit = (event: PublishInput) => onLine(encodeChunk({ kind: 'event', event }));
  try {
    const result = await executeAgentRun(request, { ...deps, emit });
    onLine(
      encodeChunk({ kind: 'result', ok: true, data: result.data, telemetry: result.telemetry })
    );
  } catch (error) {
    const err =
      error instanceof AgentRunError
        ? error
        : new AgentRunError(
            error instanceof Error ? error.message : 'Agent call failed',
            (error as { recoverable?: boolean })?.recoverable === true
          );
    onLine(
      encodeChunk({
        kind: 'result',
        ok: false,
        error: err.message,
        recoverable: err.recoverable,
      })
    );
  }
}

/** Re-exported so adapters parse before streaming without a second import. */
export { parseRunAgentRequest, AgentRunError };
