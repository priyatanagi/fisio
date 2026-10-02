import { describe, it, expect } from 'vitest';
import { LENGTH_PRESETS, targetWordsForLengthTarget } from './defaultPrompts';

describe('targetWordsForLengthTarget', () => {
  it('drives the pipeline target from the fixed preset', () => {
    expect(targetWordsForLengthTarget('short', 950)).toBe(600);
    expect(targetWordsForLengthTarget('standard', 500)).toBe(950);
    expect(targetWordsForLengthTarget('long', 600)).toBe(1500);
  });

  it('keeps the slider value for custom', () => {
    expect(targetWordsForLengthTarget('custom', 1750)).toBe(1750);
    expect(targetWordsForLengthTarget('custom', 950)).toBe(950);
  });

  it('matches the preset words declared in LENGTH_PRESETS for fixed presets', () => {
    const fixed = LENGTH_PRESETS.filter((p) => p.id !== 'custom');
    expect(fixed).toHaveLength(3);
    for (const preset of fixed) {
      expect(targetWordsForLengthTarget(preset.id, 999)).toBe(preset.words);
    }
  });
});