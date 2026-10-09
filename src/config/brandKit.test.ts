import { describe, expect, it } from 'vitest';
import { contrastRatio, isHex, relativeLuminance, validateContrast, mergeRules, serializeRules } from './tokenContrast';
import { applyTokenCss, compileElementRules, compileInlineDeclarations, compileTokenCss, verifyTokenCompliance, describeCompliance } from './tokenCss';
import {
  BRAND_PRESETS,
  applyPreset,
  clearFormatOverride,
  diffRules,
  exportPreset,
  importPreset,
  rulesForFormat,
  setFormatOverride,
} from './brandPresets';
import { DEFAULT_USER_PROFILE } from '../types/profile';
import { withTokenDefaults } from './designTokens';
import type { DesignRules } from '../types/profile';

// Resolved, so tests compare against the value a token actually carries rather
// than an optional field that is undefined until it is read through the catalog.
const base = withTokenDefaults(DEFAULT_USER_PROFILE.designRules);

describe('contrast math', () => {
  it('computes known WCAG ratios', () => {
    expect(Math.round(contrastRatio('#000000', '#ffffff') * 100) / 100).toBe(21);
    expect(Math.round(contrastRatio('#ffffff', '#ffffff') * 100) / 100).toBe(1);
  });

  it('is symmetric', () => {
    expect(contrastRatio('#333940', '#f8fafc')).toBeCloseTo(contrastRatio('#f8fafc', '#333940'), 5);
  });

  it('gives black the lowest luminance and white the highest', () => {
    expect(relativeLuminance('#000000')).toBe(0);
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 3);
  });

  it('expands three-digit shorthand', () => {
    expect(relativeLuminance('#fff')).toBeCloseTo(relativeLuminance('#ffffff'), 5);
  });

  it('validates hex shape', () => {
    expect(isHex('#AABBCC')).toBe(true);
    expect(isHex('red')).toBe(false);
    expect(isHex('#abc')).toBe(false);
  });
});

describe('validateContrast', () => {
  it('passes the shipped default palette', () => {
    expect(validateContrast(base)).toEqual([]);
  });

  it('flags text on an unreadable background', () => {
    const issues = validateContrast({ ...base, textColor: '#f8fafc' });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.label.includes('Body text'))).toBe(true);
  });

  it('reports the ratio so the user can see how bad it is', () => {
    const issues = validateContrast({ ...base, textColor: '#f8fafc' });
    expect(issues[0].ratio).toBeGreaterThan(0);
    expect(issues[0].advice).toMatch(/WCAG AA/);
  });

  it('reports a non-hex value rather than scoring it as unreadable', () => {
    const issues = validateContrast({ ...base, textColor: 'not-a-colour' });
    expect(issues[0].advice).toMatch(/6-digit hex/);
  });

  it('resolves defaults for a legacy profile', () => {
    const legacy = { ...base, tableStyle: undefined } as unknown as DesignRules;
    expect(() => validateContrast(legacy)).not.toThrow();
  });
});

describe('compileTokenCss', () => {
  it('emits a rule for every structural element', () => {
    const selectors = compileElementRules(base).map((r) => r.selector).join(' ');
    for (const el of ['h1', 'blockquote', 'table', 'th', 'ul', 'ol', 'code', 'img', 'a']) {
      expect(selectors).toContain(el);
    }
  });

  it('produces a stylesheet carrying the palette', () => {
    const css = compileTokenCss(base);
    expect(css).toContain('--primary: #cc2929');
    expect(css).toContain('blockquote {');
  });

  it('reflects the blockquote choice', () => {
    const card = compileElementRules({ ...base, blockquoteStyle: 'card' }).find(
      (r) => r.selector === 'blockquote'
    )!;
    expect(card.declarations['border-radius']).toBe('8px');
  });

  it('reflects the table choice', () => {
    const bordered = compileElementRules({ ...base, tableStyle: 'bordered' }).find(
      (r) => r.selector === 'td'
    )!;
    expect(bordered.declarations.border).toBeDefined();
  });

  it('reflects the image frame choice', () => {
    const framed = compileElementRules({ ...base, imageStyle: 'framed' }).find(
      (r) => r.selector.includes('img')
    )!;
    expect(framed.declarations.border).toContain('8px');
  });

  it('emits camelCase declarations for inline mode', () => {
    const inline = compileInlineDeclarations(base);
    const blockquote = inline['blockquote'];
    expect(blockquote['borderLeft']).toBeDefined();
    expect(blockquote['border-left']).toBeUndefined();
  });

  it('uses the typography tokens for leading and paragraph alignment', () => {
    const body = compileElementRules({ ...base, lineHeight: '1.9', textAlignment: 'justify' }).find(
      (r) => r.selector.includes('p')
    )!;
    expect(body.declarations['line-height']).toBe('1.9');
    expect(body.declarations['text-align']).toBe('justify');
  });
});

