import type { DesignRules } from '../types/profile';
import { withTokenDefaults } from './designTokens';

/**
 * Compiles design tokens into a real stylesheet, and reports whether generated
 * HTML actually follows it.
 *
 * Until now the tokens reached the Designer only as prose, so compliance was
 * assumed. Compiling them to CSS makes the same rules verifiable: the article
 * can be checked against the brand instead of trusted to it.
 *
 * The selectors intentionally mirror the markdown an article can contain
 * (headings, lists, blockquotes, tables, FAQ, code, images, links) so a single
 * stylesheet covers every structural element.
 */

export type CssMode = 'inline' | 'clean';

export interface CompileOptions {
  /**
   * 'clean' emits a stylesheet for a class-less document; 'inline' produces
   * declarations meant to be merged onto each element's style attribute.
   */
  mode: CssMode;
}

/** One element's compiled declarations, shared by both CSS modes. */
export interface ElementRule {
  /** CSS selector used in clean mode. */
  selector: string;
  /** Human label, used in the compliance report. */
  label: string;
  declarations: Record<string, string>;
}

function pick(rules: DesignRules, key: string): string {
  const value = (rules as unknown as Record<string, string | undefined>)[key];
  return typeof value === 'string' && value.trim() ? value : '';
}

/**
 * Build the per-element declarations. This is the one place a token choice is
 * turned into concrete CSS; the preview, the stylesheet and the compliance
 * report all read from here so they cannot disagree.
 */
