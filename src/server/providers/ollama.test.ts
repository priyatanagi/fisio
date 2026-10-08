import { afterEach, describe, expect, it, vi } from 'vitest';
import { callOllama } from './ollama';
import { ProviderCallError } from '../providerCore';

async function captureError(promise: Promise<unknown>): Promise<ProviderCallError> {
  try {
    await promise;
  } catch (err) {
    return err as ProviderCallError;
  }
  throw new Error('expected the call to reject');
}

function mockFetchOnce(body: unknown, ok = true, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok,
      status,
      json: async () => body,
      text: async () => JSON.stringify(body),
    }))
  );
}

const ollamaConfig = {
  provider: 'ollama' as const,
  model: 'ornith:9b',
  baseUrl: 'http://localhost:11434',
};

describe('callOllama: truncation and memory failures', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('flags a done_reason=length response as truncated', async () => {
    mockFetchOnce({ response: '{"markdownContent":"partial', done_reason: 'length', model: 'ornith:9b' });
    const result = await callOllama('write something', ollamaConfig);
    expect(result.truncated).toBe(true);
  });

  it('leaves truncated unset when the model finished on its own', async () => {
    mockFetchOnce({ response: '{"markdownContent":"complete"}', done_reason: 'stop', model: 'ornith:9b' });
    const result = await callOllama('write something', ollamaConfig);
    expect(result.truncated).toBe(false);
  });

  it('sends an explicit num_predict so the output ceiling is not machine-dependent', async () => {
    mockFetchOnce({ response: '{}', done_reason: 'stop', model: 'ornith:9b' });
    await callOllama('write something', ollamaConfig);
    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.options.num_predict).toBeGreaterThanOrEqual(4096);
  });

  it('uses the configured base URL without any server environment fallback', async () => {
    mockFetchOnce({ response: '{}', done_reason: 'stop', model: 'ornith:9b' });
    await callOllama('write something', { ...ollamaConfig, baseUrl: 'http://gpu-box:11434/' });
    const url = (globalThis.fetch as any).mock.calls[0][0];
    expect(url).toBe('http://gpu-box:11434/api/generate');
  });

  it('turns a CUDA out-of-memory body into a non-recoverable VRAM message', async () => {
    mockFetchOnce(
      { error: 'llama-server startup failed: llama-server reported out-of-memory during startup: CUDA error: out of memory' },
      false,
      500
    );
    const error = await captureError(
      callOllama('write something', { ...ollamaConfig, model: 'qwen3.6:35b' })
    );

    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error.recoverable).toBe(false);
    expect(error.message).toContain('could not load');
    expect(error.message).toContain('qwen3.6:35b');
    expect(error.message).toContain('smaller model');
  });

  it('still reports non-OOM HTTP failures with their status', async () => {
    mockFetchOnce({ error: 'model not found' }, false, 404);
    const error = await captureError(callOllama('write something', ollamaConfig));
    expect(error).toBeInstanceOf(ProviderCallError);
    expect(error.message).toContain('404');
  });
});
