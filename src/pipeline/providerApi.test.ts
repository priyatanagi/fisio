import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchModelCatalog, testProviderConnection } from './providerApi';
import { resetModelCatalogCache } from '../server/modelCatalog';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  resetModelCatalogCache();
});
afterEach(() => vi.unstubAllGlobals());

describe('fetchModelCatalog', () => {
  it('asks the local Ollama server directly instead of POSTing /api/models', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      const target = String(url);
      if (target.endsWith('/api/tags')) {
        return jsonResponse({ models: [{ name: 'qwen3:8b', size: 5e9 }] });
      }
      throw new Error(`unexpected request: ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const catalog = await fetchModelCatalog({
      provider: 'ollama',
      baseUrl: 'http://localhost:11434',
    });

    expect(catalog?.live).toBe(true);
    expect(catalog?.models.map((m) => m.id)).toEqual(['qwen3:8b']);
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:11434/api/tags');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api/models'))).toBe(false);
  });

  it('routes cloud providers through POST /api/models on the server', async () => {
    const fetchMock = vi.fn(async (_url: unknown) =>
      jsonResponse({
        ok: true,
        provider: 'gemini',
        live: true,
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        models: [{ id: 'gemini-3.1-flash-lite', name: 'Flash Lite', provider: 'gemini' }],
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const catalog = await fetchModelCatalog({ provider: 'gemini', apiKey: 'k' });

    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/models');
    expect(catalog?.live).toBe(true);
    expect(catalog?.models[0].id).toBe('gemini-3.1-flash-lite');
  });
});

describe('testProviderConnection', () => {
  it('reports a healthy local Ollama with its model count', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ models: [{ name: 'qwen3:8b' }, { name: 'gemma4:e4b' }] }))
    );

    const result = await testProviderConnection({
      provider: 'ollama',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
    });

    expect(result.ok).toBe(true);
    expect(result.message).toContain('OLLAMA');
    expect(result.message).toContain('2 model');
    expect(result.message).toContain('qwen3:8b');
  });

  it('explains how to allow this origin when Ollama refuses the connection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    const result = await testProviderConnection({ provider: 'ollama', model: 'qwen3:8b' });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('OLLAMA_ORIGINS');
    expect(result.message).toContain('ollama serve');
  });

  it('warns when the configured model is missing from the local server', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ models: [{ name: 'other:1b' }] })));

    const result = await testProviderConnection({
      provider: 'ollama',
      model: 'qwen3:8b',
      baseUrl: 'http://localhost:11434',
    });

    expect(result.ok).toBe(true);
    expect(result.message).toContain('not in that list');
  });

  it('delegates cloud providers to POST /api/test-provider', async () => {
    const fetchMock = vi.fn(async (_url: unknown) =>
      jsonResponse({ success: true, message: 'Successfully connected to GEMINI!' })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await testProviderConnection({ provider: 'gemini', model: 'm', apiKey: 'k' });

    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/test-provider');
    expect(result).toEqual({ ok: true, message: 'Successfully connected to GEMINI!' });
  });

  it('surfaces a cloud failure message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ success: false, error: 'Invalid API key' }, 400))
    );

    const result = await testProviderConnection({ provider: 'openai', apiKey: 'bad' });

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Invalid API key');
  });
});