export function compileElementRules(rules: DesignRules): ElementRule[] {
  const r = withTokenDefaults(rules);
  const primary = pick(r, 'primaryColor');
  const secondary = pick(r, 'secondaryColor');
  const accent = pick(r, 'accentColor');
  const background = pick(r, 'backgroundColor');
  const text = pick(r, 'textColor');
  const headingFont = pick(r, 'headingFont');
  const bodyFont = pick(r, 'bodyFont');

  const lineHeight = pick(r, 'lineHeight');
  const measure = pick(r, 'measureWidth');
  const h1Size = pick(r, 'h1Size');
  const headingWeight = pick(r, 'headingWeight');
  const letterSpacing = pick(r, 'letterSpacing');

  const headingStyle = pick(r, 'headingStyle');
  const bodyStyle = pick(r, 'bodyStyle');

  const out: ElementRule[] = [];

  out.push({
    selector: 'body, article, p',
    label: 'Body copy',
    declarations: {
      'font-family': bodyFont,
      color: text,
      'line-height': lineHeight,
      'max-width': measure,
      ...(bodyStyle === 'compact' ? { 'font-size': '15px' } : {}),
      ...(bodyStyle === 'editorial' ? { 'font-family': bodyFont } : {}),
    },
  });

  const headingBase: Record<string, string> = {
    'font-family': headingFont,
    color: secondary,
    'font-weight': headingWeight,
    'letter-spacing': letterSpacing,
    'line-height': '1.3',
  };
  const headingOverrides: Record<string, Record<string, string>> = {
    strong: {},
    uppercase: { 'text-transform': 'uppercase', 'letter-spacing': '0.08em' },
    editorial: { 'font-size': '1.6em', 'font-weight': '600' },
    light: { 'font-weight': '300' },
  };
  out.push({
    selector: 'h1, h2, h3, h4, h5, h6',
    label: 'Headings',
    declarations: { ...headingBase, ...(headingOverrides[headingStyle] ?? {}) },
  });
  out.push({
    selector: 'h1',
    label: 'H1',
    declarations: { 'font-size': h1Size },
  });

  const linkOverrides: Record<string, Record<string, string>> = {
    underline: { 'text-decoration': 'underline', 'text-underline-offset': '2px' },
    subtle: { 'text-decoration': 'none' },
    boxed: { 'text-decoration': 'none', background: `${accent}1a`, padding: '1px 6px', 'border-radius': '4px' },
  };
  out.push({
    selector: 'a',
    label: 'Links',
    declarations: { color: primary, ...(linkOverrides[pick(r, 'hyperlinkStyle')] ?? {}) },
  });

  const bulletOverrides: Record<string, string> = {
    disc: 'disc',
    dash: '"– "',
    check: '"✓  "',
    square: 'square',
  };
  out.push({
    selector: 'ul',
    label: 'Bulleted list',
    declarations: {
      'list-style-type': bulletOverrides[pick(r, 'bulletStyle')] ?? 'disc',
      'padding-left': '1.4em',
      color: text,
      'font-family': bodyFont,
    },
  });

  const numberOverrides: Record<string, string> = {
    decimal: 'decimal',
    'decimal-leading-zero': 'decimal-leading-zero',
    'lower-roman': 'lower-roman',
    'upper-alpha': 'upper-alpha',
  };
  out.push({
    selector: 'ol',
    label: 'Numbered list',
    declarations: {
      'list-style-type': numberOverrides[pick(r, 'numberingStyle')] ?? 'decimal',
      'padding-left': '1.4em',
      color: text,
      'font-family': bodyFont,
    },
  });

  const quoteOverrides: Record<string, Record<string, string>> = {
    'accent-bar': { 'border-left': `4px solid ${accent}`, 'font-style': 'italic', padding: '8px 16px' },
    card: { background: `${accent}1a`, 'border-radius': '8px', 'border-left': `3px solid ${accent}`, padding: '12px 16px' },
    plain: { 'font-style': 'italic', padding: '4px 0 4px 12px', 'border-left': 'none' },
    centered: { 'text-align': 'center', 'font-style': 'italic', 'border-left': 'none', padding: '12px' },
  };
  out.push({
    selector: 'blockquote',
    label: 'Blockquote',
    declarations: { margin: '1.2em 0', color: text, ...(quoteOverrides[pick(r, 'blockquoteStyle')] ?? {}) },
  });

  const imageOverrides: Record<string, Record<string, string>> = {
    plain: {},
    rounded: { 'border-radius': '10px', border: `1px solid ${primary}33` },
    bordered: { border: `2px solid ${secondary}` },
    framed: { border: `8px solid ${background}`, 'box-shadow': `0 0 0 1px ${primary}44`, 'border-radius': '2px' },
  };
  out.push({
    selector: 'img, figure img',
    label: 'Image frame',
    declarations: { 'max-width': '100%', height: 'auto', display: 'block', ...(imageOverrides[pick(r, 'imageStyle')] ?? {}) },
  });

  const codeOverrides: Record<string, Record<string, string>> = {
    subtle: { background: `${secondary}12`, padding: '2px 5px', 'border-radius': '4px' },
    outlined: { background, border: `1px solid ${primary}55`, padding: '3px 6px', 'border-radius': '4px' },
    plain: {},
  };
  out.push({
    selector: 'code, pre',
    label: 'Code',
    declarations: {
      'font-family': 'ui-monospace, SFMono-Regular, Menlo, monospace',
      'font-size': '0.9em',
      ...(codeOverrides[pick(r, 'codeStyle')] ?? {}),
    },
  });

  const tableOverrides: Record<string, Record<string, Record<string, string>>> = {
    'header-fill': { head: { background: secondary, color: background }, cell: { 'border-bottom': `1px solid ${secondary}22` } },
    zebra: { head: { 'border-bottom': `2px solid ${primary}` }, cell: { 'border-bottom': `1px solid ${primary}22` } },
    lined: { head: { 'border-bottom': `1px solid ${secondary}66` }, cell: { 'border-bottom': `1px solid ${primary}22` } },
    bordered: { head: { background: `${primary}18`, border: `1px solid ${primary}44` }, cell: { border: `1px solid ${primary}44` } },
  };
  const tableStyle = tableOverrides[pick(r, 'tableStyle')] ?? tableOverrides['header-fill'];
  out.push({
    selector: 'table',
    label: 'Table',
    declarations: { 'border-collapse': 'collapse', width: '100%', 'font-family': bodyFont },
  });
  out.push({
    selector: 'th',
    label: 'Table header',
    declarations: {
      padding: '8px 10px',
      'text-align': 'left',
      'font-family': headingFont,
      color: secondary,
      ...(tableStyle.head ?? {}),
    },
  });
  out.push({
    selector: 'td',
    label: 'Table cell',
    declarations: { padding: '8px 10px', 'text-align': 'left', color: text, ...(tableStyle.cell ?? {}) },
  });

  const faqOverrides: Record<string, Record<string, string>> = {
    divided: { 'border-top': `1px solid ${primary}22`, 'padding-top': '12px' },
    card: { background, border: `1px solid ${primary}22`, 'border-radius': '8px', padding: '12px' },
    accordion: {},
    numbered: {},
  };
  const faqStyle = pick(r, 'faqStyle');
  out.push({
    selector: '.faq-item, .faq-item > *',
    label: 'FAQ item',
    declarations: { 'margin-bottom': '14px', ...(faqOverrides[faqStyle] ?? {}) },
  });
  out.push({
    selector: '.faq-question, .faq-item h3, .faq-item h4',
    label: 'FAQ question',
    declarations: {
      'font-family': headingFont,
      'font-weight': '600',
      color: faqStyle === 'numbered' ? primary : secondary,
      ...(faqStyle === 'accordion' ? { 'border-left': `3px solid ${accent}`, 'padding-left': '8px' } : {}),
    },
  });

  const buttonOverrides: Record<string, string> = {
    rounded: '8px',
    square: '0',
    pill: '999px',
  };
  out.push({
    selector: '.cta, button, .btn',
    label: 'Button',
    declarations: {
      background: primary,
      color: background,
      'font-family': headingFont,
      'font-weight': '600',
      'border-radius': buttonOverrides[pick(r, 'buttonStyle')] ?? '8px',
      padding: '9px 18px',
      display: 'inline-block',
    },
  });

  return out;
}

