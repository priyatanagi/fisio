import { ProviderConfig } from './provider';
import type {
  PipelineConfig,
  ReviewReport,
  JudgeOutput,
  BrandWarning,
} from '../pipeline/stages';
import type { ArticleScore } from '../pipeline/scoreArticle';
import type { UserProfile } from './profile';

export type LanguageOption = 'en' | 'id' | 'es' | 'de' | 'fr';

export type LengthTarget = 'short' | 'standard' | 'long' | 'custom';

export type OutputFormatId =
  | 'inline-en'
  | 'inline-id'
  | 'clean-en'
  | 'clean-id'
  | 'json-en'
  | 'json-id';

export interface SeoMetadata {
  seoTitle: string;
  headline: string;
  focusKeyphrase: string;
  metaDescription: string;
  urlSlug: string;
  tags: string[];
  /** Content category used by the JSON package, e.g. "Gym Planning". */
  category?: string;
  /** Short summary for the JSON package; falls back to the meta description. */
  excerpt?: string;
  /** Search keywords beside the focus keyphrase. */
  keywords?: string[];
}

export interface ImagePromptItem {
  type: 'featured' | 'illustration_1' | 'illustration_2';
  label: string;
  aspectRatio: string;
  concept: string;
  prompt: string;
}

export interface ArticleMetrics {
  wordCount: number;
  readingTimeMinutes: number;
  fleschScore: number | string;
  sentenceCount?: number;
  keyphraseOccurrences?: number;
  statisticalHighlights?: string[];
}

export interface FormatsBundle {
  'inline-en'?: string;
  'inline-id'?: string;
  'clean-en'?: string;
  'clean-id'?: string;
  'json-en'?: string;
  'json-id'?: string;
}

export interface MetadataVersion {
  /** 1-based. Version 1 is always the metadata exactly as the pipeline produced it. */
  version: number;
  label: string;
  /** ISO timestamp of when this version was recorded. */
  savedAt: string;
  metadata: SeoMetadata;
}

export interface ContentVersion {
  /**
   * 1-based and shared across formats — the next save is always max + 1, so a
   * version number names exactly one snapshot in the whole history.
   */
  version: number;
  label: string;
  /** ISO timestamp of when this version was recorded. */
  savedAt: string;
  /** The editor format this snapshot was taken from; the snapshot is that format's HTML. */
  format: OutputFormatId;
  html: string;
}

export interface GeneratedArticle {
  id: string;
  topic: string;
  focusKeyphrase?: string;
  secondaryKeywords?: string;
  language: LanguageOption;
  lengthTarget: LengthTarget;
  targetWordCount: number;
  targetFormats?: OutputFormatId[];
  formats: FormatsBundle;
  seoMetadata: SeoMetadata;
  seoMetadataEn?: SeoMetadata;
  seoMetadataId?: SeoMetadata;
  /**
   * Labelled history of the SEO metadata, oldest first. Optional because
   * articles saved before versioning existed still load without it; an article
   * with no history is seeded from its own `seoMetadata`.
   */
  metadataVersions?: MetadataVersion[];
  /**
   * Manually saved snapshots of the article HTML, oldest first. Optional like
   * `metadataVersions`: articles saved before content versioning existed simply
   * carry no history until the reader saves their first snapshot.
   */
  contentVersions?: ContentVersion[];
  inlineCssHtml: string;
  cleanHtml: string;
  imagePrompts: ImagePromptItem[];
  metrics: ArticleMetrics;
  generatedAt: string;
  rawText?: string;
  providerUsed?: string;
  pipelineConfig?: PipelineConfig;
  profileSnapshot?: UserProfile;
  reviewReport?: ReviewReport;
  judgeOutput?: JudgeOutput;
  reviewPassed?: boolean;
  /** Measured against the draft, never supplied by the model. */
  score?: ArticleScore;
  belowTarget?: boolean;
  remainingGaps?: string[];
  brandWarnings?: BrandWarning[];
  batchJobId?: string;
  batchRowId?: string;
}

export interface GenerateArticlePayload {
  topic: string;
  focusKeyphrase?: string;
  secondaryKeywords?: string;
  language?: LanguageOption;
  lengthTarget?: LengthTarget;
  customWordCount?: number;
  targetFormats?: OutputFormatId[];
  systemPromptOverride?: string;
  negativePromptOverride?: string;
  providerConfig?: ProviderConfig;
}
