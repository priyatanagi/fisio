/**
 * Merge rules for local-first sync. The browser's IndexedDB is the working
 * store; the cloud row set is folded into it (and back) here, in pure functions
 * that never touch the network or React, so the ordering guarantees are testable.
 *
 * Two invariants drive the design:
 *   * Last-write-wins per article, decided by `articleStamp`, which follows the
 *     newest saved version rather than only the generation time — an article
 *     edited for a week after it was generated is newer than its `generatedAt`.
 *   * Version history is unioned, never replaced. A cloud copy that was trimmed
 *     to fit a request limit must not shorten the local editor's history.
 */
import type {
  ContentVersion,
  GeneratedArticle,
  LanguageOption,
  LengthTarget,
  MetadataVersion,
  OutputFormatId,
  SeoMetadata,
} from '../types/article';
import type { DesignRules, UserProfile } from '../types/profile';
import { DEFAULT_USER_PROFILE } from '../types/profile';
import { ALL_TOKENS } from '../config/designTokens';
import type { UniversalRules } from '../config/universalRules';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import type { PipelineConfig } from '../pipeline/stages';
import { DEFAULT_PIPELINE_CONFIG } from '../pipeline/stages';
import { sanitizePipelineConfig } from '../app/pipelineConfig';
import { CONTENT_VERSION_CAP } from '../utils/contentVersions';
import type { CloudRow } from './supabaseRest';

export const CLOUD_PAYLOAD_LIMIT_BYTES = 4_000_000;

const LANGUAGES: LanguageOption[] = ['en', 'id', 'es', 'de', 'fr'];
const LENGTH_TARGETS: LengthTarget[] = ['short', 'standard', 'long', 'custom'];

const str = (value: unknown, fallback = ''): string =>
  typeof value === 'string' ? value : fallback;

const num = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const bool = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

function plainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function byteLength(value: string): number {
  return typeof TextEncoder === 'function' ? new TextEncoder().encode(value).length : value.length;
}

/** The newest revision time this article carries, generation or edit. */
export function articleStamp(article: GeneratedArticle): string {
  const candidates = [article.generatedAt];
  for (const entry of article.contentVersions ?? []) candidates.push(entry.savedAt);
  for (const entry of article.metadataVersions ?? []) candidates.push(entry.savedAt);
  return candidates.filter(Boolean).sort().pop() ?? '';
}

export interface ArticleMergeResult {
  articles: GeneratedArticle[];
  /** Cloud ids the browser had never seen. */
  addedIds: string[];
  /** Ids where the cloud revision won over the local one. */
  updatedIds: string[];
}

function mergeById<T extends { version: number }>(
  winner: T[] | undefined,
  loser: T[] | undefined,
  cap: number
): T[] {
  const byVersion = new Map<number, T>();
  // The winner is inserted last so a shared version number keeps its entry.
  for (const entry of loser ?? []) if (entry && typeof entry.version === 'number') byVersion.set(entry.version, entry);
  for (const entry of winner ?? []) if (entry && typeof entry.version === 'number') byVersion.set(entry.version, entry);
  const merged = [...byVersion.values()].sort((a, b) => a.version - b.version);
  return merged.length > cap ? merged.slice(merged.length - cap) : merged;
}

export function mergeArticleLists(
  local: GeneratedArticle[],
  cloud: GeneratedArticle[]
): ArticleMergeResult {
  const byId = new Map<string, GeneratedArticle>();
  for (const article of local) byId.set(article.id, article);

  const addedIds: string[] = [];
  const updatedIds: string[] = [];

  for (const remote of cloud) {
    const mine = byId.get(remote.id);
    if (!mine) {
      byId.set(remote.id, remote);
      addedIds.push(remote.id);
      continue;
    }
    const cloudWins = articleStamp(remote) > articleStamp(mine);
    if (!cloudWins) continue;
    updatedIds.push(remote.id);
    byId.set(remote.id, {
      ...remote,
      contentVersions: mergeById(remote.contentVersions, mine.contentVersions, CONTENT_VERSION_CAP),
      metadataVersions: mergeById(remote.metadataVersions, mine.metadataVersions, Number.MAX_SAFE_INTEGER),
    });
  }

  const articles = [...byId.values()].sort((a, b) =>
    articleStamp(b).localeCompare(articleStamp(a))
  );
  return { articles, addedIds, updatedIds };
}

function sanitizeMetadata(raw: unknown): SeoMetadata {
  const obj = plainObject(raw) ?? {};
  return {
    seoTitle: str(obj.seoTitle),
    headline: str(obj.headline),
    focusKeyphrase: str(obj.focusKeyphrase),
    metaDescription: str(obj.metaDescription),
    urlSlug: str(obj.urlSlug),
    tags: Array.isArray(obj.tags) ? obj.tags.filter((t): t is string => typeof t === 'string') : [],
    ...(Array.isArray(obj.keywords)
      ? { keywords: obj.keywords.filter((k): k is string => typeof k === 'string') }
      : {}),
    ...(typeof obj.category === 'string' ? { category: obj.category } : {}),
    ...(typeof obj.excerpt === 'string' ? { excerpt: obj.excerpt } : {}),
  };
}

