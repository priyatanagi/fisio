import type { DesignRules } from '../types/profile';
import { readToken, withTokenDefaults, type Token } from './designTokens';

/**
 * WCAG 2.1 contrast helpers.
 *
 * A palette can be perfectly on-brand and still unreadable, and nothing in the
 * pipeline would notice: the Designer prompt only asks for colours, it does not
 * check legibility. This computes the ratio so an unreadable pairing can be
 * surfaced at save time rather than discovered in a published article.
 */

export interface ContrastPair {
  /** Human label for the pairing. */
  label: string;
  /** Token keys involved, in reading order. */
  foreground: string;
  background: string;
  ratio: number;
  /** Body text needs 4.5:1 under WCAG AA. */
  required: number;
  passes: boolean;
}

export type ContrastSeverity = 'error' | 'warning';

export interface ContrastIssue extends ContrastPair {
  severity: ContrastSeverity;
  advice: string;
}

/** Relative luminance per WCAG 2.1. */
export function relativeLuminance(hex: string): number {
  const clean = String(hex ?? '').trim().replace('#', '');
  if (!/^[0-9a-f]{3,8}$/i.test(clean)) return 0;
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean.slice(0, 6);
  const channels = [0, 2, 4].map((i) => {
    const value = parseInt(full.slice(i, i + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [light, dark] = la >= lb ? [la, lb] : [lb, la];
  return (light + 0.05) / (dark + 0.05);
}

/**
 * The pairings that actually carry reading text in a generated article.
 *
 * `mutable` names the token an auto-fix is allowed to change and `fixed` the one
 * it must not: the page background is the surface the whole kit is built on, and
 * a button label is the background colour in inverted text — so a failing button
 * is repaired by moving the primary, never by repainting the page.
 */
export interface ReadingPair {
  label: string;
  fg: string;
  bg: string;
  required: number;
  /** Token key the repair may adjust. */
  mutable: keyof DesignRules;
  /** Token key the repair must leave alone. */
  fixed: keyof DesignRules;
}

export function readingPairs(rules: DesignRules): ReadingPair[] {
  return [
    { label: 'Body text on background', fg: rules.textColor, bg: rules.backgroundColor, required: 4.5, mutable: 'textColor', fixed: 'backgroundColor' },
    { label: 'Headings on background', fg: rules.secondaryColor, bg: rules.backgroundColor, required: 4.5, mutable: 'secondaryColor', fixed: 'backgroundColor' },
    { label: 'Links on background', fg: rules.primaryColor, bg: rules.backgroundColor, required: 4.5, mutable: 'primaryColor', fixed: 'backgroundColor' },
    { label: 'Button label on primary', fg: rules.backgroundColor, bg: rules.primaryColor, required: 4.5, mutable: 'primaryColor', fixed: 'backgroundColor' },
    { label: 'Table header on background', fg: rules.secondaryColor, bg: rules.backgroundColor, required: 4.5, mutable: 'secondaryColor', fixed: 'backgroundColor' },
  ];
}

/**
 * Report every reading pairing that falls short of WCAG AA.
 *
 * A non-hex value (someone typed "red") cannot be measured, so it is reported
 * rather than silently scored as black-on-black.
 */
export function validateContrast(rules: DesignRules): ContrastIssue[] {
  const r = withTokenDefaults(rules);
  const issues: ContrastIssue[] = [];

  for (const pair of readingPairs(r)) {
    if (!isHex(pair.fg) || !isHex(pair.bg)) {
      issues.push({
        label: pair.label,
        foreground: pair.fg,
        background: pair.bg,
        ratio: 0,
        required: pair.required,
        passes: false,
        severity: 'error',
        advice: 'Use a 6-digit hex value so contrast can be checked.',
      });
      continue;
    }
    const ratio = Math.round(contrastRatio(pair.fg, pair.bg) * 100) / 100;
    if (ratio < pair.required) {
      issues.push({
        label: pair.label,
        foreground: pair.fg,
        background: pair.bg,
        ratio,
        required: pair.required,
        passes: false,
        severity: pair.required > 3 ? 'error' : 'warning',
        advice:
          `Needs ${pair.required}:1 for WCAG AA, currently ${ratio}:1. ` +
          'Darken the text or lighten the background.',
      });
    }
  }
  return issues;
}

export function isHex(value: string): boolean {
  return /^#?[0-9a-f]{6}$/i.test(String(value ?? '').trim());
}

/** A passing palette summary for the form, shown next to the swatches. */
export function contrastSummary(rules: DesignRules): {
  checked: number;
  failing: number;
  worst: { label: string; ratio: number } | null;
} {
  const issues = validateContrast(rules);
  const all = readingPairs(withTokenDefaults(rules)).map((p) => ({
    label: p.label,
    ratio: isHex(p.fg) && isHex(p.bg) ? Math.round(contrastRatio(p.fg, p.bg) * 100) / 100 : 0,
  }));
  const worst = all.reduce<typeof all[number] | null>(
    (acc, cur) => (acc === null || cur.ratio < acc.ratio ? cur : acc),
    null
  );
  return { checked: all.length, failing: issues.length, worst };
}

/**
 * Design token catalog for export/import and per-format overrides. Kept
 * separate from the CSS compiler so presets never carry rendered CSS with them.
 */
export function serializeRules(rules: DesignRules): Record<string, string> {
  const r = withTokenDefaults(rules);
  const out: Record<string, string> = {};
  for (const token of Object.keys(r) as (keyof DesignRules)[]) {
    const value = (r as unknown as Record<string, unknown>)[token];
    if (typeof value === 'string') out[token as string] = value;
  }
  return out;
}

/** Merge imported tokens over a base, ignoring unknown or non-string values. */
export function mergeRules(
  base: DesignRules,
  incoming: Record<string, unknown>,
  allowedKeys?: Set<string>
): DesignRules {
  const merged: Record<string, string> = { ...(base as unknown as Record<string, string>) };
  for (const [key, value] of Object.entries(incoming ?? {})) {
    if (allowedKeys && !allowedKeys.has(key)) continue;
    if (typeof value === 'string' && value.trim()) merged[key] = value;
  }
  return withTokenDefaults(merged as unknown as DesignRules);
}

/** Read a token that may be absent from a per-format override. */
export function readOverrideToken(
  override: Record<string, string> | undefined,
  token: Token,
  fallbackRules: DesignRules
): string {
  const value = override?.[token.key];
  return typeof value === 'string' && value.trim() ? value : readToken(fallbackRules, token);
}