import { describe, expect, it } from 'vitest';
import { suggestContrastFixes } from './contrastFixes';
import { DEFAULT_USER_PROFILE } from '../types/profile';
import { contrastRatio, validateContrast } from './tokenContrast';
import type { DesignRules } from '../types/profile';

const base = DEFAULT_USER_PROFILE.designRules as DesignRules;

/**
 * The palette the Brand kit panel reports 3.58:1 for: a teal primary on the
 * default near-white page. Both the link pairing and the button label share this
 * one colour, so a single darker teal has to clear both.
 */
const teal = { ...base, primaryColor: '#0d9488' };

/** Hue is what makes a colour "the brand's"; a fix that shifts it is a different brand. */
function hueOf(hex: string): number {
  const c = hex.replace('#', '');
  const r = parseInt(c.slice(0, 2), 16) / 255;
  const g = parseInt(c.slice(2, 4), 16) / 255;
  const b = parseInt(c.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return ((h * 60) + 360) % 360;
}

describe('the reported palette', () => {
  it('measures 3.58:1, the number shown in the panel', () => {
    expect(Math.round(contrastRatio(teal.primaryColor, teal.backgroundColor) * 100) / 100).toBe(3.58);
    expect(validateContrast(teal).map((issue) => issue.label)).toEqual([
      'Links on background',
      'Button label on primary',
    ]);
  });
});

describe('suggestContrastFixes', () => {
  it('proposes one darker primary that clears both pairings', () => {
    const repair = suggestContrastFixes(teal);

    expect(repair.fixes).toHaveLength(1);
    const [fix] = repair.fixes;
    expect(fix.token).toBe('primaryColor');
    expect(fix.from).toBe('#0d9488');
    expect(fix.darkened).toBe(true);
    expect(fix.repairs).toEqual(['Links on background', 'Button label on primary']);
    expect(fix.to).toMatch(/^#[0-9a-f]{6}$/);
    expect(contrastRatio(fix.to, teal.backgroundColor)).toBeGreaterThanOrEqual(4.5);
    expect(repair.unresolved).toEqual([]);
    expect(validateContrast(repair.rules)).toEqual([]);
  });

  it('keeps the hue, so the result is still the same brand colour', () => {
    const repair = suggestContrastFixes(teal);
    const [fix] = repair.fixes;
    expect(Math.abs(hueOf(fix.to) - hueOf(fix.from))).toBeLessThan(3);
  });

  it('changes only the colour that caused the failure', () => {
    const repair = suggestContrastFixes(teal);
    expect(repair.rules.textColor).toBe(base.textColor);
    expect(repair.rules.secondaryColor).toBe(base.secondaryColor);
    // The page surface is never repainted — it is what everything else was chosen against.
    expect(repair.rules.backgroundColor).toBe(base.backgroundColor);
  });

  it('leaves a compliant palette completely alone', () => {
    const good = { ...base, primaryColor: '#7f1d1d' };
    const repair = suggestContrastFixes(good);
    expect(repair.fixes).toEqual([]);
    expect(repair.unresolved).toEqual([]);
    expect(repair.rules.primaryColor).toBe('#7f1d1d');
  });

  it('lightens the text when the page background is dark', () => {
    const dark = { ...base, backgroundColor: '#0f1115', textColor: '#1f2937' };
    const repair = suggestContrastFixes(dark);

    const text = repair.fixes.find((fix) => fix.token === 'textColor');
    expect(text).toBeDefined();
    expect(text!.darkened).toBe(false);
    expect(contrastRatio(text!.to, '#0f1115')).toBeGreaterThanOrEqual(4.5);
  });

  it('reports colours it cannot read instead of pretending to fix them', () => {
    const named = { ...teal, textColor: 'red' };
    const repair = suggestContrastFixes(named);

    expect(repair.unresolved).toContain('Body text on background');
    // Everything measurable is still repaired.
    expect(repair.fixes.map((fix) => fix.token)).toContain('primaryColor');
  });

  it('never emits a colour that is not a plain 6-digit hex', () => {
    const repair = suggestContrastFixes({ ...teal, secondaryColor: '#abc' });
    for (const fix of repair.fixes) expect(fix.to).toMatch(/^#[0-9a-f]{6}$/);
    expect(repair.unresolved).toContain('Headings on background');
  });
});
