import { describe, it, expect } from 'vitest';
import { applyBrandTokens } from './brandTokens';
import type { DesignRules } from '../types/profile';

const rules: DesignRules = {
  primaryColor: '#111111',
  secondaryColor: '#222222',
  accentColor: '#333333',
  backgroundColor: '#444444',
  textColor: '#555555',
  headingFont: 'Arial, sans-serif',
  bodyFont: 'Verdana, sans-serif',
  buttonStyle: 'rounded',
  blockquoteStyle: 'accent-bar',
};

describe('custom property rewriting', () => {
  it('rewrites --primary to the profile colour', () => {
    const { html } = applyBrandTokens('<style>:root{--primary:#cc2929;}</style>', rules);
    expect(html).toContain('--primary:#111111');
    expect(html).not.toContain('#cc2929');
  });

  it('rewrites --dark and --slate to secondary and text', () => {
    const { html } = applyBrandTokens('<style>:root{--dark:#1a1d20;--slate:#333940;}</style>', rules);
    expect(html).toContain('--dark:#222222');
    expect(html).toContain('--slate:#555555');
  });

  it('rewrites --bg-neutral and --border', () => {
    const { html } = applyBrandTokens(
      '<style>:root{--bg-neutral:#f8fafc;--border:#e2e8f0;}</style>',
      rules
    );
    expect(html).toContain('--bg-neutral:#444444');
    expect(html).toContain('--border:#111111');
  });

  it('is case-insensitive on hex values', () => {
    const { html } = applyBrandTokens('<style>:root{--primary:#CC2929;}</style>', rules);
    expect(html).toContain('#111111');
  });
});

describe('legacy hex mapping', () => {
  it('maps legacy brand hexes appearing in inline styles', () => {
    const { html } = applyBrandTokens('<p style="color:#cc2929">Hi</p>', rules);
    expect(html).toContain('color:#111111');
  });

  it('is case-insensitive on legacy hexes', () => {
    const { html } = applyBrandTokens('<p style="color:#1A1D20">Hi</p>', rules);
    expect(html).toContain('color:#222222');
  });

  it('does not double-map a hex already replaced', () => {
    const { html } = applyBrandTokens('<p style="color:#cc2929">x</p>', rules);
    expect(html).not.toContain('#111111;');
  });
});

describe('off-palette detection', () => {
  it('reports no warnings when only profile colours are used', () => {
    const { warnings } = applyBrandTokens('<style>:root{--primary:#111111;}</style>', rules);
    expect(warnings).toEqual([]);
  });

  it('warns about a colour outside the palette', () => {
    const { warnings } = applyBrandTokens('<p style="color:#abcdef">Hi</p>', rules);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].hex).toBe('#abcdef');
  });

  it('counts repeated occurrences of the same colour', () => {
    const { warnings } = applyBrandTokens(
      '<p style="color:#abcdef">a</p><p style="color:#abcdef">b</p>',
      rules
    );
    expect(warnings[0].occurrences).toBe(2);
  });

  it('does not treat profile colours as off-palette', () => {
    const html = [
      '#111111',
      '#222222',
      '#333333',
      '#444444',
      '#555555',
    ]
      .map((v) => `<p style="color:${v}">x</p>`)
      .join('');
    expect(applyBrandTokens(html, rules).warnings).toEqual([]);
  });

  it('ignores three-digit hex shorthand', () => {
    const { warnings } = applyBrandTokens('<p style="color:#fff">x</p>', rules);
    expect(warnings).toEqual([]);
  });
});

describe('forcePalette', () => {
  it('leaves off-palette colours untouched by default', () => {
    const { html } = applyBrandTokens('<p style="color:#abcdef">x</p>', rules);
    expect(html).toContain('#abcdef');
  });

  it('snaps an off-palette colour to the nearest profile token when forced', () => {
    const { html, warnings } = applyBrandTokens('<p style="color:#abcdef">x</p>', rules, {
      forcePalette: true,
    });
    expect(html).not.toContain('#abcdef');
    // #abcdef (171,205,239) is nearest to the lightest palette entry #555555 (85,85,85)
    // by squared RGB distance, so the forced snap must land there.
    expect(html).toContain('#555555');
    expect(warnings).toHaveLength(1);
  });
});

describe('safety', () => {
  it('leaves HTML with no styles untouched', () => {
    const input = '<article><h2>Title</h2><p>Body</p></article>';
    expect(applyBrandTokens(input, rules).html).toBe(input);
  });

  it('does not corrupt non-hex CSS values', () => {
    const { html } = applyBrandTokens('<p style="font-size:16px;margin:0 auto">x</p>', rules);
    expect(html).toContain('font-size:16px');
    expect(html).toContain('margin:0 auto');
  });
});
