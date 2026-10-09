import type { SeoMetadata } from '../types/article';

/**
 * The JSON package is the article as data: the SEO metadata the reader sees in
 * the metadata panel, plus the body of one language. It is assembled at export
 * time from markup that was already rendered, never by a model call.
 *
 * The shape is the CMS extension's contract. `cms-extension/lib.js` fills the
 * English form from FIELD_KEYS and the Indonesian form from ID_SECTION_KEYS, and
 * that Indonesian form has no field for slug, category, date or keywords, so a
 * package naming them would be silently dropped. The key order here mirrors
 * `example-content.json` and `example-content.id.json` in that extension.
 */
export type PackageLanguage = 'en' | 'id';

export interface ArticleJsonPackage {
  title: string;
  slug: string;
  category: string;
  date: string;
  excerpt: string;
  tags: string[];
  keywords: string[];
  meta: string;
  body: string;
}

/** A package for the Indonesian form, which receives only these five fields. */
export interface ArticleJsonPackageId {
  title: string;
  excerpt: string;
  tags: string[];
  meta: string;
  body: string;
}

/**
 * The article body as the package needs it: no stylesheet, no accordion script or
 * FAQ JSON-LD, no wrapper. The <h1> goes too because `title` already carries it,
 * and a CMS that renders both shows the headline twice.
 */
export function extractJsonBody(html: string): string {
  let body = html;
  body = body.replace(/<script\b[^>]*>[\s\S]*?(?:<\/script>|$)/gi, '');
  body = body.replace(/<style\b[^>]*>[\s\S]*?(?:<\/style>|$)/gi, '');

  const article = body.match(/<article\b[^>]*>([\s\S]*?)(?:<\/article>|$)/i);
  if (article) body = article[1];

  body = body.replace(/<\/?header\b[^>]*>/gi, '');
  body = body.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/i, '');

  return body.replace(/>\s+</g, '><').trim();
}

export interface BuildArticleJsonInput {
  language: PackageLanguage;
  metadata: SeoMetadata;
  generatedAt: string;
  bodyHtml: string;
  /** Used when a run predates the metadata fields or the model left them blank. */
  categoryFallback?: string;
  keywordFallback?: string[];
}

export function buildArticleJson(
  input: BuildArticleJsonInput
): ArticleJsonPackage | ArticleJsonPackageId {
  const { language, metadata, generatedAt, bodyHtml } = input;
  const at = new Date(generatedAt);

  const keywords = metadata.keywords?.length
    ? metadata.keywords
    : (input.keywordFallback ?? []).filter((word) => word.trim().length > 0);

  const shared = {
    title: metadata.headline?.trim() || metadata.seoTitle?.trim() || '',
    excerpt: metadata.excerpt?.trim() || metadata.metaDescription?.trim() || '',
    tags: metadata.tags ?? [],
    meta: metadata.metaDescription?.trim() || '',
    body: extractJsonBody(bodyHtml),
  };
  if (language === 'id') return shared;

  return {
    title: shared.title,
    slug: metadata.urlSlug?.trim() || '',
    category: metadata.category?.trim() || input.categoryFallback?.trim() || '',
    date: Number.isNaN(at.getTime()) ? '' : at.toISOString().slice(0, 10),
    excerpt: shared.excerpt,
    tags: shared.tags,
    keywords: metadata.focusKeyphrase
      ? [metadata.focusKeyphrase, ...keywords.filter((word) => word !== metadata.focusKeyphrase)]
      : keywords,
    meta: shared.meta,
    body: shared.body,
  };
}

export const serializeArticleJson = (input: BuildArticleJsonInput): string =>
  JSON.stringify(buildArticleJson(input), null, 2);

/**
 * The package's filename. The extension reads a language off it, so the `-id`
 * tail is what tells an Indonesian package from an English one.
 */
export const jsonExportName = (slug: string, language: PackageLanguage): string =>
  `${slug.trim() || 'article'}-json-${language}.json`;
