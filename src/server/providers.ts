import { GoogleGenAI } from '@google/genai';
import type { ProviderConfig, ProviderType } from '../types/provider';
import { PROVIDER_PRESETS } from '../types/provider';
import type { TokenUsage } from '../types/agentEvents';
import { publishAgentEvent, type PublishInput } from './agentEvents';
import { buildChunkPrompt, extractChunkBody, planChunks, stitchChunks, type ChunkableRole } from './chunked';

export class ProviderCallError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean
  ) {
    super(message);
    this.name = 'ProviderCallError';
  }
}

/** Ties provider-internal attempts to the run the UI is watching. */
export interface CallTrace {
  runId: string;
  role: string;
  label?: string;
  callId?: string;
}

export interface ProviderCallResult {
  text: string;
  /** Model that actually answered; differs from the config when Gemini fell back. */
  model: string;
  provider: ProviderType;
  attempts: number;
  usage?: TokenUsage;
  requestedModel: string;
  /**
   * True when the provider stopped because it hit its output ceiling rather
   * than finishing. The body is then usually a valid-looking prefix.
   */
  truncated?: boolean;
}

type PublishRest = Omit<PublishInput, 'runId' | 'role'>;

/**
 * A stalled provider socket used to block a run forever (observed: one Reviewer
 * request that never returned). Generations finish in seconds, so a slow
 * attempt is cut short and reported instead of hanging the pipeline.
 */
const REQUEST_TIMEOUT_MS = 180_000;

/**
 * Explicit output ceiling for Ollama. Left unset, the effective limit depends on
 * the machine's Ollama defaults rather than this app, so a long article can be
 * cut off for reasons the user cannot see. Measured completions on the local
 * models peak near 3.7k tokens, so this removes the cap without changing
 * normal behaviour.
 */
const DEFAULT_OLLAMA_NUM_PREDICT = 16_384;

function ollamaNumPredict(): number {
  const raw = process.env.OLLAMA_NUM_PREDICT?.trim();
  const parsed = Number(raw);
  if (raw && Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  return DEFAULT_OLLAMA_NUM_PREDICT;
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

function isTimeoutError(err: unknown): boolean {
  const e = err as { name?: string; message?: string };
  const name = String(e?.name ?? '');
  const message = String(e?.message ?? '');
  return (
    name === 'AbortError' ||
    name === 'TimeoutError' ||
    /timed out|timeout|was aborted/i.test(message)
  );
}

function describeFailure(err: unknown): string {
  if (isTimeoutError(err)) return `no response after ${REQUEST_TIMEOUT_MS / 1000}s`;
  return readableProviderError(String((err as Error)?.message || err));
}

/**
 * Providers put the real reason inside a JSON error body, which the SDKs and
 * `response.text()` hand back verbatim. Unwrap it so the activity panel can read.
 */
export function readableProviderError(raw: string): string {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed.startsWith('{')) return trimmed;
  try {
    const parsed = JSON.parse(trimmed);
    const message =
      parsed?.error?.message ?? parsed?.error?.error_message ?? parsed?.message ?? parsed?.msg;
    if (typeof message !== 'string' || !message.trim()) return trimmed;
    const status = parsed?.error?.status ?? parsed?.error?.code;
    return typeof status === 'string' ? `${message.trim()} (${status})` : message.trim();
  } catch {
    return trimmed;
  }
}

function trace(
  callTrace: CallTrace | undefined,
  provider: ProviderType,
  rest: PublishRest
): void {
  if (!callTrace) return;
  publishAgentEvent({
    ...rest,
    runId: callTrace.runId,
    role: callTrace.role,
    label: callTrace.label,
    callId: callTrace.callId,
    provider,
  });
}

export function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

function getGeminiClient(customKey?: string) {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ProviderCallError(
      'GEMINI_API_KEY is not configured in server environment or provider settings.',
      false
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' }, timeout: REQUEST_TIMEOUT_MS },
  });
}

function geminiUsage(metadata: any): TokenUsage | undefined {
  if (!metadata) return undefined;
  return {
    input: metadata.promptTokenCount ?? undefined,
    output: metadata.candidatesTokenCount ?? undefined,
  };
}

