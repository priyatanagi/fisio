import { describe, expect, it } from 'vitest';
import { readableProviderError } from './providerText';
import { isChunkableRole, planChunks, stitchChunks, buildChunkPrompt, extractChunkBody } from './chunked';

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

function countHeadings(text: string, needle: string): number {
  return text.split('\n').filter((line) => line.startsWith(needle)).length;
}

describe('chunked generation', () => {
  it('only offers chunking for the long-prose roles', () => {
    expect(isChunkableRole('creator')).toBe(true);
    expect(isChunkableRole('designer')).toBe(true);
    expect(isChunkableRole('judge')).toBe(false);
    expect(isChunkableRole('reviewer')).toBe(false);
  });

  it('plans a bounded, 1-based sequence of sections', () => {
    const plans = planChunks('creator');
    expect(plans.length).toBeGreaterThan(1);
    expect(plans.map((p) => p.index)).toEqual(plans.map((_, i) => i + 1));
    expect(plans.every((p) => p.total === plans.length)).toBe(true);
    expect(plans.every((p) => p.heading.length > 0)).toBe(true);
  });

  it('stitches every planned section into one body', () => {
    const plans = planChunks('creator');
    const bodies = plans.map((p) => `## Section ${p.index}\n\nBody ${p.index}.`);
    const stitched = stitchChunks(bodies);
    for (const plan of plans) expect(stitched).toContain(`Section ${plan.index}`);
    expect(countHeadings(stitched, '## Section')).toBe(plans.length);
  });

  it('drops empty chunks instead of leaving a gap', () => {
    const plans = planChunks('creator');
    const bodies = [plans[0], null, plans[2]].map((p) =>
      p ? `## Section ${p.index}\n\nBody ${p.index}.` : ''
    );
    const stitched = stitchChunks(bodies);
    expect(stitched).not.toContain('Section 2');
    expect(stitched).toContain('Section 3');
  });

  it('does not duplicate a heading a continued chunk repeats', () => {
    const plans = planChunks('creator');
    const first = '## Inspection Routine\n\nCheck bolts weekly.';
    const second = '## Inspection Routine\n\nTorque every anchor to spec.';
    const stitched = stitchChunks([first, second]);
    expect(countHeadings(stitched, '## Inspection Routine')).toBe(1);
    expect(stitched).toContain('Torque every anchor to spec.');
  });

  it('asks later chunks not to repeat earlier sections', () => {
    const plans = planChunks('creator');
    const later = buildChunkPrompt('creator', 'ORIGINAL PROMPT', plans[1], 'markdownContent');
    expect(later).toContain('ORIGINAL PROMPT');
    expect(later).toContain('markdownContent');
    expect(later).toMatch(/do not repeat/i);
  });

  it('unwraps the JSON envelope Ollama returns for a chunk', () => {
    expect(extractChunkBody('{"markdownContent":"## One\\n\\nBody"}', 'markdownContent')).toBe(
      '## One\n\nBody'
    );
  });

  it('accepts a chunk that answers in the clear instead of JSON', () => {
    expect(extractChunkBody('## One\n\nBody', 'markdownContent')).toBe('## One\n\nBody');
  });

  it('returns empty for a chunk that carried no usable content', () => {
    expect(extractChunkBody('{"other":"x"}', 'markdownContent')).toBe('{"other":"x"}');
    expect(extractChunkBody('   ', 'markdownContent')).toBe('');
  });
});