describe('verifyTokenCompliance', () => {
  it('reports nothing when no styled elements exist', () => {
    const result = verifyTokenCompliance('<p>plain</p>', base);
    expect(result.checked).toBe(0);
    expect(describeCompliance(result)).toMatch(/No styled elements/);
  });

  it('passes HTML that stays on palette', () => {
    const html = '<blockquote style="color:#333940;border-left:4px solid #cc2929">q</blockquote>';
    const result = verifyTokenCompliance(html, base);
    expect(result.issues).toEqual([]);
  });

  it('catches an invented colour', () => {
    const html = '<blockquote style="color:#abcdef;border-left:4px solid #cc2929">q</blockquote>';
    const result = verifyTokenCompliance(html, base);
    expect(result.issues[0].found).toBe('#abcdef');
  });

  it('catches an invented colour hiding after an on-brand one', () => {
    // Regression: only inspecting the first hex let this through.
    const html = '<th style="color:#cc2929;background:#eeeeee">h</th>';
    const result = verifyTokenCompliance(html, base);
    expect(result.issues.map((i) => i.found)).toContain('#eeeeee');
  });

  it('catches a blockquote that ignores the chosen treatment', () => {
    const html = '<blockquote style="color:#333940">q</blockquote>';
    const result = verifyTokenCompliance(html, { ...base, blockquoteStyle: 'accent-bar' });
    expect(result.issues.some((i) => i.expected.includes('border-left'))).toBe(true);
  });

  it('summarises failure in words', () => {
    const result = verifyTokenCompliance('<blockquote style="color:#abcdef">q</blockquote>', base);
    expect(describeCompliance(result)).toMatch(/ignore the brand tokens/);
  });
});

describe('presets', () => {
  it('ships readable presets', () => {
    for (const preset of BRAND_PRESETS) {
      expect(validateContrast(preset.rules)).toEqual([]);
    }
  });

  it('applies a preset over the current rules', () => {
    const applied = applyPreset(base, 'clinical-calm');
    expect(applied.primaryColor).toBe('#0f766e');
    expect(applied.faqStyle).toBe('card');
  });

  it('ignores an unknown preset id', () => {
    expect(applyPreset(base, 'nope').primaryColor).toBe(base.primaryColor);
  });

  it('round-trips export through import', () => {
    const kit = exportPreset('Test kit', { ...base, faqStyle: 'accordion' });
    const json = JSON.stringify({ name: kit.name, rules: kit.rules });
    const result = importPreset(json);
    expect(result.error).toBeUndefined();
    expect(result.preset!.rules.faqStyle).toBe('accordion');
  });

  it('rejects malformed JSON with a readable message', () => {
    expect(importPreset('{oops').error).toMatch(/not valid JSON/);
  });

  it('rejects JSON without tokens', () => {
    expect(importPreset('{"name":"x"}').error).toMatch(/No design tokens/);
  });

  it('drops unknown keys on import', () => {
    const result = importPreset(JSON.stringify({ rules: { faqStyle: 'card', bogusKey: 'x' } }));
    expect(result.preset!.rules).not.toHaveProperty('bogusKey');
  });
});

describe('per-format overrides', () => {
  it('returns base rules when a format has no override', () => {
    expect(rulesForFormat(base, {}, 'inline-en').faqStyle).toBe(base.faqStyle);
  });

  it('applies an override for one format only', () => {
    const overrides = setFormatOverride({}, 'clean-en', 'tableStyle', 'zebra');
    expect(rulesForFormat(base, overrides, 'clean-en').tableStyle).toBe('zebra');
    expect(rulesForFormat(base, overrides, 'inline-en').tableStyle).toBe(base.tableStyle);
  });

  it('clears an override by setting it blank', () => {
    const overrides = setFormatOverride({}, 'clean-en', 'tableStyle', 'zebra');
    const cleared = setFormatOverride(overrides, 'clean-en', 'tableStyle', '');
    expect(cleared['clean-en']).toBeUndefined();
  });

  it('removes a whole format', () => {
    const overrides = setFormatOverride({}, 'clean-id', 'faqStyle', 'card');
    expect(clearFormatOverride(overrides, 'clean-id')).toEqual({});
  });

  it('refuses to override the brand colour', () => {
    const overrides = setFormatOverride({}, 'clean-en', 'primaryColor', '#000000');
    expect(rulesForFormat(base, overrides, 'clean-en').primaryColor).toBe(base.primaryColor);
  });
});

