import { describe, it, expect } from 'vitest';
import { sanitizePipelineConfig } from './pipelineConfig';
import { DEFAULT_PIPELINE_CONFIG } from '../pipeline/stages';

describe('sanitizePipelineConfig', () => {
  it('keeps a valid stored config as-is', () => {
    const stored = { judge: false, impower: 'off', reviewer: 'off' };
    const config = sanitizePipelineConfig(stored);
    expect(config.judge).toBe(false);
    expect(config.impower).toBe('off');
    expect(config.reviewer).toBe('off');
  });

  it('falls back to defaults for a missing or broken value', () => {
    expect(sanitizePipelineConfig(null)).toEqual(DEFAULT_PIPELINE_CONFIG);
    expect(sanitizePipelineConfig(undefined)).toEqual(DEFAULT_PIPELINE_CONFIG);
    expect(sanitizePipelineConfig('nonsense')).toEqual(DEFAULT_PIPELINE_CONFIG);
    expect(sanitizePipelineConfig({ judge: 'yes' }).judge).toBe(DEFAULT_PIPELINE_CONFIG.judge);
  });

  it('never lets a damaged value silently re-enable a stage', () => {
    // These are the shapes that made "off" read as enabled: an absent key and
    // an unrecognised level.
    expect(sanitizePipelineConfig({}).impower).toBe(DEFAULT_PIPELINE_CONFIG.impower);
    expect(sanitizePipelineConfig({ impower: 'ultra' }).impower).toBe(
      DEFAULT_PIPELINE_CONFIG.impower
    );
    expect(sanitizePipelineConfig({ reviewer: 'brutal' }).reviewer).toBe(
      DEFAULT_PIPELINE_CONFIG.reviewer
    );
  });

  it('keeps a stored length target, defaulting only when absent', () => {
    expect(sanitizePipelineConfig({ lengthTarget: 'short' }).lengthTarget).toBe('short');
    expect(sanitizePipelineConfig({}).lengthTarget).toBe(DEFAULT_PIPELINE_CONFIG.lengthTarget);
  });

  it('repairs array and number fields', () => {
    const config = sanitizePipelineConfig({
      targetFormats: 'inline-en',
      languages: ['en', 'zz', 'id'],
      targetWords: -5,
    });
    expect(config.targetFormats).toEqual(DEFAULT_PIPELINE_CONFIG.targetFormats);
    expect(config.languages).toEqual(['en', 'id']);
    expect(config.targetWords).toBe(DEFAULT_PIPELINE_CONFIG.targetWords);
  });

  // An empty selection is a real UI state now — the format picker's "Deselect
  // All" produces it — so it must survive the round trip. Running with nothing
  // selected is prevented where it matters: the Generate button is disabled at
  // zero formats, so a damaged/non-array value is still repaired to defaults.
  it('keeps an explicit empty format selection', () => {
    expect(sanitizePipelineConfig({ targetFormats: [] }).targetFormats).toEqual([]);
  });

  it('repairs a missing or non-array format list to the defaults', () => {
    expect(sanitizePipelineConfig({}).targetFormats).toEqual(
      DEFAULT_PIPELINE_CONFIG.targetFormats
    );
  });
});