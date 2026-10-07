import type { GeneratedArticle, LengthTarget, OutputFormatId, SeoMetadata } from '../types/article';

export type { GeneratedArticle, LengthTarget, OutputFormatId, SeoMetadata } from '../types/article';

export type AgentRole = 'judge' | 'impower' | 'creator' | 'reviewer' | 'designer';

/**
 * Internal roles. Not user-configurable: `research` reuses the Impower provider
 * and `improver` reuses the Designer provider, so the provider UI stays at five
 * roles.
 */
export type InternalRole = 'research' | 'improver';
export type AnyRole = AgentRole | InternalRole;

export type ImpowerLevel = 'off' | 'lite' | 'standard' | 'max';
export type ReviewerMode = 'off' | 'advisory' | 'strict';
export type TargetLanguage = 'en' | 'id';
export type CssMode = 'inline' | 'clean';

export type PipelineStage =
  | 'judging' | 'impowering' | 'creating'
  | 'reviewing' | 'designing' | 'done' | 'failed' | 'needs_attention';

export interface PipelineConfig {
  judge: boolean;
  impower: ImpowerLevel;
  reviewer: ReviewerMode;
  targetFormats: OutputFormatId[];
  languages: TargetLanguage[];
  targetWords: number;
  /** Optional so configs persisted before this field existed still typecheck. */
  lengthTarget?: LengthTarget;
}

export interface OutlineSection {
  heading: string;
  mustCover: string[];
}

export interface FaqPlanItem {
  question: string;
  answerShape: string;
}

export interface SeoBrief {
  seoMetadata: SeoMetadata;
  secondaryKeywords: string[];
  outline: OutlineSection[];
  faqPlan: FaqPlanItem[];
  statPlan: string[];
  internalLinkTargets: string[];
  source: 'impower' | 'creator-selfplanned' | 'minimal';
}

export type ImpowerOutput = SeoBrief;

export interface JudgeOutput {
  refinedTopic: string;
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  audienceAngle: string;
  subtopics: string[];
  rejectedAngles: { angle: string; reason: string }[];
}

export interface CreatorOutput {
  markdownContent: string;
  selfPlanned?: Partial<SeoBrief>;
}

export type ReviewVerdict = 'pass' | 'revise' | 'fail';

export interface ReviewIssue {
  severity: 'blocker' | 'warning' | 'nit';
  category: 'fact' | 'seo' | 'readability' | 'structure' | 'brand';
  message: string;
  suggestedFix: string;
}

export interface ReviewReport {
  verdict: ReviewVerdict;
  seoScore: number;
  issues: ReviewIssue[];
  revisedAfterIssues: boolean;
}

export interface KeywordResearch {
  primaryKeyword: string;
  secondaryKeywords: string[];
  lsiEntities: string[];
  questionQueries: string[];
  intentModifiers: string[];
}

export interface BrandWarning {
  hex: string;
  occurrences: number;
}

export interface DesignerOutput {
  html: string;
  warnings: BrandWarning[];
}

export interface ImproverOutput {
  html: string;
  changes: string[];
}

// runArticle keeps its working set in local variables and returns a
// RunArticleResult. This interface documents the shape for readers and is
// useful for debugging, but no code path constructs one; if it goes stale,
// delete it rather than maintaining a parallel description of the flow.
export interface PipelineState {
  seedTopic: string;
  stage: PipelineStage;
  judge?: JudgeOutput;
  brief?: SeoBrief;
  markdown?: string;
  review?: ReviewReport;
  revisionAttempts: number;
  formatsBundle: Record<string, string>;
  warnings: BrandWarning[];
}

export interface RunArticleResult {
  status: 'done' | 'failed' | 'needs_attention';
  article?: GeneratedArticle;
  reviewReport?: ReviewReport;
  error?: string;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  judge: true,
  impower: 'standard',
  reviewer: 'strict',
  targetFormats: ['inline-en', 'inline-id', 'clean-en', 'clean-id', 'json-en', 'json-id'],
  languages: ['en', 'id'],
  targetWords: 950,
  lengthTarget: 'standard',
};
