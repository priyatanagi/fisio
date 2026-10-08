import {
  DEFAULT_PIPELINE_CONFIG,
  type ImpowerLevel,
  type PipelineConfig,
  type ReviewerMode,
} from '../pipeline/stages';
import type { LengthTarget } from '../types/article';

const IMPOWER_LEVELS: ImpowerLevel[] = ['off', 'lite', 'standard', 'max'];
const REVIEWER_MODES: ReviewerMode[] = ['off', 'advisory', 'strict'];
const LENGTH_TARGETS: LengthTarget[] = ['short', 'standard', 'long', 'custom'];

function pick<T>(value: unknown, allowed: T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Rebuilds a usable pipeline config from whatever was persisted.
 *
 * The raw stored object used to be trusted as-is. That let a partial or
 * hand-edited value decide whether a stage ran: a missing key fell through to
 * `undefined` (so `impower !== 'off'` read as enabled), and an unrecognised
 * value was treated as a level other than 'off' — which is how a stage the
 * user switched off could still be invoked. Every field is validated here so a
 * damaged value falls back to the default instead of silently enabling work.
 */
export function sanitizePipelineConfig(stored: unknown): PipelineConfig {
  const base = DEFAULT_PIPELINE_CONFIG;
  if (!stored || typeof stored !== 'object') return { ...base };

  const raw = stored as Partial<Record<keyof PipelineConfig, unknown>>;
  // An empty list is kept as-is: it is what the format picker's "Deselect All"
  // means, and the disabled Generate button is what stops a run with nothing
  // selected. Only a missing or non-array value falls back to the defaults.
  const targetFormats = Array.isArray(raw.targetFormats)
    ? (raw.targetFormats.filter((f) => typeof f === 'string') as PipelineConfig['targetFormats'])
    : base.targetFormats;
  const languages = Array.isArray(raw.languages)
    ? (raw.languages.filter((l) => l === 'en' || l === 'id') as PipelineConfig['languages'])
    : base.languages;

  return {
    judge: typeof raw.judge === 'boolean' ? raw.judge : base.judge,
    impower: pick(raw.impower, IMPOWER_LEVELS, base.impower),
    reviewer: pick(raw.reviewer, REVIEWER_MODES, base.reviewer),
    targetFormats,
    languages: languages.length > 0 ? languages : base.languages,
    targetWords:
      typeof raw.targetWords === 'number' && Number.isFinite(raw.targetWords) && raw.targetWords > 0
        ? Math.round(raw.targetWords)
        : base.targetWords,
    lengthTarget: pick(raw.lengthTarget, LENGTH_TARGETS, base.lengthTarget ?? 'standard'),
  };
}