export async function callGemini(
  fullPrompt: string,
  config?: ProviderConfig,
  callTrace?: CallTrace
): Promise<ProviderCallResult> {
  const provider: ProviderType = 'gemini';
  const customKey = config?.apiKey?.trim();
  const requestedModel = config?.model?.trim() || PROVIDER_PRESETS.gemini.defaultModel;
  const ai = getGeminiClient(customKey);

  // gemini-2.5-flash is listed by the API but rejected for newer keys, so it is
  // not a usable escape hatch.
  const candidateModels: string[] = [
    requestedModel,
    'gemini-3.1-flash-lite',
    'gemini-3.8-flash',
    'gemini-flash-latest',
  ];
  const uniqueModels = Array.from(new Set(candidateModels));
  let lastError: unknown = null;
  let attempts = 0;

  for (const [modelIndex, modelName] of uniqueModels.entries()) {
    if (modelIndex > 0) {
      const reason = describeFailure(lastError ?? new Error('previous model failed'));
      trace(callTrace, provider, {
        type: 'model-fallback',
        model: modelName,
        requestedModel,
        message: `${reason.slice(0, 140)} — falling back to ${modelName}`,
      });
    }

    let isRateLimited = false;

    for (let attempt = 1; attempt <= 2; attempt++) {
      const startedAt = Date.now();
      attempts += 1;
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: fullPrompt,
          config: { responseMimeType: 'application/json', temperature: 0.7 },
        });
        const responseText = response.text || '';
        trace(callTrace, provider, {
          type: 'attempt',
          model: modelName,
          requestedModel,
          attempt,
          durationMs: Date.now() - startedAt,
          promptChars: fullPrompt.length,
          outputChars: responseText.length,
          usage: geminiUsage(response.usageMetadata),
          message: responseText ? 'answered' : 'empty response',
        });
        if (responseText) {
          return {
            text: responseText,
            model: modelName,
            provider,
            attempts,
            usage: geminiUsage(response.usageMetadata),
            requestedModel,
          };
        }
      } catch (err) {
        const errMsg = describeFailure(err);
        const is429 =
          (err as { status?: number })?.status === 429 ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('quota');

        lastError = err;
        trace(callTrace, provider, {
          type: 'attempt',
          model: modelName,
          requestedModel,
          attempt,
          totalAttempts: 2,
          durationMs: Date.now() - startedAt,
          promptChars: fullPrompt.length,
          message: `${is429 ? 'rate limited' : 'error'}: ${errMsg.slice(0, 160)}`,
        });
        if (is429) {
          isRateLimited = true;
          break; // never retry an exhausted model
        }
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }

    if (!isRateLimited && modelName !== uniqueModels[uniqueModels.length - 1]) continue;
  }

  const finalErrMsg = describeFailure(
    lastError ?? new Error('Gemini API failed to return content.')
  );
  if (finalErrMsg.includes('429') || finalErrMsg.includes('RESOURCE_EXHAUSTED')) {
    throw new ProviderCallError(
      'Gemini free-tier quota limit reached. Switch to Gemini 3.1 Flash Lite or add your own API key in Providers.',
      true
    );
  }
  throw new ProviderCallError(finalErrMsg, true);
}

export async function callOpenAI(
  fullPrompt: string,
  config?: ProviderConfig,
  callTrace?: CallTrace
): Promise<ProviderCallResult> {
  const provider: ProviderType = 'openai';
  const apiKey = config?.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new ProviderCallError(
      'OPENAI_API_KEY is not configured in server environment or provider settings.',
      false
    );
  }

  const baseUrl = (
    config?.baseUrl?.trim() ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  ).replace(/\/+$/, '');
  const model = config?.model?.trim() || process.env.OPENAI_MODEL || 'gpt-4o';

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are an Expert B2B Commercial Fitness SEO Strategist and Web Developer. You MUST output ONLY valid JSON matching the user schema. Do not write markdown wrappers or extraneous text.',
          },
          { role: 'user', content: fullPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
      }),
    });
  } catch (err) {
    const reason = describeFailure(err);
    trace(callTrace, provider, {
      type: 'attempt',
      model,
      requestedModel: model,
      attempt: 1,
      durationMs: Date.now() - startedAt,
      promptChars: fullPrompt.length,
      message: `network error: ${reason}`,
    });
    throw new ProviderCallError(`OpenAI-compatible endpoint unreachable: ${reason}`, true);
  }

  if (!response.ok) {
    const errText = await response.text();
    trace(callTrace, provider, {
      type: 'attempt',
      model,
      requestedModel: model,
      attempt: 1,
      durationMs: Date.now() - startedAt,
      promptChars: fullPrompt.length,
      message: `HTTP ${response.status}: ${readableProviderError(errText).slice(0, 160)}`,
    });
    throw new ProviderCallError(
      `OpenAI-compatible endpoint returned ${response.status}: ${errText}`,
      response.status === 429
    );
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  const usage: TokenUsage | undefined = data.usage
    ? { input: data.usage.prompt_tokens, output: data.usage.completion_tokens }
    : undefined;
  trace(callTrace, provider, {
    type: 'attempt',
    model: data.model || model,
    requestedModel: model,
    attempt: 1,
    durationMs: Date.now() - startedAt,
    promptChars: fullPrompt.length,
    outputChars: content?.length ?? 0,
    usage,
    message: content ? 'answered' : 'empty response',
  });
  if (!content) throw new ProviderCallError('No content returned from OpenAI-compatible provider.', true);
  return {
    text: content,
    model: data.model || model,
    provider,
    attempts: 1,
    usage,
    requestedModel: model,
  };
}

