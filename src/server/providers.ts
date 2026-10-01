import { GoogleGenAI } from '@google/genai';
import type { ProviderConfig } from '../types/provider';

export class ProviderCallError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean
  ) {
    super(message);
    this.name = 'ProviderCallError';
  }
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
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

export async function callGemini(fullPrompt: string, config?: ProviderConfig): Promise<string> {
  const customKey = config?.apiKey?.trim();
  const requestedModel = config?.model?.trim() || 'gemini-2.5-flash';
  const ai = getGeminiClient(customKey);

  const candidateModels: string[] = [
    requestedModel,
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ];
  const uniqueModels = Array.from(new Set(candidateModels));
  let responseText = '';
  let lastError: unknown = null;

  for (const modelName of uniqueModels) {
    let isRateLimited = false;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: fullPrompt,
          config: { responseMimeType: 'application/json', temperature: 0.7 },
        });
        responseText = response.text || '';
        if (responseText) return responseText;
      } catch (err) {
        const errMsg = String((err as Error)?.message || err);
        const is429 =
          (err as { status?: number })?.status === 429 ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('quota');

        lastError = err;
        if (is429) {
          isRateLimited = true;
          break; // never retry an exhausted model
        }
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }

    if (isRateLimited && modelName !== uniqueModels[uniqueModels.length - 1]) continue;
  }

  const finalErrMsg = (lastError as Error)?.message || 'Gemini API failed to return content.';
  if (finalErrMsg.includes('429') || finalErrMsg.includes('RESOURCE_EXHAUSTED')) {
    throw new ProviderCallError(
      'Gemini free-tier quota limit reached. Switch to Gemini 3.1 Flash Lite or add your own API key in Providers.',
      true
    );
  }
  throw new ProviderCallError(finalErrMsg, true);
}

export async function callOpenAI(fullPrompt: string, config?: ProviderConfig): Promise<string> {
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

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
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

  if (!response.ok) {
    const errText = await response.text();
    throw new ProviderCallError(
      `OpenAI-compatible endpoint returned ${response.status}: ${errText}`,
      response.status === 429
    );
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new ProviderCallError('No content returned from OpenAI-compatible provider.', true);
  return content;
}

export async function callAnthropic(fullPrompt: string, config?: ProviderConfig): Promise<string> {
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

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
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

  if (!response.ok) {
    const errText = await response.text();
    throw new ProviderCallError(
      `Anthropic endpoint returned ${response.status}: ${errText}`,
      response.status === 429
    );
  }
  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new ProviderCallError('No content returned from Anthropic provider.', true);
  return text;
}

export async function callOllama(fullPrompt: string, config?: ProviderConfig): Promise<string> {
  const baseUrl = (
    config?.baseUrl?.trim() ||
    process.env.OLLAMA_BASE_URL ||
    'http://localhost:11434'
  ).replace(/\/+$/, '');
  const model = config?.model?.trim() || process.env.OLLAMA_MODEL || 'gemma4:e4b';

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        system:
          'You are an Expert B2B Commercial Fitness SEO Strategist and Web Developer. You MUST output ONLY valid raw JSON conforming strictly to the requested schema. Never output markdown codeblock ticks or preamble.',
        prompt: fullPrompt,
        stream: false,
        format: 'json',
        options: { temperature: 0.7 },
      }),
    });
  } catch (err) {
    throw new ProviderCallError(
      `Ollama is not reachable at ${baseUrl}. Start it with "ollama serve" and pull a model (e.g. "ollama pull ${model}"). Underlying error: ${String((err as Error)?.message || err)}`,
      false
    );
  }

  if (!response.ok) {
    const errText = await response.text();
    throw new ProviderCallError(
      `Ollama endpoint returned ${response.status}: ${errText}`,
      response.status === 429
    );
  }
  const data = await response.json();
  const text = data.response;
  if (!text) throw new ProviderCallError('No content returned from Ollama provider.', true);
  return text;
}

export async function callProvider(prompt: string, config: ProviderConfig): Promise<string> {
  if (config.provider === 'gemini') return callGemini(prompt, config);
  if (config.provider === 'openai') return callOpenAI(prompt, config);
  if (config.provider === 'anthropic') return callAnthropic(prompt, config);
  if (config.provider === 'ollama') return callOllama(prompt, config);
  throw new ProviderCallError(`Unsupported provider: ${config.provider}`, false);
}
