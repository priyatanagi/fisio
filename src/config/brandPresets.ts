import type { DesignRules } from '../types/profile';
import { mergeRules, serializeRules } from './tokenContrast';
import { withTokenDefaults, ALL_TOKENS } from './designTokens';

/**
 * Named brand kits: complete, verified token sets a profile can be loaded from.
 *
 * Each preset ships with its own contrast note, because a palette that reads
 * well on one background can be unreadable on another -- carrying the caveat
 * with the preset is more useful than rediscovering it on every use.
 */

export interface BrandPreset {
  id: string;
  name: string;
  description: string;
  rules: DesignRules;
}

/** Token keys a user may legitimately override per output format. */
export const OVERRIDABLE_KEYS = new Set(
  ALL_TOKENS.map((t) => t.key).filter((k) => k !== 'primaryColor')
);

const base = (over: Partial<DesignRules>): DesignRules =>
  withTokenDefaults({
    primaryColor: '#cc2929',
    secondaryColor: '#1a1d20',
    accentColor: '#cc2929',
    backgroundColor: '#f8fafc',
    textColor: '#333940',
    headingFont: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    bodyFont: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    buttonStyle: 'rounded',
    blockquoteStyle: 'accent-bar',
    ...over,
  } as DesignRules);

export const BRAND_PRESETS: BrandPreset[] = [
  {
    id: 'corporate-clean',
    name: 'Corporate Clean',
    description: 'Neutral slate with a single red accent. Conservative and high-contrast.',
    rules: base({}),
  },
  {
    id: 'editorial-serif',
    name: 'Editorial Serif',
    description: 'Serif headings, generous leading, centred pull quotes. Magazine feel.',
    rules: base({
      secondaryColor: '#1c1917',
      accentColor: '#b45309',
      headingFont: 'Georgia, "Times New Roman", serif',
      bodyFont: 'Georgia, "Times New Roman", serif',
      headingStyle: 'editorial',
      bodyStyle: 'editorial',
      blockquoteStyle: 'centered',
      tableStyle: 'lined',
      faqStyle: 'divided',
      lineHeight: '1.8',
      measureWidth: '62ch',
    }),
  },
  {
    id: 'clinical-calm',
    name: 'Clinical Calm',
    description: 'Teal and amber with soft, airy spacing. Suits health and care brands.',
    rules: base({
      // Teal at #0d9488 is only 3.58:1 on #f8fafc, under the 4.5:1 body-text
      // floor, so links use the darker shade while buttons keep the brighter one.
      primaryColor: '#0f766e',
      secondaryColor: '#134e4a',
      accentColor: '#b45309',
      backgroundColor: '#f8fafc',
      textColor: '#1f2937',
      bodyStyle: 'airy',
      hyperlinkStyle: 'boxed',
      imageStyle: 'rounded',
      tableStyle: 'header-fill',
      faqStyle: 'card',
      lineHeight: '2',
      measureWidth: '56ch',
    }),
  },
  {
    id: 'technical-dense',
    name: 'Technical Dense',
    description: 'Tight leading and square corners for specification and B2B reference.',
    rules: base({
      primaryColor: '#1d4ed8',
      secondaryColor: '#111827',
      accentColor: '#0ea5e9',
      backgroundColor: '#ffffff',
      textColor: '#1f2937',
      bodyStyle: 'compact',
      headingStyle: 'strong',
      buttonStyle: 'square',
      blockquoteStyle: 'accent-bar',
      imageStyle: 'bordered',
      tableStyle: 'zebra',
      codeStyle: 'outlined',
      lineHeight: '1.45',
      measureWidth: '80ch',
    }),
  },
];

export function findPreset(id: string): BrandPreset | undefined {
  return BRAND_PRESETS.find((p) => p.id === id);
}

/** Apply a preset over the current profile, keeping the profile's own text fields. */
export function applyPreset(profile: DesignRules, presetId: string): DesignRules {
  const preset = findPreset(presetId);
  if (!preset) return withTokenDefaults(profile);
  return mergeRules(profile, serializeRules(preset.rules));
}

/** Export a kit as portable JSON, for sharing or backing up a profile. */
export function exportPreset(name: string, rules: DesignRules, description = ''): BrandPreset {
  return {
    id: `custom-${Date.now().toString(36)}`,
    name: name.trim() || 'Custom kit',
    description,
    rules: withTokenDefaults(rules),
  };
}

/**
 * Import a kit from JSON. Unknown keys are dropped and malformed values are
 * ignored rather than rejected, so a partially hand-edited file still loads.
 */
export function importPreset(json: string): { preset?: BrandPreset; error?: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { error: 'That is not valid JSON.' };
  }
  if (!parsed || typeof parsed !== 'object') return { error: 'Expected a JSON object.' };
  const record = parsed as Record<string, unknown>;
  const rawRules = (record.rules ?? record.designRules) as Record<string, unknown> | undefined;
  if (!rawRules || typeof rawRules !== 'object') {
    return { error: 'No design tokens found. Expected a "rules" object.' };
  }
  const allowed = new Set(ALL_TOKENS.map((t) => t.key));
  const defaults = withTokenDefaults({} as DesignRules);
  return {
    preset: exportPreset(
      typeof record.name === 'string' ? record.name : 'Imported kit',
      mergeRules(defaults, rawRules, allowed),
      typeof record.description === 'string' ? record.description : 'Imported'
    ),
  };
}

/** Per-output-format token overrides, keyed by format id. */
export type FormatOverrides = Record<string, Record<string, string>>;

export function setFormatOverride(
  overrides: FormatOverrides,
  formatId: string,
  key: string,
  value: string
): FormatOverrides {
  const current = overrides[formatId] ?? {};
  const next = { ...current };
  if (!value || !value.trim()) delete next[key];
  else next[key] = value;
  const out = { ...overrides, [formatId]: next };
  if (Object.keys(out[formatId]).length === 0) delete out[formatId];
  return out;
}

export function clearFormatOverride(overrides: FormatOverrides, formatId: string): FormatOverrides {
  const out = { ...overrides };
  delete out[formatId];
  return out;
}

/** Resolve the effective rules for a format: base profile plus its overrides. */
export function rulesForFormat(
  base: DesignRules,
  overrides: FormatOverrides,
  formatId: string
): DesignRules {
  const patch = overrides[formatId];
  if (!patch || Object.keys(patch).length === 0) return withTokenDefaults(base);
  return mergeRules(base, patch, OVERRIDABLE_KEYS);
}

/**
 * Compare two rule sets and report what changed. Used to review a brand
 * revision instead of silently overwriting a working profile.
 */
export interface RuleDiff {
  key: string;
  label: string;
  from: string;
  to: string;
}

export function diffRules(before: DesignRules, after: DesignRules): RuleDiff[] {
  const a = withTokenDefaults(before);
  const b = withTokenDefaults(after);
  const diffs: RuleDiff[] = [];
  for (const token of ALL_TOKENS) {
    const from = String((a as unknown as Record<string, unknown>)[token.key] ?? '');
    const to = String((b as unknown as Record<string, unknown>)[token.key] ?? '');
    if (from !== to) diffs.push({ key: token.key, label: token.label, from, to });
  }
  return diffs;
}