function sanitizeContentVersions(raw: unknown): ContentVersion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => plainObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .filter((entry) => typeof entry.version === 'number' && Number.isFinite(entry.version))
    .map((entry) => ({
      version: entry.version as number,
      label: str(entry.label, `v${entry.version}`),
      savedAt: str(entry.savedAt),
      format: str(entry.format, 'clean-en') as OutputFormatId,
      html: str(entry.html),
    }));
}

function sanitizeMetadataVersions(raw: unknown): MetadataVersion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => plainObject(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .filter((entry) => typeof entry.version === 'number' && Number.isFinite(entry.version))
    .map((entry) => ({
      version: entry.version as number,
      label: str(entry.label, `v${entry.version}`),
      savedAt: str(entry.savedAt),
      metadata: sanitizeMetadata(entry.metadata),
    }));
}

/**
 * Rebuilds an article from whatever the cloud returned. Rows can come from a
 * newer build of the app, a hand-edited dashboard row, or an older schema, so
 * anything the UI reads is checked before it reaches History state.
 */
export function sanitizeCloudArticle(raw: unknown): GeneratedArticle | null {
  const obj = plainObject(raw);
  if (!obj) return null;
  if (typeof obj.id !== 'string' || !obj.id) return null;
  if (typeof obj.generatedAt !== 'string') return null;
  const formats = plainObject(obj.formats);
  if (!formats) return null;

  const metrics = plainObject(obj.metrics);
  const article: GeneratedArticle = {
    ...(obj as unknown as GeneratedArticle),
    id: obj.id,
    topic: str(obj.topic),
    language: oneOf(obj.language, LANGUAGES, 'en'),
    lengthTarget: oneOf(obj.lengthTarget, LENGTH_TARGETS, 'standard'),
    targetWordCount: num(obj.targetWordCount, DEFAULT_PIPELINE_CONFIG.targetWords),
    formats: formats as GeneratedArticle['formats'],
    seoMetadata: sanitizeMetadata(obj.seoMetadata),
    inlineCssHtml: str(obj.inlineCssHtml),
    cleanHtml: str(obj.cleanHtml),
    imagePrompts: Array.isArray(obj.imagePrompts) ? (obj.imagePrompts as GeneratedArticle['imagePrompts']) : [],
    metrics: {
      wordCount: num(metrics?.wordCount, 0),
      readingTimeMinutes: num(metrics?.readingTimeMinutes, 0),
      fleschScore:
        typeof metrics?.fleschScore === 'number' || typeof metrics?.fleschScore === 'string'
          ? metrics.fleschScore
          : 'n/a',
    },
    generatedAt: obj.generatedAt,
  };

  const contentVersions = sanitizeContentVersions(obj.contentVersions);
  if (contentVersions.length) article.contentVersions = contentVersions;
  const metadataVersions = sanitizeMetadataVersions(obj.metadataVersions);
  if (metadataVersions.length) article.metadataVersions = metadataVersions;

  return article;
}

/**
 * PostgREST bodies on Supabase are capped, and 50 HTML snapshots of a long
 * article can exceed that. The oldest snapshots go first: they are the least
 * likely to be restored, and the local copy keeps all of them either way.
 */
export function shrinkArticleForCloud(
  article: GeneratedArticle,
  limitBytes = CLOUD_PAYLOAD_LIMIT_BYTES
): GeneratedArticle {
  if (byteLength(JSON.stringify(article)) <= limitBytes) return article;

  const versions = [...(article.contentVersions ?? [])];
  const trimmed: GeneratedArticle = { ...article, contentVersions: versions };

  // Cheap estimate first (one version's own size, measured once), then a single
  // exact re-measure; the loop only runs when an article really is oversized.
  let size = byteLength(JSON.stringify(trimmed));
  while (size > limitBytes && versions.length > 0) {
    const dropped = versions.shift() as ContentVersion;
    size -= byteLength(JSON.stringify(dropped)) + 1;
    if (size <= limitBytes) {
      trimmed.contentVersions = versions.slice();
      return trimmed;
    }
  }
  trimmed.contentVersions = versions.slice();
  return trimmed;
}

/**
 * Rebuilds a profile from an untrusted document — a cloud row or a JSON file the
 * user picked. Missing or damaged fields fall back to the defaults, and every
 * token declared in `ALL_TOKENS` is preserved, not just the ones that existed
 * when this function was first written (an older sanitizer silently dropped the
 * element tokens, which gutted a profile on import).
 */