export async function callAnthropic(
  fullPrompt: string,
  config?: ProviderConfig,
  callTrace?: CallTrace
): Promise<ProviderCallResult> {
  const provider: ProviderType = 'anthropic';
  const apiKey = config?.apiKey?.trim() || process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    throw new ProviderCallError(
      'ANTHROPIC_API_KEY is not configured in server environment or provider settings.',
      false
    );
  }

  const baseUrl = (
    config?.baseUrl?.trim() ||
    process.env.ANTHROPIC_BASE_URL ||
    'https://api.anthropic.com/v1'
  ).replace(/\/+$/, '');
  const model = config?.model?.trim() || process.env.ANTHROPIC_MODEL || 'claude-3-7-sonnet-20250219';

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/messages`, {
      method: 'POST',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 8000,
        system:
          'You are an Expert B2B Commercial Fitness SEO Strategist and Web Developer. You MUST output ONLY valid raw JSON conforming strictly to the requested schema. Never output markdown codeblock ticks or preamble.',
        messages: [{ role: 'user', content: fullPrompt }],
        temperature: 0.7,
      }),
    });
  } catch (err) {
    const reason = describeFailure(err);
    trace(callTrace, provider, {
      type: 'attempt',
      model,
      requestedModel: model,
      attempt: 1,
      durationMs: Date.now() - startedAt,
      promptChars: fullPrompt.length,
      message: `network error: ${reason}`,
    });
    throw new ProviderCallError(`Anthropic endpoint unreachable: ${reason}`, true);
  }

  if (!response.ok) {
    const errText = await response.text();
    trace(callTrace, provider, {
      type: 'attempt',
      model,
      requestedModel: model,
      attempt: 1,
      durationMs: Date.now() - startedAt,
      promptChars: fullPrompt.length,
      message: `HTTP ${response.status}: ${readableProviderError(errText).slice(0, 160)}`,
    });
    throw new ProviderCallError(
      `Anthropic endpoint returned ${response.status}: ${errText}`,
      response.status === 429
    );
  }
  const data = await response.json();
  const text = data.content?.[0]?.text;
  const usage: TokenUsage | undefined = data.usage
    ? { input: data.usage.input_tokens, output: data.usage.output_tokens }
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
    message: text ? 'answered' : 'empty response',
  });
  if (!text) throw new ProviderCallError('No content returned from Anthropic provider.', true);
  return {
    text,
    model: data.model || model,
    provider,
    attempts: 1,
    usage,
    requestedModel: model,
  };
}

export async function callOllama(
  fullPrompt: string,
  config?: ProviderConfig,
  callTrace?: CallTrace
): Promise<ProviderCallResult> {
  const provider: ProviderType = 'ollama';
  const baseUrl = (
    config?.baseUrl?.trim() ||
    process.env.OLLAMA_BASE_URL ||
    'http://localhost:11434'
  ).replace(/\/+$/, '');
  const model = config?.model?.trim() || process.env.OLLAMA_MODEL || 'gemma4:e4b';

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
        options: { temperature: 0.7, num_predict: ollamaNumPredict() },
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
      `Ollama is not reachable at ${baseUrl}. Start it with "ollama serve" and pull a model (e.g. "ollama pull ${model}"). Underlying error: ${String((err as Error)?.message || err)}`,
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
        ? `hit the ${ollamaNumPredict()}-token output ceiling (done_reason=length)`
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

export async function callProvider(
  prompt: string,
  config: ProviderConfig,
  callTrace?: CallTrace
): Promise<ProviderCallResult> {
  if (config.provider === 'gemini') return callGemini(prompt, config, callTrace);
  if (config.provider === 'openai') return callOpenAI(prompt, config, callTrace);
  if (config.provider === 'anthropic') return callAnthropic(prompt, config, callTrace);
  if (config.provider === 'ollama') return callOllama(prompt, config, callTrace);
  throw new ProviderCallError(`Unsupported provider: ${config.provider}`, false);
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
  const requestedModel = config?.model?.trim() || process.env.OLLAMA_MODEL || 'gemma4:e4b';
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
