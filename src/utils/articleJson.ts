import type { FormatsBundle, OutputFormatId, SeoMetadata } from '../types/article';

/**
 * The JSON package is the article as data: the SEO metadata the reader sees in
 * the metadata panel, plus the rendered body of one language. Nothing here asks
 * a model for anything — the fields already exist, so packaging is arithmetic.
 */
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

export const isJsonFormat = (id: string): id is 'json-en' | 'json-id' => id.startsWith('json-');

export const jsonLanguage = (id: string): 'en' | 'id' => (id.endsWith('-id') ? 'id' : 'en');

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
  metadata: SeoMetadata;
  generatedAt: string;
  bodyHtml: string;
  /** Used when a run predates the metadata fields or the model left them blank. */
  categoryFallback?: string;
  keywordFallback?: string[];
}

export function buildArticleJson(input: BuildArticleJsonInput): ArticleJsonPackage {
  const { metadata, generatedAt, bodyHtml } = input;
  const at = new Date(generatedAt);

  const keywords = metadata.keywords?.length
    ? metadata.keywords
    : (input.keywordFallback ?? []).filter((word) => word.trim().length > 0);

  return {
    title: metadata.headline?.trim() || metadata.seoTitle?.trim() || '',
    slug: metadata.urlSlug?.trim() || '',
    category: metadata.category?.trim() || input.categoryFallback?.trim() || '',
    date: Number.isNaN(at.getTime()) ? '' : at.toISOString().slice(0, 10),
    excerpt: metadata.excerpt?.trim() || metadata.metaDescription?.trim() || '',
    tags: metadata.tags ?? [],
    keywords: metadata.focusKeyphrase
      ? [metadata.focusKeyphrase, ...keywords.filter((word) => word !== metadata.focusKeyphrase)]
      : keywords,
    meta: metadata.metaDescription?.trim() || '',
    body: extractJsonBody(bodyHtml),
  };
}

export const serializeArticleJson = (input: BuildArticleJsonInput): string =>
  JSON.stringify(buildArticleJson(input), null, 2);

/**
 * The body out of a package the reader may have hand-edited. Returns '' for text
 * that is not a package, which every scoring surface already reads as "nothing to
 * measure".
 */
export function jsonPackageBody(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return '';
  }
  if (!parsed || typeof parsed !== 'object') return '';
  const body = (parsed as { body?: unknown }).body;
  return typeof body === 'string' ? body : '';
}

/** The HTML a JSON package for this language was built from. */
function bodySourceForLanguage(formats: FormatsBundle, language: 'en' | 'id'): string {
  return formats[`clean-${language}`] || formats[`inline-${language}`] || '';
}

/**
 * Rebuild every JSON format already in the bundle from the HTML and metadata now
 * in play. The package is a projection of those two, so editing the SEO title or
 * repairing the HTML has to move it — a stored copy would quietly ship the old
 * metadata. A language with no rendered HTML has no package.
 */
export function syncJsonFormats(
  formats: FormatsBundle,
  metadata: SeoMetadata,
  generatedAt: string,
  extras: { categoryFallback?: string; keywordFallback?: string[] } = {}
): FormatsBundle {
  const next: FormatsBundle = { ...formats };
  for (const id of Object.keys(formats) as OutputFormatId[]) {
    if (!isJsonFormat(id)) continue;
    const bodyHtml = bodySourceForLanguage(formats, jsonLanguage(id));
    if (!bodyHtml.trim()) {
      delete next[id];
      continue;
    }
    next[id] = serializeArticleJson({ metadata, generatedAt, bodyHtml, ...extras });
  }
  return next;
}
