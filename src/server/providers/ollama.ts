/**
 * Ollama transport. Runs in the browser against the user's local Ollama
 * server, so it reads configuration from the per-role provider config only —
 * there is no server environment to fall back to.
 */
import type { ProviderConfig, ProviderType } from '../../types/provider';
import type { TokenUsage } from '../../types/agentEvents';
import {
  ProviderCallError,
  trace,
  describeFailure,
  REQUEST_TIMEOUT_MS,
  type CallTrace,
  type ProviderCallResult,
} from '../providerCore';
import { readableProviderError, cleanJsonOutput } from '../providerText';
import { buildChunkPrompt, extractChunkBody, planChunks, stitchChunks, type ChunkableRole } from '../chunked';

/**
 * Explicit output ceiling for Ollama. Left unset, the effective limit depends on
 * the machine's Ollama defaults rather than this app, so a long article can be
 * cut off for reasons the user cannot see. Measured completions on the local
 * models peak near 3.7k tokens, so this removes the cap without changing
 * normal behaviour.
 */
const DEFAULT_OLLAMA_NUM_PREDICT = 16_384;

const DEFAULT_OLLAMA_BASE_URL = 'http://localhost:11434';
const DEFAULT_OLLAMA_MODEL = 'gemma4:e4b';

function resolveBaseUrl(config?: ProviderConfig): string {
  return (config?.baseUrl?.trim() || DEFAULT_OLLAMA_BASE_URL).replace(/\/+$/, '');
}

function resolveModel(config?: ProviderConfig): string {
  return config?.model?.trim() || DEFAULT_OLLAMA_MODEL;
}

/**
 * Ollama surfaces load failures as a plain HTTP 500 whose body explains the
 * model never started, e.g. a 22 GB model on a 12 GB card. Retrying cannot help
 * because the model will not fit on the next attempt either.
 */
function isOllamaOutOfMemory(raw: string): boolean {
  return /out of memory|CUDA error|insufficient (?:VRAM|memory)|not enough memory/i.test(raw);
}

function ollamaOutOfMemoryMessage(raw: string, model: string, baseUrl: string): string {
  const detail = readableProviderError(raw).replace(/\s+/g, ' ').trim();
  return (
    `Ollama could not load "${model}" into memory on this machine, so nothing was generated. ` +
    `Pick a smaller model (the 7B-9B Q4_K_M builds fit comfortably) or free VRAM, then retry. ` +
    `Underlying error: ${detail || 'out of memory'} (endpoint: ${baseUrl})`
  );
}

export async function callOllama(
  fullPrompt: string,
  config?: ProviderConfig,
  callTrace?: CallTrace
): Promise<ProviderCallResult> {
  const provider: ProviderType = 'ollama';
  const baseUrl = resolveBaseUrl(config);
  const model = resolveModel(config);

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system:
          'You are an Expert B2B Commercial Fitness SEO Strategist and Web Developer. You MUST output ONLY valid raw JSON conforming strictly to the requested schema. Never output markdown codeblock ticks or preamble.',
        prompt: fullPrompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.7, num_predict: DEFAULT_OLLAMA_NUM_PREDICT },
      }),
    });
  } catch (err) {
    trace(callTrace, provider, {
      type: 'attempt',
      model,
      requestedModel: model,
      attempt: 1,
      durationMs: Date.now() - startedAt,
      promptChars: fullPrompt.length,
      message: `unreachable at ${baseUrl}`,
    });
    throw new ProviderCallError(
      `Ollama is not reachable at ${baseUrl}. Start it with "ollama serve", pull a model (e.g. "ollama pull ${model}"), and allow this site via OLLAMA_ORIGINS (see README -> "Using Ollama"). Underlying error: ${String((err as Error)?.message || err)}`,
      false
    );
  }

  if (!response.ok) {
    const errText = await response.text();
    const oom = isOllamaOutOfMemory(errText);
    const reason = oom ? ollamaOutOfMemoryMessage(errText, model, baseUrl) : `HTTP ${response.status}: ${readableProviderError(errText).slice(0, 160)}`;
    trace(callTrace, provider, {
      type: 'attempt',
      model,
      requestedModel: model,
      attempt: 1,
      durationMs: Date.now() - startedAt,
      promptChars: fullPrompt.length,
      message: oom ? `out of memory: ${readableProviderError(errText).slice(0, 160)}` : reason,
    });
    throw new ProviderCallError(
      reason,
      // A model that will not fit will not fit on the next attempt either.
      !oom && response.status === 429
    );
  }
  const data = await response.json();
  const text = data.response;
  const truncated = data.done_reason === 'length';
  const usage: TokenUsage | undefined =
    data.prompt_eval_count || data.eval_count
      ? { input: data.prompt_eval_count, output: data.eval_count }
      : undefined;
  trace(callTrace, provider, {
    type: 'attempt',
    model: data.model || model,
    requestedModel: model,
    attempt: 1,
    durationMs: Date.now() - startedAt,
    promptChars: fullPrompt.length,
    outputChars: text?.length ?? 0,
    usage,
    message: text
      ? truncated
        ? `hit the ${DEFAULT_OLLAMA_NUM_PREDICT}-token output ceiling (done_reason=length)`
        : 'answered'
      : 'empty response',
  });
  if (!text) throw new ProviderCallError('No content returned from Ollama provider.', true);
  return {
    text,
    model: data.model || model,
    provider,
    attempts: 1,
    usage,
    requestedModel: model,
    truncated,
  };
}

