import type React from 'react';
import type { DesignRules } from '../types/profile';

/**
 * Single source of truth for the design tokens a profile can configure.
 *
 * Each token declares how it renders in the live preview (React styles) AND the
 * concrete CSS handed to the Designer prompt. Keeping both on one entry is what
 * stops the preview and the generated article from drifting apart: if they
 * disagree, the user is shown a preview the AI will not reproduce.
 */

/** A design token's value is a fixed choice, not free text. */
export type ChoiceToken<K extends string = string> = {
  kind: 'choice';
  /** Key on DesignRules. */
  key: K;
  label: string;
  /** Plain-language meaning, shown as help text. */
  hint: string;
  options: { value: string; label: string }[];
  /** Default used when a stored profile predates this token. */
  fallback: string;
};

export type ColorToken<K extends string = string> = {
  kind: 'color';
  key: K;
  label: string;
  hint: string;
  fallback: string;
};

export type TextToken<K extends string = string> = {
  kind: 'text';
  key: K;
  label: string;
  hint: string;
  placeholder: string;
  fallback: string;
};

export type Token = ChoiceToken | ColorToken | TextToken;

export type TokenGroupId = 'color' | 'typography' | 'components' | 'blocks';

export interface TokenGroup {
  id: TokenGroupId;
  title: string;
  summary: string;
  tokens: Token[];
}

