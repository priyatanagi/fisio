/**
 * Structural guarantees every rendered format must satisfy, applied after the
 * Designer returns.
 *
 * The model chooses the CSS, so these rules are enforced in code rather than
 * requested in a prompt: a prompt asks, this module guarantees. Every problem it
 * solves was visible in real output -- a light grey page painted onto the
 * article root, one language shipping a header block the other did not, and the
 * reading measure applied to the article root so the text ran out at 68ch while
 * the rest of the page stayed empty.
 */

/** Elements that carry the whole article, so their width and background are the page's. */
const ROOT_ELEMENTS = 'article|body|main';

/** `background`, `background-color` and `background-image`, with any spacing. */
const BACKGROUND_DECLARATION = /^background(-color|-image)?\s*:/i;

/** `max-width`, `width` and `margin`, which decide how wide the page renders. */
const BOX_DECLARATION = /^(max-?width|width|margin)\s*:/i;

/** Selectors that paint or size the page rather than a component inside it. */
const PAGE_SELECTOR = /^(html|body|:root|article|main)$/i;

function declarationsOf(style: string): string[] {
  return style
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean);
}

function isPageSelector(selector: string, classes: string[]): boolean {
  return (
    PAGE_SELECTOR.test(selector) ||
    classes.some((name) => selector === `.${name}` || selector.startsWith(`.${name}:`))
  );
}

/**
 * Rewrite one stylesheet rule so the page-level selectors in it lose the
 * declarations that belong to the page alone.
 *
 * A rule like `body, article, p` sets typography on everything but also caps the
 * page width. Dropping the whole rule would lose the typography, and keeping it
 * unchanged is what squeezed the text into 68ch, so the rule is split: the page
 * selectors keep everything but the page declarations, and the rest keep
 * everything.
 */
function splitRule(
  selectorGroup: string,
  body: string,
  classes: string[],
  drop: (declaration: string) => boolean
): string {
  const declarations = declarationsOf(body);
  const pageSelectors: string[] = [];
  const innerSelectors: string[] = [];
  for (const selector of selectorGroup.split(',').map((s) => s.trim()).filter(Boolean)) {
    (isPageSelector(selector, classes) ? pageSelectors : innerSelectors).push(selector);
  }

  const rules: string[] = [];
  if (pageSelectors.length > 0) {
    const kept = declarations.filter((declaration) => !drop(declaration));
    rules.push(`${pageSelectors.join(', ')}{${kept.join('; ')}}`);
  }
  if (innerSelectors.length > 0) {
    rules.push(`${innerSelectors.join(', ')}{${declarations.join('; ')}}`);
  }
  return rules.join('\n');
}

function rewriteStylesheet(
  html: string,
  classes: string[],
  drop: (declaration: string) => boolean
): string {
  return html.replace(
    /<style\b[^>]*>([\s\S]*?)<\/style>/gi,
    (block, css: string) =>
      `<style>${css.replace(/([^{}]+)\{([^{}]*)\}/g, (rule, selectorGroup: string, body: string) =>
        splitRule(selectorGroup, body, classes, drop)
      )}</style>`
  );
}

/** The classes on the article root, so its stylesheet rule can be found later. */
function rootClasses(html: string): string[] {
  const match = html.match(/<article\b([^>]*)>/i);
  if (!match) return [];
  const classAttr = match[1].match(/\sclass="([^"]*)"/i);
  if (!classAttr) return [];
  return classAttr[1].split(/\s+/).filter(Boolean);
}

/** Strip declarations from the article root's own style attribute. */
function stripRootInlineStyle(html: string, drop: (declaration: string) => boolean): string {
  return html.replace(
    new RegExp(`<(${ROOT_ELEMENTS})\\b([^>]*)>`, 'i'),
    (match, tag: string, attrs: string) => {
      const styleMatch = attrs.match(/\sstyle="([^"]*)"/i);
      if (!styleMatch) return match;
      const cleaned = declarationsOf(styleMatch[1])
        .filter((declaration) => !drop(declaration))
        .join('; ');
      const rebuilt = attrs.replace(/\sstyle="[^"]*"/i, ` style="${cleaned}"`);
      return `<${tag}${rebuilt}>`;
    }
  );
}

/**
 * Strip the page background from the article so it inherits whatever surface
 * the host page provides. The brand background token still applies to callouts,
 * table headers and FAQ cards, which are components rather than the page.
 */
export function stripRootBackground(html: string): string {
  if (!html) return html;
  const drop = (declaration: string) => BACKGROUND_DECLARATION.test(declaration);
  return rewriteStylesheet(stripRootInlineStyle(html, drop), rootClasses(html), drop);
}

/**
 * Let the article fill the width it is given.
 *
 * The reading measure belongs on the paragraphs, not on the article: capping the
 * root left every article ending at 68 characters wide inside a full-width
 * container, with the remaining space empty. Paragraph-level rules are untouched,
 * so the measure still applies where it is meant to.
 */
export function stripRootWidth(html: string): string {
  if (!html) return html;
  const drop = (declaration: string) => BOX_DECLARATION.test(declaration);
  return rewriteStylesheet(stripRootInlineStyle(html, drop), rootClasses(html), drop);
}

/** The opening `<header ...>` tag of a render, with its style, or null. */
function headerOpenTag(html: string): string | null {
  const match = html.match(/<header\b[^>]*>/i);
  return match ? match[0] : null;
}

/**
 * Give a language variant the same header block as its sibling.
 *
 * The Designer renders each language independently, so one of them can drop the
 * `<header>` and ship a bare `<h1>`. Copying the sibling's opening tag makes
 * both languages carry identical header styling; the text stays the model's, so
 * it is still written natively in its own language.
 */
export function alignHeaderWithReference(html: string, referenceHtml?: string): string {
  const reference = headerOpenTag(referenceHtml ?? '');
  if (!reference) return html;

  const existing = html.match(/<header\b[^>]*>/i);
  if (existing) {
    // Already has a header: restyle it to match the reference exactly.
    return html.replace(existing[0], reference);
  }

  const h1 = html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/i);
  if (!h1) return html;
  return html.replace(h1[0], `${reference}${h1[0]}</header>`);
}

/**
 * Every tag name in document order. Two languages of the same article should
 * produce the same sequence, so a difference here is real structural drift
 * rather than a difference in wording.
 */
export function structureSignature(html: string): string[] {
  const body = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  return Array.from(body.matchAll(/<([a-z][a-z0-9]*)\b/gi)).map((match) => match[1].toLowerCase());
}

/** The structural elements `target` is missing that `reference` has. */
export function structuralGaps(referenceHtml: string, targetHtml: string): string[] {
  const reference = structureSignature(referenceHtml);
  const target = new Set(structureSignature(targetHtml));
  return [...new Set(reference.filter((tag) => !target.has(tag)))];
}

/**
 * The full post-process for one rendered format: no page background, the full
 * container width, and the same header block as the reference render when one is
 * supplied.
 */
export function normalizeRenderedHtml(html: string, referenceHtml?: string): string {
  return alignHeaderWithReference(stripRootWidth(stripRootBackground(html)), referenceHtml);
}