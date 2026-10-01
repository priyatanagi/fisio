import { describe, expect, it } from 'vitest';
import { readableProviderError } from './providers';

describe('readableProviderError', () => {
  it('unwraps a Gemini-style error envelope', () => {
    const raw =
      '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary.","status":"UNAVAILABLE"}}';
    expect(readableProviderError(raw)).toBe(
      'This model is currently experiencing high demand. Spikes in demand are usually temporary. (UNAVAILABLE)'
    );
  });

  it('unwraps a nested OpenAI-compatible envelope', () => {
    expect(readableProviderError('{"error":{"message":"Invalid API key"}}')).toBe('Invalid API key');
  });

  it('leaves plain text untouched', () => {
    expect(readableProviderError('fetch failed')).toBe('fetch failed');
  });

  it('keeps JSON that carries no readable message', () => {
    const raw = '{"detail":"quota window exceeded"}';
    expect(readableProviderError(raw)).toBe(raw);
  });

  it('survives truncated or malformed bodies', () => {
    expect(readableProviderError('{"error":')).toBe('{"error":');
  });
});
