import { GoogleGenAI } from '@google/genai';
import type { ProviderConfig, ProviderType } from '../types/provider';
import { PROVIDER_PRESETS } from '../types/provider';
import type { TokenUsage } from '../types/agentEvents';
import { describeFailure, trace, REQUEST_TIMEOUT_MS, ProviderCallError } from './providerCore';
import type { CallTrace, ProviderCallResult } from './providerCore';
import { cleanJsonOutput, readableProviderError } from './providerText';

export {
  ProviderCallError,
  REQUEST_TIMEOUT_MS,
  type CallTrace,
  type ProviderCallResult,
} from './providerCore';
export { cleanJsonOutput, readableProviderError } from './providerText';

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

export async function callProvider(
  prompt: string,
  config: ProviderConfig,
  callTrace?: CallTrace
): Promise<ProviderCallResult> {
  if (config.provider === 'gemini') return callGemini(prompt, config, callTrace);
  if (config.provider === 'openai') return callOpenAI(prompt, config, callTrace);
  if (config.provider === 'anthropic') return callAnthropic(prompt, config, callTrace);
  if (config.provider === 'ollama') {
    // Ollama runs in the browser against the user's local server; the request
    // should never have reached the server. Handlers reject it earlier with a
    // user-facing message — this is the last line of defence.
    throw new ProviderCallError(
      'Ollama runs in the browser, not on the server. Run Ollama requests from the client.',
      false
    );
  }
  throw new ProviderCallError(`Unsupported provider: ${config.provider}`, false);
}