/** Field each role's stitched output is wrapped back into. */
const CHUNK_FIELD: Record<ChunkableRole, string> = {
  creator: 'markdownContent',
  designer: 'html',
};

const MAX_CHUNKS = 4;

/**
 * Re-run a role as separate sections and stitch them into one document.
 *
 * Only reached when a single response was truncated or unparseable. Out-of-memory
 * failures are excluded upstream: a model that cannot load cannot produce a chunk
 * either, so retrying would only waste time.
 */
export async function callOllamaChunked(
  fullPrompt: string,
  role: ChunkableRole,
  config?: ProviderConfig,
  callTrace?: CallTrace
): Promise<ProviderCallResult> {
  const provider: ProviderType = 'ollama';
  const requestedModel = resolveModel(config);
  const plans = planChunks(role).slice(0, MAX_CHUNKS);
  const field = CHUNK_FIELD[role];
  const bodies: string[] = [];
  const usage: TokenUsage = { input: 0, output: 0 };
  let model = '';
  let attempts = 0;
  let lastError: unknown;

  for (const plan of plans) {
    try {
      const result = await callOllama(
        buildChunkPrompt(role, fullPrompt, plan, field),
        config,
        callTrace
      );
      model = result.model;
      attempts += result.attempts;
      const body = extractChunkBody(result.text, field);
      if (body) bodies.push(body);
      if (result.usage) {
        usage.input = (usage.input ?? 0) + (result.usage.input ?? 0);
        usage.output = (usage.output ?? 0) + (result.usage.output ?? 0);
      }
      trace(callTrace, provider, {
        type: 'chunk',
        model: result.model,
        requestedModel: result.requestedModel,
        attempt: plan.index,
        totalAttempts: plans.length,
        outputChars: body.length,
        message: `section ${plan.index}/${plans.length} complete`,
      });
    } catch (err) {
      lastError = err;
      trace(callTrace, provider, {
        type: 'chunk',
        model: model || requestedModel,
        requestedModel,
        attempt: plan.index,
        totalAttempts: plans.length,
        message: `section ${plan.index}/${plans.length} failed: ${describeFailure(err).slice(0, 140)}`,
      });
      break;
    }
  }

  const combined = stitchChunks(bodies);
  if (!combined.trim()) {
    throw new ProviderCallError(
      `Chunked generation produced no usable output for "${role}" after ${bodies.length}/${plans.length} sections. ${
        lastError ? describeFailure(lastError) : ''
      }`.trim(),
      true
    );
  }

  // Each chunk carried its own {field: "..."} wrapper; unwrap those and wrap the
  // combined document once.
  const text = cleanJsonOutput(JSON.stringify({ [field]: combined }));
  trace(callTrace, provider, {
    type: 'chunk',
    model: model || requestedModel,
    requestedModel,
    attempt: bodies.length,
    totalAttempts: plans.length,
    outputChars: text.length,
    usage,
    message: `stitched ${bodies.length}/${plans.length} sections into ${field}`,
  });
  return {
    text,
    model: model || requestedModel,
    provider,
    attempts,
    usage,
    requestedModel,
  };
}
