import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listModels, resetModelCatalogCache } from './modelCatalog';
import { PROVIDER_PRESETS } from '../types/provider';

function mockFetch(payload: unknown, ok = true, status = 200) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => payload,
    text: async () => 'boom',
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

beforeEach(() => {
  resetModelCatalogCache();
  process.env.GEMINI_API_KEY = 'server-key';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.GEMINI_API_KEY;
});

describe('listModels', () => {
  it('reads Gemini ids and display names, keeping only generative models', async () => {
    const spy = mockFetch({
      models: [
        {
          name: 'models/gemini-2.5-flash',
          displayName: 'Gemini 2.5 Flash',
          inputTokenLimit: 1048576,
          supportedGenerationMethods: ['generateContent'],
        },
        {
          name: 'models/gemini-2.5-embedding',
          displayName: 'Embedding',
          supportedGenerationMethods: ['embedContent'],
        },
      ],
    });

    const result = await listModels({ provider: 'gemini' });
    expect(spy.mock.calls[0][0]).toContain('/models?pageSize=200');
    expect(spy.mock.calls[0][1]?.headers).toMatchObject({ 'x-goog-api-key': 'server-key' });
    expect(result.live).toBe(true);
    expect(result.models).toEqual([
      {
        id: 'gemini-2.5-flash',
        name: 'Gemini 2.5 Flash',
        provider: 'gemini',
        detail: '1049K in',
      },
    ]);
  });

  it('lists OpenAI-compatible ids with their owner', async () => {
    const spy = mockFetch({ data: [{ id: 'deepseek-chat', owned_by: 'deepseek' }] });
    const result = await listModels({
      provider: 'openai',
      baseUrl: 'https://api.deepseek.com/v1',
      apiKey: 'dk',
    });
    expect(spy.mock.calls[0][0]).toBe('https://api.deepseek.com/v1/models');
    expect(result.models[0]).toMatchObject({ id: 'deepseek-chat', detail: 'deepseek' });
  });

  it('uses Anthropic display names', async () => {
    mockFetch({ data: [{ id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5' }] });
    const result = await listModels({ provider: 'anthropic', apiKey: 'ak' });
    expect(result.models[0]).toMatchObject({
      id: 'claude-sonnet-4-5',
      name: 'Claude Sonnet 4.5',
    });
  });

  it('describes local Ollama models by parameter size', async () => {
    const spy = mockFetch({
      models: [
        {
          name: 'gemma3:4b',
          size: 3_261_598_976,
          details: { parameter_size: '4.3B', quantization: 'Q4_K_M' },
        },
      ],
    });
    const result = await listModels({ provider: 'ollama' });
    expect(spy.mock.calls[0][0]).toBe('http://localhost:11434/api/tags');
    expect(result.models[0]).toMatchObject({ id: 'gemma3:4b', detail: '4.3b · q4_k_m · 3 GB' });
  });

  it('falls back to the built-in list and reports why', async () => {
    mockFetch({}, false, 401);
    const result = await listModels({ provider: 'openai', apiKey: 'bad-key' });
    expect(result.live).toBe(false);
    expect(result.error).toContain('HTTP 401');
    expect(result.models.map((model) => model.id)).toEqual(
      PROVIDER_PRESETS.openai.models.map((model) => model.id)
    );
  });

  it('serves a cached catalog until asked to refresh', async () => {
    const first = mockFetch({ data: [{ id: 'a' }] });
    await listModels({ provider: 'openai', apiKey: 'k' });
    const cached = await listModels({ provider: 'openai', apiKey: 'k' });
    expect(first).toHaveBeenCalledTimes(1);
    expect(cached.cachedAt).toBeTypeOf('number');

    await listModels({ provider: 'openai', apiKey: 'k' }, { refresh: true });
    expect(first).toHaveBeenCalledTimes(2);
  });

  it('does not reuse one credential cache for another key', async () => {
    const spy = mockFetch({ data: [{ id: 'a' }] });
    await listModels({ provider: 'openai', apiKey: 'key-one' });
    await listModels({ provider: 'openai', apiKey: 'key-two' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('never touches process.env, so the same module runs in the browser', async () => {
    mockFetch({ models: [{ name: 'qwen3:8b' }] });
    const realProcess = globalThis.process;
    vi.stubGlobal('process', undefined);
    try {
      const result = await listModels({ provider: 'ollama' }, { refresh: true });
      expect(result.live).toBe(true);
      expect(result.models[0].id).toBe('qwen3:8b');
    } finally {
      vi.stubGlobal('process', realProcess);
    }
  });
});
