import { ProviderConfig } from './provider';
import type {
  PipelineConfig,
  ReviewReport,
  JudgeOutput,
  BrandWarning,
} from '../pipeline/stages';
import type { UserProfile } from './profile';

export type LanguageOption = 'en' | 'id' | 'es' | 'de' | 'fr';

export type LengthTarget = 'short' | 'standard' | 'long' | 'custom';

export type OutputFormatId = 'inline-en' | 'inline-id' | 'clean-en' | 'clean-id';

export interface SeoMetadata {
  seoTitle: string;
  headline: string;
  focusKeyphrase: string;
  metaDescription: string;
  urlSlug: string;
  tags: string[];
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