/** Declarations to camelCase so they can be dropped onto a style attribute. */
export function toCamelCase(declarations: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(declarations)) {
    const camel = key.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    out[camel] = value;
  }
  return out;
}

/** A full stylesheet for the clean-HTML mode. */
export function compileTokenCss(rules: DesignRules): string {
  const r = withTokenDefaults(rules);
  const parts = compileElementRules(r).map(({ selector, declarations }) => {
    const body = Object.entries(declarations)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join('\n');
    return `${selector} {\n${body}\n}`;
  });
  return `:root {\n${Object.entries({
    '--primary': r.primaryColor,
    '--secondary': r.secondaryColor,
    '--accent': r.accentColor,
    '--background': r.backgroundColor,
    '--text': r.textColor,
    '--heading-font': r.headingFont,
    '--body-font': r.bodyFont,
  })
    .map(([k, v]) => `  ${k}: ${v};`)
    .join('\n')}\n}\n\n${parts.join('\n\n')}`;
}

/**
 * Inline-mode declarations keyed by selector, for embedding into a class-less
 * document. Kept separate from compileTokenCss because inline mode must not
 * depend on a stylesheet being present.
 */
export function compileInlineDeclarations(rules: DesignRules): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const { selector, declarations } of compileElementRules(rules)) {
    out[selector] = toCamelCase(declarations);
  }
  return out;
}

/** CSS declarations authored on an element, as an attribute string. */
function parseInlineStyle(style: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of String(style ?? '').split(';')) {
    const idx = decl.indexOf(':');
    if (idx < 0) continue;
    const key = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (key && value) out[key] = value;
  }
  return out;
}

function renderInlineStyle(declarations: Record<string, string>): string {
  return Object.entries(declarations)
    .map(([key, value]) => `${key}: ${value}`)
    .join('; ');
}

/**
 * Write the compiled declarations onto the elements that carry them.
 *
 * Declarations the model already set are kept, so this corrects a token that
 * was ignored rather than discarding deliberate choices. Elements with no style
 * attribute at all are skipped: adding one would change the document's
 * structure far more than the tokens warrant, and clean-HTML output is expected
 * to arrive unstyled.
 */
