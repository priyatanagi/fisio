import { describe, expect, it } from 'vitest';
import { filterModels } from './ModelPicker';
import type { ModelInfo } from '../types/provider';

const models: ModelInfo[] = [
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash-Lite', provider: 'gemini', detail: '1049K in · 66K out' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', provider: 'gemini' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'gemini' },
];

describe('filterModels', () => {
  it('returns every model for an empty query', () => {
    expect(filterModels(models, '   ')).toHaveLength(3);
  });

  it('matches on the human-readable name', () => {
    expect(filterModels(models, 'flash lite').map((m) => m.id)).toEqual([
      'gemini-2.5-flash-lite',
      'gemini-3.1-flash-lite',
    ]);
  });

  it('matches on the id', () => {
    expect(filterModels(models, '2.5-pro')).toEqual([models[2]]);
  });

  it('requires every token to match somewhere in the entry', () => {
    expect(filterModels(models, 'pro 3.1')).toEqual([]);
  });

  it('matches capability details', () => {
    expect(filterModels(models, '1049K')).toEqual([models[0]]);
  });
});