describe('diffRules', () => {
  it('finds nothing when nothing changed', () => {
    expect(diffRules(base, { ...base })).toEqual([]);
  });

  it('names the changed token and both values', () => {
    const diffs = diffRules(base, { ...base, faqStyle: 'card' });
    expect(diffs).toHaveLength(1);
    expect(diffs[0].label).toBe('FAQ');
    expect(diffs[0].from).toBe(base.faqStyle);
    expect(diffs[0].to).toBe('card');
  });

  it('detects a change to the typography scale', () => {
    expect(diffRules(base, { ...base, lineHeight: '2' }).length).toBeGreaterThan(0);
  });
});

describe('applyTokenCss', () => {
  const styled = '<article><p style="color:#111">Body</p><blockquote style="color:#222">Quote</blockquote></article>';

  it('writes compiled declarations onto styled elements', () => {
    const { html, touched } = applyTokenCss(styled, base);
    expect(touched).toBe(2);
    expect(html).toContain('font-family');
  });

  it('leaves elements with no style attribute untouched', () => {
    const bare = '<article><h2>No style</h2></article>';
    const { html, touched } = applyTokenCss(bare, base);
    expect(touched).toBe(0);
    expect(html).toBe(bare);
  });

  it('preserves declarations the model set that are not tokens', () => {
    const { html } = applyTokenCss('<p style="padding:12px;text-indent:4px">x</p>', base);
    expect(html).toContain('padding: 12px');
    expect(html).toContain('text-indent: 4px');
  });

  it('lets the paragraph alignment token override the model value', () => {
    const { html } = applyTokenCss('<p style="text-align:center">x</p>', base);
    expect(html).toContain(`text-align: ${base.textAlignment}`);
  });

  it('makes brand tokens win over the model value', () => {
    const { html } = applyTokenCss('<p style="color:#abcdef">x</p>', base);
    expect(html).toContain(base.textColor);
  });

  it('injects a stylesheet in clean mode', () => {
    const { html, touched } = applyTokenCss('<article><p>x</p></article>', base, { mode: 'clean' });
    expect(html).toContain('<style>');
    expect(touched).toBeGreaterThan(0);
  });

  it('does not inject a second stylesheet', () => {
    const once = applyTokenCss('<article><p>x</p></article>', base, { mode: 'clean' }).html;
    const twice = applyTokenCss(once, base, { mode: 'clean' }).html;
    expect((twice.match(/<style>/g) ?? []).length).toBe(1);
  });

  it('lets the brand sheet outrank a stylesheet the model wrote', () => {
    const authored =
      '<style>:root{--body-font: Georgia, serif} p{font-family: Georgia, serif}</style>' +
      '<article><p>x</p></article>';
    const { html, touched } = applyTokenCss(authored, base, { mode: 'clean' });
    expect(touched).toBeGreaterThan(0);
    expect((html.match(/<style>/g) ?? []).length).toBe(2);
    // Last sheet wins for element rules of equal specificity.
    expect(html.indexOf(base.bodyFont)).toBeGreaterThan(html.indexOf('Georgia'));
    expect(applyTokenCss(html, base, { mode: 'clean' }).html).toBe(html);
  });

  it('makes compliance pass after enforcement', () => {
    const offBrand = '<blockquote style="color:#abcdef">q</blockquote>';
    expect(verifyTokenCompliance(offBrand, base).issues.length).toBeGreaterThan(0);
    const enforced = applyTokenCss(offBrand, base).html;
    expect(verifyTokenCompliance(enforced, base).issues.length).toBe(0);
  });
});

describe('rule serialization', () => {
  it('serializes only string tokens', () => {
    const out = serializeRules(base);
    expect(Object.values(out).every((v) => typeof v === 'string')).toBe(true);
    expect(out.primaryColor).toBe(base.primaryColor);
  });

  it('mergeRules ignores blank and non-string values', () => {
    const merged = mergeRules(base, { faqStyle: 'card', tableStyle: '  ', faqStyle2: 5 });
    expect(merged.faqStyle).toBe('card');
    expect(merged.tableStyle).toBe(base.tableStyle);
  });
});
