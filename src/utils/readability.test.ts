import { describe, it, expect } from 'vitest';
import { calculateReadability, readabilityFromText } from './readability';
import { markdownToPlainText } from './document';

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

  it('measures a markdown draft the same as its marker-free prose', () => {
    // readabilityFromText measures plain text and does not strip markdown itself;
    // markdownToPlainText is the caller's job, so markers must be gone before measuring.
    const draft = `## Sub Judul\n\nParagraf dengan **tebal** dan [tautan](https://example.com). ${prose}`;
    const markerFree = `Sub Judul Paragraf dengan tebal dan tautan. ${prose}`;
    const extracted = markdownToPlainText(draft);

    expect(extracted).not.toContain('#');
    expect(readabilityFromText(extracted, 'en')).toEqual(readabilityFromText(markerFree, 'en'));
  });

  it('counts syllables as Indonesian for a regional language tag', () => {
    const text =
      'Pemilik gym komersial harus tahu biaya kepemilikan total selama sepuluh tahun. ' +
      'Namun banyak pembeli hanya fokus pada biaya bulanan.';
    const base = readabilityFromText(text, 'id');
    expect(base.syllableCount).toBeGreaterThan(0);
    expect(readabilityFromText(text, 'id-ID')).toEqual(base);
  });
});