export const TOKEN_GROUPS: TokenGroup[] = [
  {
    id: 'color',
    title: 'Colour palette',
    summary: 'Every colour the article is allowed to use. The Designer is told never to introduce another.',
    tokens: [
      { kind: 'color', key: 'primaryColor', label: 'Primary', hint: 'Main brand colour: CTAs, links, rules.', fallback: '#cc2929' },
      { kind: 'color', key: 'secondaryColor', label: 'Secondary', hint: 'Deep companion tone for headings and panels.', fallback: '#1a1d20' },
      { kind: 'color', key: 'accentColor', label: 'Accent', hint: 'Sparse highlight for badges and emphasis.', fallback: '#cc2929' },
      { kind: 'color', key: 'backgroundColor', label: 'Background', hint: 'Page and card surface behind the text.', fallback: '#f8fafc' },
      { kind: 'color', key: 'textColor', label: 'Body text', hint: 'Default reading colour for paragraphs.', fallback: '#333940' },
    ],
  },
  {
    id: 'typography',
    title: 'Typography',
    summary: 'How the text itself is set, independent of colour.',
    tokens: [
      { kind: 'text', key: 'headingFont', label: 'Heading font', hint: 'CSS font stack for every heading level.', placeholder: 'system-ui, sans-serif', fallback: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
      { kind: 'text', key: 'bodyFont', label: 'Body font', hint: 'CSS font stack for paragraphs and lists.', placeholder: 'Inter, system-ui, sans-serif', fallback: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
      { kind: 'text', key: 'lineHeight', label: 'Line height', hint: 'Leading for running text. 1.5-1.8 suits most reading.', placeholder: '1.7', fallback: '1.7' },
      { kind: 'choice', key: 'textAlignment', label: 'Paragraph alignment', hint: 'Align paragraph text left, right, centered, or justified.', fallback: 'left', options: [
        { value: 'left', label: 'Left' },
        { value: 'right', label: 'Right' },
        { value: 'center', label: 'Center' },
        { value: 'justify', label: 'Justify' },
      ] },
      { kind: 'text', key: 'h1Size', label: 'H1 size', hint: 'Font size of the top heading.', placeholder: '32px', fallback: '2em' },
      { kind: 'text', key: 'headingWeight', label: 'Heading weight', hint: 'CSS font-weight for headings, e.g. 700.', placeholder: '700', fallback: '700' },
      { kind: 'text', key: 'letterSpacing', label: 'Letter spacing', hint: 'Tracking on headings. Negative tightens large text.', placeholder: '-0.01em', fallback: 'normal' },
      { kind: 'choice', key: 'bodyStyle', label: 'Body style', hint: 'Overall density and reading feel of running text.', fallback: 'readable', options: [
        { value: 'readable', label: 'Readable — balanced type size and generous leading' },
        { value: 'compact', label: 'Compact — tight leading, denser page' },
        { value: 'editorial', label: 'Editorial — serif body, wider leading' },
        { value: 'airy', label: 'Airy — larger type and spacious leading' },
      ] },
      { kind: 'choice', key: 'headingStyle', label: 'Heading style', hint: 'Weight, case and spacing across h1–h4.', fallback: 'strong', options: [
        { value: 'strong', label: 'Strong — bold, tight, sentence case' },
        { value: 'uppercase', label: 'Uppercase — tracked and small' },
        { value: 'editorial', label: 'Editorial — large serif display' },
        { value: 'light', label: 'Light — thin and airy' },
      ] },
    ],
  },
  {
    id: 'components',
    title: 'Inline components',
    summary: 'Leaf elements that appear inside the text flow.',
    tokens: [
      { kind: 'choice', key: 'hyperlinkStyle', label: 'Hyperlink', hint: 'How links read without relying on colour alone.', fallback: 'underline', options: [
        { value: 'underline', label: 'Underline — always underlined' },
        { value: 'subtle', label: 'Subtle — colour only, underline on hover' },
        { value: 'boxed', label: 'Boxed — light chip with border' },
      ] },
      { kind: 'choice', key: 'bulletStyle', label: 'Bulleted list', hint: 'Marker shape and indent for unordered lists.', fallback: 'disc', options: [
        { value: 'disc', label: 'Disc — filled round markers' },
        { value: 'dash', label: 'Dash — en-dash markers' },
        { value: 'check', label: 'Check — tick markers' },
        { value: 'square', label: 'Square — filled squares' },
      ] },
      { kind: 'choice', key: 'numberingStyle', label: 'Numbered list', hint: 'Marker and alignment for ordered lists.', fallback: 'decimal', options: [
        { value: 'decimal', label: 'Decimal — 1. 2. 3.' },
        { value: 'decimal-leading-zero', label: 'Padded — 01. 02. 03.' },
        { value: 'lower-roman', label: 'Roman — i. ii. iii.' },
        { value: 'upper-alpha', label: 'Letters — A. B. C.' },
      ] },
      { kind: 'choice', key: 'imageStyle', label: 'Image frame', hint: 'Border, radius and padding around figures.', fallback: 'rounded', options: [
        { value: 'plain', label: 'Plain — no frame' },
        { value: 'rounded', label: 'Rounded — radius and soft border' },
        { value: 'bordered', label: 'Bordered — square with rule' },
        { value: 'framed', label: 'Framed — matte inset with caption rule' },
      ] },
      { kind: 'choice', key: 'captionStyle', label: 'Image caption', hint: 'Typography and decoration for figure captions.', fallback: 'subtle', options: [
        { value: 'subtle', label: 'Subtle — muted text' },
        { value: 'centered', label: 'Centered — centered muted text' },
        { value: 'accent', label: 'Accent — brand-coloured text' },
        { value: 'boxed', label: 'Boxed — soft background panel' },
      ] },
      { kind: 'choice', key: 'codeStyle', label: 'Code', hint: 'Treatment of inline and block code.', fallback: 'subtle', options: [
        { value: 'subtle', label: 'Subtle — tinted background' },
        { value: 'outlined', label: 'Outlined — bordered block' },
        { value: 'plain', label: 'Plain — monospace, no chrome' },
      ] },
    ],
  },
  {
    id: 'blocks',
    title: 'Content blocks',
    summary: 'Larger structures: quotes, tables and FAQ sections.',
    tokens: [
      { kind: 'choice', key: 'blockquoteStyle', label: 'Blockquote', hint: 'Treatment of pull quotes and citations.', fallback: 'accent-bar', options: [
        { value: 'accent-bar', label: 'Accent bar — coloured left rule' },
        { value: 'card', label: 'Card — filled panel with radius' },
        { value: 'plain', label: 'Plain — italic text only' },
        { value: 'centered', label: 'Centred — pull quote, no bar' },
      ] },
      { kind: 'choice', key: 'tableStyle', label: 'Table', hint: 'Header treatment and grid for data tables.', fallback: 'header-fill', options: [
        { value: 'header-fill', label: 'Filled header row' },
        { value: 'zebra', label: 'Zebra — banded rows' },
        { value: 'lined', label: 'Lined — horizontal rules only' },
        { value: 'bordered', label: 'Bordered — full grid' },
      ] },
      { kind: 'choice', key: 'faqStyle', label: 'FAQ', hint: 'How questions and answers are separated.', fallback: 'divided', options: [
        { value: 'divided', label: 'Divided — rules between items' },
        { value: 'card', label: 'Card — each Q&A boxed' },
        { value: 'accordion', label: 'Accordion — collapsible, bold question' },
        { value: 'numbered', label: 'Numbered — sequential Q&A' },
      ] },
      { kind: 'choice', key: 'buttonStyle', label: 'Button', hint: 'Radius and weight of call-to-action buttons.', fallback: 'rounded', options: [
        { value: 'rounded', label: 'Rounded' },
        { value: 'square', label: 'Square' },
        { value: 'pill', label: 'Pill' },
      ] },
    ],
  },
];

export const ALL_TOKENS: Token[] = TOKEN_GROUPS.flatMap((group) => group.tokens);

/**
 * Read one token from a profile, falling back for profiles saved before the
 * token existed. A saved profile is user data and must never come back undefined.
 */
export function readToken(rules: DesignRules, token: Token): string {
  const value = (rules as unknown as Record<string, unknown>)[token.key];
  return typeof value === 'string' && value.trim() ? value : token.fallback;
}

/** Fills in any token a stored profile predates, without discarding user choices. */
export function withTokenDefaults(rules: DesignRules): DesignRules {
  const out = { ...rules } as Record<string, string>;
  for (const token of ALL_TOKENS) {
    const value = out[token.key];
    if (typeof value !== 'string' || !value.trim()) out[token.key] = token.fallback;
  }
  return out as unknown as DesignRules;
}

const pick = (rules: DesignRules, key: string) => readToken(rules, { key, fallback: '' } as Token);

export function customDeclarations(rules: DesignRules, key: string): Record<string, string> {
  const value = pick(rules, key);
  if (!value.startsWith('custom-css:')) return {};
  const declarations: [string, string][] = value.slice('custom-css:'.length).split(';').flatMap((declaration) => {
    const separator = declaration.indexOf(':');
    if (separator < 1) return [];
    const property = declaration.slice(0, separator).trim();
    const content = declaration.slice(separator + 1).trim();
    if (!/^(--[a-z0-9_-]+|[a-z][a-z0-9-]*)$/i.test(property) || !content || /[{}]/.test(content)) return [];
    const camelProperty = property.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase());
    return [[camelProperty, content] as [string, string]];
  });
  return Object.fromEntries(declarations);
}

/**
 * CSS for the tokens, used by the live preview. Every rule is inlined on the
 * element it applies to because the Designer is asked for inline styles in one
 * CSS mode, so the preview has to behave the same way to be trustworthy.
 */
export function previewStyles(rules: DesignRules): Record<string, React.CSSProperties> {
  const r = withTokenDefaults(rules);
  const primary = pick(r, 'primaryColor');
  const secondary = pick(r, 'secondaryColor');
  const accent = pick(r, 'accentColor');
  const background = pick(r, 'backgroundColor');
  const text = pick(r, 'textColor');
  const headingFont = pick(r, 'headingFont');
  const bodyFont = pick(r, 'bodyFont');

  const body: Record<string, string> = {
    fontFamily: bodyFont,
    fontSize: '15px',
    lineHeight: '1.7',
    width: '100%',
    'color': text,
    textAlign: pick(r, 'textAlignment'),
  };
  if (pick(r, 'bodyStyle') === 'compact') Object.assign(body, { fontSize: '13px' });
  if (pick(r, 'bodyStyle') === 'editorial') Object.assign(body, { fontSize: '16px' });
  if (pick(r, 'bodyStyle') === 'airy') Object.assign(body, { fontSize: '16px' });
  body.lineHeight = pick(r, 'lineHeight');
  Object.assign(body, customDeclarations(r, 'textAlignment'));
  Object.assign(body, customDeclarations(r, 'bodyStyle'));

  const heading: Record<string, string> = {
    fontFamily: headingFont,
    'color': secondary,
    'margin': '0 0 0.5em',
  };
  const hStyle = pick(r, 'headingStyle');
  if (hStyle === 'uppercase') Object.assign(heading, { textTransform: 'uppercase', letterSpacing: '0.08em', fontSize: '17px' });
  if (hStyle === 'editorial') Object.assign(heading, { fontSize: '26px', lineHeight: '1.2', fontWeight: '600' });
  if (hStyle === 'light') Object.assign(heading, { fontWeight: '300', fontSize: '24px' });
  if (hStyle === 'strong') Object.assign(heading, { fontSize: '20px', fontWeight: '700', lineHeight: '1.3' });
  heading.fontWeight = pick(r, 'headingWeight');
  heading.letterSpacing = pick(r, 'letterSpacing');
  Object.assign(heading, customDeclarations(r, 'headingStyle'));

  const link: Record<string, string> = { color: primary, fontFamily: bodyFont };
  const linkStyle = pick(r, 'hyperlinkStyle');
  if (linkStyle === 'underline') Object.assign(link, { textDecoration: 'underline', textUnderlineOffset: '2px' });
  if (linkStyle === 'subtle') Object.assign(link, { textDecoration: 'none' });
  if (linkStyle === 'boxed') Object.assign(link, { textDecoration: 'none', background: `${accent}1a`, padding: '1px 6px', borderRadius: '4px' });
  Object.assign(link, customDeclarations(r, 'hyperlinkStyle'));

  const bullet = pick(r, 'bulletStyle');
  const bulletStyle: Record<string, string> = {
    paddingLeft: '1.4em',
    margin: '0 0 1em',
    fontFamily: bodyFont,
    fontSize: body.fontSize,
    lineHeight: body.lineHeight,
    color: text,
    textAlign: pick(r, 'textAlignment'),
  };
  if (bullet === 'disc') bulletStyle.listStyleType = 'disc';
  if (bullet === 'dash') bulletStyle.listStyleType = '"– "';
  if (bullet === 'check') bulletStyle.listStyleType = '"✓  "';
  if (bullet === 'square') bulletStyle.listStyleType = 'square';
  Object.assign(bulletStyle, customDeclarations(r, 'bulletStyle'));

  const numbering = pick(r, 'numberingStyle');
  const numberStyle: Record<string, string> = {
    paddingLeft: '1.4em',
    margin: '0 0 1em',
    fontFamily: bodyFont,
    fontSize: body.fontSize,
    lineHeight: body.lineHeight,
    color: text,
    textAlign: pick(r, 'textAlignment'),
  };
  numberStyle.listStyleType =
    numbering === 'decimal-leading-zero'
      ? 'decimal-leading-zero'
      : numbering === 'lower-roman'
        ? 'lower-roman'
        : numbering === 'upper-alpha'
          ? 'upper-alpha'
          : 'decimal';
  Object.assign(numberStyle, customDeclarations(r, 'numberingStyle'));

  const image = pick(r, 'imageStyle');
  const frame: Record<string, string> = { width: '100%', display: 'block' };
  if (image === 'rounded') Object.assign(frame, { borderRadius: '10px', border: `1px solid ${primary}33` });
  if (image === 'bordered') Object.assign(frame, { 'border': `2px solid ${secondary}` });
  if (image === 'framed') Object.assign(frame, { 'border': `8px solid ${background}`, boxShadow: `0 0 0 1px ${primary}44`, borderRadius: '2px' });
  Object.assign(frame, customDeclarations(r, 'imageStyle'));

  const code = pick(r, 'codeStyle');
  const codeStyle: Record<string, string> = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '0.9em' };
  if (code === 'subtle') Object.assign(codeStyle, { background: `${secondary}12`, padding: '2px 5px', borderRadius: '4px' });
  if (code === 'outlined') Object.assign(codeStyle, { background: background, padding: '3px 6px', 'border': `1px solid ${primary}55`, borderRadius: '4px' });
  Object.assign(codeStyle, customDeclarations(r, 'codeStyle'));

  const quote = pick(r, 'blockquoteStyle');
  const quoteStyle: Record<string, string> = { margin: '1.2em 0', padding: '8px 16px', color: text };
  if (quote === 'accent-bar') Object.assign(quoteStyle, { borderLeft: `4px solid ${accent}`, fontStyle: 'italic' });
  if (quote === 'card') Object.assign(quoteStyle, { background: `${accent}12`, borderRadius: '8px', borderLeft: `3px solid ${accent}` });
  if (quote === 'plain') Object.assign(quoteStyle, { fontStyle: 'italic', borderLeft: 'none', padding: '4px 0 4px 12px' });
  if (quote === 'centered') Object.assign(quoteStyle, { textAlign: 'center', fontStyle: 'italic', borderLeft: 'none' });
  Object.assign(quoteStyle, customDeclarations(r, 'blockquoteStyle'));

  const table = pick(r, 'tableStyle');
  const tableStyle: Record<string, string> = { width: '100%', borderCollapse: 'collapse', fontSize: '13px' };
  const cellStyle: Record<string, string> = { padding: '8px 10px', textAlign: 'left' };
  const headStyle: Record<string, string> = { padding: '8px 10px', textAlign: 'left', fontFamily: headingFont, color: secondary };
  if (table === 'header-fill') { headStyle.background = secondary; headStyle.color = background; Object.assign(cellStyle, { borderBottom: `1px solid ${secondary}22` }); }
  if (table === 'zebra') { headStyle.borderBottom = `2px solid ${primary}`; Object.assign(cellStyle, { borderBottom: `1px solid ${primary}22` }); }
  if (table === 'lined') { headStyle.borderBottom = `1px solid ${secondary}66`; Object.assign(cellStyle, { borderBottom: `1px solid ${primary}22` }); }
  if (table === 'bordered') { Object.assign(headStyle, { background: `${primary}18`, border: `1px solid ${primary}44` }); Object.assign(cellStyle, { border: `1px solid ${primary}44` }); }
  const tableCustomStyle = customDeclarations(r, 'tableStyle');
  Object.assign(tableStyle, tableCustomStyle);
  Object.assign(headStyle, tableCustomStyle);
  Object.assign(cellStyle, tableCustomStyle);
  const rowAlternate: Record<string, string> = {};
  if (table === 'zebra') rowAlternate.background = `${primary}0d`;

  const faq = pick(r, 'faqStyle');
  const faqItem: Record<string, string> = { marginBottom: '14px' };
  const faqQuestion: Record<string, string> = { fontFamily: headingFont, color: secondary, fontWeight: '600', fontSize: '14px', margin: '0 0 4px' };
  const faqAnswer: Record<string, string> = {
    margin: '0',
    color: text,
    fontFamily: bodyFont,
    fontSize: body.fontSize,
    lineHeight: body.lineHeight,
    textAlign: pick(r, 'textAlignment'),
  };
  if (faq === 'divided') { faqItem.borderTop = `1px solid ${primary}22`; faqItem.paddingTop = '12px'; }
  if (faq === 'card') { Object.assign(faqItem, { background: background, border: `1px solid ${primary}22`, borderRadius: '8px', padding: '12px' }); }
  if (faq === 'accordion') Object.assign(faqQuestion, { borderLeft: `3px solid ${accent}`, paddingLeft: '8px' });
  if (faq === 'numbered') { faqQuestion.color = primary; faqItem['paddingLeft'] = '4px'; }
  const faqCustomStyle = customDeclarations(r, 'faqStyle');
  Object.assign(faqItem, faqCustomStyle);
  Object.assign(faqQuestion, faqCustomStyle);
  Object.assign(faqAnswer, faqCustomStyle);

  const button = pick(r, 'buttonStyle');
  const buttonStyle: Record<string, string> = {
    background: primary,
    color: background,
    fontFamily: headingFont,
    fontWeight: '600',
    fontSize: '13px',
    padding: '9px 18px',
    display: 'inline-block',
  };
  if (button === 'rounded') buttonStyle.borderRadius = '8px';
  if (button === 'square') buttonStyle.borderRadius = '0';
  if (button === 'pill') buttonStyle.borderRadius = '999px';
  Object.assign(buttonStyle, customDeclarations(r, 'buttonStyle'));

  const captionStyle: Record<string, string> = {
    color: `${secondary}99`,
    fontSize: '11px',
    margin: '8px 0 0',
    fontFamily: bodyFont,
    lineHeight: '1.5',
  };
  const caption = pick(r, 'captionStyle');
  if (caption === 'centered') captionStyle.textAlign = 'center';
  if (caption === 'accent') captionStyle.color = accent;
  if (caption === 'boxed') Object.assign(captionStyle, {
    color: secondary,
    background: `${primary}0d`,
    borderLeft: `2px solid ${primary}`,
    padding: '8px 10px',
  });
  Object.assign(captionStyle, customDeclarations(r, 'captionStyle'));

  return {
    page: { background, color: text, fontFamily: bodyFont },
    heading,
    body,
    link,
    bullet: bulletStyle,
    number: numberStyle,
    frame,
    code: codeStyle,
    quote: quoteStyle,
    table: tableStyle,
    rowAlternate,
    head: headStyle,
    cell: cellStyle,
    faqItem,
    faqQuestion,
    faqAnswer,
    button: buttonStyle,
    caption: captionStyle,
  } as Record<string, React.CSSProperties>;
}
