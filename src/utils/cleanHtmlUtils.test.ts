import { describe, it, expect } from 'vitest';
import { isCleanHtmlIncomplete, synthesizeCleanHtml } from './cleanHtmlUtils';
import { DEFAULT_USER_PROFILE, type DesignRules } from '../types/profile';

/** A profile that is deliberately nothing like the app's own defaults. */
const rules = {
  ...DEFAULT_USER_PROFILE.designRules,
  primaryColor: '#0f766e',
  textColor: '#101010',
  headingFont: 'Georgia, serif',
  bodyFont: 'Verdana, sans-serif',
} as DesignRules;

const inlineRender =
  '<article><h2>Motor Size</h2><p style="color:#cc2929">Pick a 3.0 CHP motor for steady use.</p></article>';

describe('isCleanHtmlIncomplete', () => {
  it('calls a stubbed render incomplete', () => {
    expect(isCleanHtmlIncomplete('<article><p>...</p></article>')).toBe(true);
    expect(isCleanHtmlIncomplete(undefined)).toBe(true);
  });

  it('accepts a full article', () => {
    const full = `<article>${'<p>Sebuah kalimat yang cukup panjang untuk lolos. '.repeat(6)}</article>`;
    expect(isCleanHtmlIncomplete(full)).toBe(false);
  });
});

describe('synthesizeCleanHtml', () => {
  it('styles the fallback from the profile instead of a hardcoded brand', () => {
    const html = synthesizeCleanHtml(inlineRender, '', 'Treadmill guide', rules);
    expect(html).toContain('--primary: #0f766e');
    expect(html).toContain('--slate: #101010');
    expect(html).toContain('--body-font: Verdana, sans-serif');
    expect(html).toContain('--heading-font: Georgia, serif');
    expect(html).toContain('font-family: var(--body-font)');
    // A heading that only inherits the body font is the defect this fixes.
    expect(html).toContain('font-family: var(--heading-font)');
    expect(html).not.toContain('system-ui, -apple-system, BlinkMacSystemFont');
  });

  it('keeps the article width fluid, as the shell rules require', () => {
    const html = synthesizeCleanHtml(inlineRender, '', 'Treadmill guide', rules);
    expect(html).not.toMatch(/max-width/);
    expect(html).not.toMatch(/margin:\s*0 auto/);
  });

  it('styles the marked call to action and strips the inline attributes', () => {
    const html = synthesizeCleanHtml(
      '<article><aside class="cta"><a href="/quote">Request a quotation</a></aside></article>',
      '',
      'Treadmill guide',
      rules
    );
    expect(html).toContain('aside.cta');
    expect(html).not.toContain('style="color:#cc2929"');
    expect(html).toContain('Request a quotation');
  });

  it('keeps the FAQ schema the truncated render had already emitted', () => {
    const schema = '<script type="application/ld+json">{"@type":"FAQPage"}</script>';
    const html = synthesizeCleanHtml(inlineRender, `${schema}<article><p>x</p></article>`, 'T', rules);
    expect(html).toContain('application/ld+json');
  });

  it('falls back to the existing render when there is no inline markup to rebuild from', () => {
    expect(synthesizeCleanHtml('', '<article><p>Keep me</p></article>', 'T', rules)).toContain(
      'Keep me'
    );
  });
});
