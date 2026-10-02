import { describe, it, expect } from 'vitest';
import { calculateReadability, readabilityFromText } from './readability';

const prose =
  'The quick brown fox jumps over the lazy dog. It was a bright cold day in April. ' +
  'The clocks were striking thirteen. Nobody spoke. The room was very cold.';

describe('readabilityFromText', () => {
  it('measures the plain text it is given', () => {
    const m = readabilityFromText(prose, 'en');
    expect(m.wordCount).toBeGreaterThan(20);
    expect(m.fleschReadingEase).toBeGreaterThanOrEqual(0);
    expect(m.fleschReadingEase).toBeLessThanOrEqual(100);
  });

  it('returns zeros and a no-content label for empty text', () => {
    const m = readabilityFromText('', 'en');
    expect(m.fleschReadingEase).toBe(0);
    expect(m.statusLabel).toBe('No content');
    expect(m.isYoastCompliant).toBe(false);
  });

  it('matches calculateReadability on equivalent html', () => {
    const html = `<p>${prose}</p>`;
    expect(readabilityFromText(prose, 'en')).toEqual(calculateReadability(html, 'en'));
  });

  it('ignores markdown markers when reading a draft', () => {
    const markdown = `## Sub Judul\n\n${prose}`;
    const stripped = readabilityFromText(prose, 'en');
    // Markdown markup must not reach the measurement.
    expect(readabilityFromText(markdown.replace(/^#+.*$/gm, ''), 'en')).toEqual(stripped);
  });
});