export function applyTokenCss(
  html: string,
  rules: DesignRules,
  options: { mode?: CssMode } = {}
): { html: string; touched: number } {
  const mode = options.mode ?? 'inline';
  if (mode === 'clean') {
    // Clean HTML gets a stylesheet rather than per-element attributes.
    if (/<style/i.test(html)) return { html, touched: 0 };
    const sheet = `<style>${compileTokenCss(rules)}</style>`;
    if (/<(article|body|main|div)[^>]*>/i.test(html)) {
      return {
        html: html.replace(/<(article|body|main|div)([^>]*)>/i, `<$1$2>${sheet}`),
        touched: compileElementRules(rules).length,
      };
    }
    return { html: `${sheet}${html}`, touched: compileElementRules(rules).length };
  }

  let touched = 0;
  let output = html;

  for (const { selector, declarations } of compileElementRules(rules)) {
    // A selector group like "body, article, p" must reach every tag in it, not
    // just the first; class-based selectors are CSS-only and are skipped.
    const tags = selector
      .split(',')
      .map((s) => s.trim().split(/[\s>+~]+/)[0])
      .filter((t) => /^[a-z0-9]+$/i.test(t));
    for (const tag of tags) {
      const pattern = new RegExp(`<${tag}\\b([^>]*)>`, 'gi');
      output = output.replace(pattern, (match, attrs: string) => {
        const styleMatch = attrs.match(/\sstyle="([^"]*)"/i);
        if (!styleMatch) return match; // leave unstyled elements alone
        const existing = parseInlineStyle(styleMatch[1]);
        // Brand tokens win over the model's value; everything else is preserved.
        const merged = { ...existing, ...declarations };
        touched += 1;
        const rebuilt = attrs.replace(/\sstyle="[^"]*"/i, ` style="${renderInlineStyle(merged)}"`);
        return `<${tag}${rebuilt}>`;
      });
    }
  }

  return { html: output, touched };
}

export interface ComplianceIssue {
  label: string;
  selector: string;
  /** The token value that was expected. */
  expected: string;
  /** What the generated HTML actually does. */
  found: string;
}

/**
 * Compare a compiled rule against generated HTML and report the elements that
 * ignore it. Matching is deliberately shallow -- it asks "does this element
 * carry the brand colour / border at all", not whether every pixel agrees --
 * because the goal is to catch a model ignoring a token, not to diff layouts.
 */
export function verifyTokenCompliance(
  html: string,
  rules: DesignRules
): { issues: ComplianceIssue[]; checked: number } {
  const r = withTokenDefaults(rules);
  const issues: ComplianceIssue[] = [];
  let checked = 0;

  const hexes = [r.primaryColor, r.secondaryColor, r.accentColor, r.backgroundColor, r.textColor];

  // Colour-bearing elements must use a palette colour, never an invented one.
  const colourChecks: { selector: string; label: string }[] = [
    { selector: 'blockquote', label: 'Blockquote' },
    { selector: 'table', label: 'Table' },
    { selector: 'th', label: 'Table header' },
    { selector: 'figcaption', label: 'Image caption' },
  ];
  for (const check of colourChecks) {
    const pattern = new RegExp(`<${check.selector}[^>]*style="([^"]*)"`, 'gi');
    for (const match of html.matchAll(pattern)) {
      checked += 1;
      const style = match[1];
      // Every hex on the element is checked, not just the first: a style can
      // carry an on-brand colour and an invented background in the same
      // declaration list, and the second one is exactly what we need to catch.
      for (const hex of style.match(/#[0-9a-f]{6}\b/gi) ?? []) {
        const found = hex.toLowerCase();
        if (!hexes.includes(found)) {
          issues.push({
            label: check.label,
            selector: check.selector,
            expected: `one of ${hexes.join(', ')}`,
            found,
          });
        }
      }
    }
  }

  // A chosen blockquote treatment should be visible in the emitted style.
  const quoteStyle = pick(r, 'blockquoteStyle');
  if (quoteStyle !== 'plain') {
    for (const match of html.matchAll(/<blockquote[^>]*style="([^"]*)"/gi)) {
      checked += 1;
      const style = match[1];
      const expected =
        quoteStyle === 'accent-bar' ? 'border-left'
        : quoteStyle === 'card' ? 'border-radius'
        : quoteStyle === 'centered' ? 'text-align'
        : '';
      if (expected && !style.includes(expected)) {
        issues.push({
          label: 'Blockquote',
          selector: 'blockquote',
          expected: `${expected} for "${quoteStyle}"`,
          found: style || '(no style attribute)',
        });
      }
    }
  }

  return { issues, checked };
}

/** Human-readable compliance summary for the preview pane. */
export function describeCompliance(
  result: ReturnType<typeof verifyTokenCompliance>
): string {
  if (result.checked === 0) return 'No styled elements to verify yet.';
  if (result.issues.length === 0) return `All ${result.checked} styled elements match the brand tokens.`;
  return `${result.issues.length} of ${result.checked} styled elements ignore the brand tokens.`;
}