export function sanitizeProfile(raw: unknown): UserProfile | null {
  const obj = plainObject(raw);
  if (!obj) return null;
  const design = plainObject(obj.designRules) ?? {};
  const defaults = DEFAULT_USER_PROFILE.designRules;
  const designRules = { ...defaults } as Record<string, string>;
  for (const token of ALL_TOKENS) {
    const value = design[token.key];
    if (typeof value === 'string') designRules[token.key] = value;
  }

  const overrides = plainObject(obj.formatOverrides);
  const cleanOverrides: Record<string, Record<string, string>> = {};
  for (const [format, tokens] of Object.entries(overrides ?? {})) {
    const inner = plainObject(tokens);
    if (!inner) continue;
    cleanOverrides[format] = Object.fromEntries(
      Object.entries(inner).map(([key, value]) => [key, str(value)])
    );
  }

  return {
    businessName: str(obj.businessName, DEFAULT_USER_PROFILE.businessName),
    niche: str(obj.niche, DEFAULT_USER_PROFILE.niche),
    location: str(obj.location, DEFAULT_USER_PROFILE.location),
    targetMarket: str(obj.targetMarket, DEFAULT_USER_PROFILE.targetMarket),
    usp: str(obj.usp, DEFAULT_USER_PROFILE.usp),
    toneOfVoice: str(obj.toneOfVoice, DEFAULT_USER_PROFILE.toneOfVoice),
    defaultCta: str(obj.defaultCta, DEFAULT_USER_PROFILE.defaultCta),
    designRules: designRules as unknown as DesignRules,
    exclusions: Array.isArray(obj.exclusions)
      ? obj.exclusions.filter((entry): entry is string => typeof entry === 'string' && Boolean(entry))
      : [...DEFAULT_USER_PROFILE.exclusions],
    ...(Object.keys(cleanOverrides).length ? { formatOverrides: cleanOverrides } : {}),
  };
}

export function sanitizeCloudRules(raw: unknown): UniversalRules | null {
  const obj = plainObject(raw);
  if (!obj) return null;
  const d = DEFAULT_UNIVERSAL_RULES;
  const positive = (value: unknown, fallback: number) => {
    const parsed = num(value, fallback);
    return parsed > 0 ? parsed : fallback;
  };
  return {
    targetFleschMin: positive(obj.targetFleschMin, d.targetFleschMin),
    targetFleschMax: positive(obj.targetFleschMax, d.targetFleschMax),
    maxSentenceWords: positive(obj.maxSentenceWords, d.maxSentenceWords),
    minSentencesPerParagraph: positive(obj.minSentencesPerParagraph, d.minSentencesPerParagraph),
    minParagraphsPerH2: positive(obj.minParagraphsPerH2, d.minParagraphsPerH2),
    seoTitleMaxChars: positive(obj.seoTitleMaxChars, d.seoTitleMaxChars),
    metaDescriptionMaxChars: positive(obj.metaDescriptionMaxChars, d.metaDescriptionMaxChars),
    focusKeyphraseMaxChars: positive(obj.focusKeyphraseMaxChars, d.focusKeyphraseMaxChars),
    requireStats: bool(obj.requireStats, d.requireStats),
    requireFaq: bool(obj.requireFaq, d.requireFaq),
    allowInlineScripts: bool(obj.allowInlineScripts, d.allowInlineScripts),
    allowH1InArticle: bool(obj.allowH1InArticle, d.allowH1InArticle),
  };
}

export interface CloudSettings {
  profile: UserProfile;
  universalRules: UniversalRules;
  pipelineConfig: PipelineConfig;
  /** Written by the device that saved, so the two sides can be ordered. */
  updatedAt: string;
}

export function settingsToRow(settings: CloudSettings, workspaceSecret: string): CloudRow {
  return {
    workspace_secret: workspaceSecret,
    profile: settings.profile,
    universal_rules: settings.universalRules,
    pipeline_config: settings.pipelineConfig,
    updated_at: settings.updatedAt,
  };
}

export function rowToSettings(row: CloudRow): CloudSettings | null {
  const updatedAt = row.updated_at;
  if (typeof updatedAt !== 'string' || !updatedAt) return null;
  const profile = sanitizeProfile(row.profile);
  if (!profile) return null;
  return {
    profile,
    universalRules: sanitizeCloudRules(row.universal_rules) ?? DEFAULT_UNIVERSAL_RULES,
    pipelineConfig: sanitizePipelineConfig(row.pipeline_config),
    updatedAt,
  };
}

/**
 * The settings document is a single row per workspace, so a tie goes to local:
 * the browser just edited it and showing its own value back is the honest
 * reading of "what I did a second ago".
 */
export function chooseSettings(local: CloudSettings, cloud: CloudSettings): 'local' | 'cloud' {
  return cloud.updatedAt > local.updatedAt ? 'cloud' : 'local';
}
