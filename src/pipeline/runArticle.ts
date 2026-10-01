import type { GeneratedArticle } from '../types/article';
import type { UserProfile } from '../types/profile';
import type { UniversalRules } from '../config/universalRules';
import type { MultiAgentConfig } from '../types/provider';
import type {
  AnyRole,
  BrandWarning,
  CreatorOutput,
  CssMode,
  ImpowerOutput,
  JudgeOutput,
  OutputFormatId,
  PipelineConfig,
  PipelineStage,
  ReviewReport,
  RunArticleResult,
  TargetLanguage,
} from './stages';
import { resolveBrief } from './seoBrief';
import { runAgent, AgentError } from './runAgent';

export interface RunArticleOptions {
  seedTopic: string;
  focusKeyphrase?: string;
  toneOverride?: string;
  config: PipelineConfig;
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  universalRules: UniversalRules;
  batchRefs?: { jobId: string; rowId: string };
  runId?: string;
  eventLabel?: string;
  onStage: (stage: PipelineStage, message: string) => void;
  signal: AbortSignal;
}

const DESIGNER_CONCURRENCY = 2;

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

export function formatTargets(
  formats: OutputFormatId[],
  languages: TargetLanguage[]
): { id: OutputFormatId; language: TargetLanguage; cssMode: CssMode }[] {
  return formats
    .map((id) => ({
      id,
      language: (id.endsWith('-en') ? 'en' : 'id') as TargetLanguage,
      cssMode: (id.startsWith('inline') ? 'inline' : 'clean') as CssMode,
    }))
    .filter((t) => languages.includes(t.language));
}

function makeCall(options: RunArticleOptions) {
  const { profile, multiAgentConfig, universalRules, signal, runId, eventLabel } = options;
  return (role: AnyRole, input: Record<string, unknown>) =>
    runAgent({
      role,
      input,
      userProfile: profile,
      providerConfig: multiAgentConfig[role === 'research' ? 'impower' : role],
      universalRules,
      signal,
      runId,
      eventLabel,
    });
}

interface CreatorPhase {
  /** False only when the strict reviewer halted after its single revision. */
  ready: boolean;
  creator: CreatorOutput;
  brief: ImpowerOutput;
  report?: ReviewReport;
}

/** Stage 3 (Creator) + Stage 4 (Reviewer, including the one strict revision). */
async function runCreatorAndReviewer(
  options: RunArticleOptions,
  base: { refinedTopic: string; brief: ImpowerOutput | null; judge?: JudgeOutput }
): Promise<CreatorPhase> {
  const { config, onStage } = options;
  const call = makeCall(options);
  const { refinedTopic } = base;
  let brief = base.brief;

  onStage('creating', 'Writing the article markdown...');
  let creator = (await call('creator', {
    seedTopic: refinedTopic,
    targetWords: config.targetWords,
    brief,
    toneOverride: options.toneOverride ?? '',
    extraInstructions: '',
  })) as CreatorOutput;

  if (!brief) brief = resolveBrief(creator, refinedTopic, options.focusKeyphrase ?? '');

  let report: ReviewReport | undefined;
  let needsAttention = false;

  if (config.reviewer !== 'off') {
    onStage(
      'reviewing',
      config.reviewer === 'advisory' ? 'Auditing (advisory)...' : 'Auditing...'
    );
    report = (await call('reviewer', {
      markdown: creator.markdownContent,
      brief,
      revisedAfterIssues: false,
    })) as ReviewReport;

    if (config.reviewer === 'strict' && report.verdict !== 'pass') {
      // Blockers first so the revision is guided by the most important
      // problems, then the remaining nits.
      const ordered = [
        ...report.issues.filter((i) => i.severity === 'blocker'),
        ...report.issues.filter((i) => i.severity !== 'blocker'),
      ];
      const guidance = ordered.map((i) => `- ${i.message} -> ${i.suggestedFix}`).join('\n');

      onStage('creating', 'Applying reviewer feedback (revision 1 of 1)...');
      creator = (await call('creator', {
        seedTopic: refinedTopic,
        targetWords: config.targetWords,
        brief,
        toneOverride: options.toneOverride ?? '',
        extraInstructions: `A reviewer raised these problems. Fix them:\n${guidance}`,
      })) as CreatorOutput;

      onStage('reviewing', 'Re-auditing the revised draft...');
      report = (await call('reviewer', {
        markdown: creator.markdownContent,
        brief,
        revisedAfterIssues: true,
      })) as ReviewReport;

      needsAttention = report.verdict !== 'pass';
    }
  }

  // After the creator stage a brief always exists (supplied or self-planned).
  return {
    ready: !needsAttention,
    creator,
    brief: brief as ImpowerOutput,
    report,
  };
}

/** Stage 5 (Designer fan-out) and article assembly. */
async function runDesignerStage(
  options: RunArticleOptions,
  params: {
    refinedTopic: string;
    brief: ImpowerOutput;
    creator: CreatorOutput;
    report?: ReviewReport;
    judge?: JudgeOutput;
    articleId?: string;
  }
): Promise<GeneratedArticle> {
  const { config, onStage } = options;
  const call = makeCall(options);

  onStage('designing', 'Rendering HTML formats...');
  const targets = formatTargets(config.targetFormats, config.languages);

  const rendered = await mapWithConcurrency(targets, DESIGNER_CONCURRENCY, async (target) => {
    const output = await call('designer', {
      markdown: params.creator.markdownContent,
      language: target.language,
      cssMode: target.cssMode,
    });
    return { id: target.id, html: output?.html ?? '', warnings: output?.warnings ?? [] };
  });

  const formatsBundle: Record<string, string> = {};
  const allWarnings: BrandWarning[] = [];
  for (const r of rendered) {
    formatsBundle[r.id] = r.html;
    allWarnings.push(...r.warnings);
  }

  return buildArticle({
    options,
    refinedTopic: params.refinedTopic,
    brief: params.brief,
    creator: params.creator,
    formatsBundle,
    warnings: allWarnings,
    report: params.report,
    reviewPassed:
      config.reviewer === 'off' ? undefined : params.report?.verdict === 'pass',
    judge: params.judge,
    articleId: params.articleId,
  });
}

function haltedResult(
  options: RunArticleOptions,
  params: {
    refinedTopic: string;
    brief: ImpowerOutput;
    creator: CreatorOutput;
    report: ReviewReport;
    judge?: JudgeOutput;
    articleId?: string;
  }
): RunArticleResult {
  // The markdown is retained so the user can read, copy, or act on the draft.
  return {
    status: 'needs_attention',
    reviewReport: params.report,
    article: buildArticle({
      options,
      refinedTopic: params.refinedTopic,
      brief: params.brief,
      creator: params.creator,
      formatsBundle: {},
      warnings: [],
      report: params.report,
      reviewPassed: false,
      judge: params.judge,
      articleId: params.articleId,
    }),
  };
}

export async function runArticle(options: RunArticleOptions): Promise<RunArticleResult> {
  const { config, onStage } = options;
  const call = makeCall(options);
  const seedTopic = options.seedTopic.trim();

  try {
    // ---- Stage 1: Judge -----------------------------------------------
    let refinedTopic = seedTopic;
    let judge: JudgeOutput | undefined;

    if (config.judge) {
      onStage('judging', 'Evaluating the angle against your target market...');
      judge = (await call('judge', {
        seedTopic,
        focusKeyphrase: options.focusKeyphrase,
      })) as JudgeOutput;
      refinedTopic = judge.refinedTopic || seedTopic;
    }

    // ---- Stage 2: Impower ---------------------------------------------
    let brief: ImpowerOutput | null = null;

    if (config.impower !== 'off') {
      onStage('impowering', `Building the SEO brief (${config.impower})...`);
      let research: unknown;
      if (config.impower === 'max') {
        research = await call('research', { topic: refinedTopic });
      }
      brief = (await call('impower', {
        topic: refinedTopic,
        targetWords: config.targetWords,
        research,
      })) as ImpowerOutput;
    }

    // ---- Stage 3 + 4: Creator & Reviewer ------------------------------
    const phase = await runCreatorAndReviewer(options, { refinedTopic, brief, judge });

    if (!phase.ready) {
      return haltedResult(options, {
        refinedTopic,
        brief: phase.brief,
        creator: phase.creator,
        report: phase.report as ReviewReport,
        judge,
      });
    }

    // ---- Stage 5: Designer --------------------------------------------
    const article = await runDesignerStage(options, {
      refinedTopic,
      brief: phase.brief,
      creator: phase.creator,
      report: phase.report,
      judge,
    });

    onStage('done', 'Complete.');
    return { status: 'done', article, reviewReport: phase.report };
  } catch (err) {
    const aborted = err instanceof AgentError && err.aborted;
    const message = aborted ? 'aborted' : err instanceof Error ? err.message : String(err);
    onStage('failed', message);
    return { status: 'failed', error: message };
  }
}

export type ResumeAction = 'retry_creator' | 'skip_designer';

/**
 * Rebuild a working brief from a stored article. The stalled article keeps the
 * resolved seoMetadata and secondary keywords, which is enough to re-guide the
 * Creator and Reviewer on a resume.
 */
function briefFromArticle(article: GeneratedArticle): ImpowerOutput {
  return {
    seoMetadata: article.seoMetadata,
    secondaryKeywords: article.secondaryKeywords
      ? article.secondaryKeywords
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [],
    outline: [],
    faqPlan: [],
    statPlan: [],
    internalLinkTargets: [],
    source: 'impower',
  };
}

/**
 * Resume an article that halted in the strict review gate. The retained Markdown
 * and brief are reconstructed from the stored article so the resume can happen
 * in a later session, not only right after the halt. The output keeps the same
 * article id so it replaces the stalled record instead of duplicating it.
 */
export async function resumeArticle(
  article: GeneratedArticle,
  options: RunArticleOptions,
  action: ResumeAction
): Promise<RunArticleResult> {
  const { onStage } = options;
  const refinedTopic = article.topic;
  const judge = article.judgeOutput;
  const brief = briefFromArticle(article);

  try {
    if (action === 'skip_designer') {
      const creator: CreatorOutput = { markdownContent: article.rawText ?? '' };
      const built = await runDesignerStage(options, {
        refinedTopic,
        brief,
        creator,
        report: article.reviewReport,
        judge,
        articleId: article.id,
      });
      onStage('done', 'Complete.');
      return { status: 'done', article: built, reviewReport: article.reviewReport };
    }

    // retry_creator: reset the gate by re-running the Creator + Reviewer cycle.
    const phase = await runCreatorAndReviewer(options, { refinedTopic, brief, judge });

    if (!phase.ready) {
      return haltedResult(options, {
        refinedTopic,
        brief: phase.brief,
        creator: phase.creator,
        report: phase.report as ReviewReport,
        judge,
        articleId: article.id,
      });
    }

    const built = await runDesignerStage(options, {
      refinedTopic,
      brief: phase.brief,
      creator: phase.creator,
      report: phase.report,
      judge,
      articleId: article.id,
    });
    onStage('done', 'Complete.');
    return { status: 'done', article: built, reviewReport: phase.report };
  } catch (err) {
    const aborted = err instanceof AgentError && err.aborted;
    const message = aborted ? 'aborted' : err instanceof Error ? err.message : String(err);
    onStage('failed', message);
    return { status: 'failed', error: message };
  }
}

interface BuildArticleParams {
  options: RunArticleOptions;
  refinedTopic: string;
  brief: ImpowerOutput | null;
  creator: CreatorOutput;
  formatsBundle: Record<string, string>;
  warnings: BrandWarning[];
  report?: ReviewReport;
  reviewPassed?: boolean;
  judge?: JudgeOutput;
  articleId?: string;
}

function buildArticle(params: BuildArticleParams): GeneratedArticle {
  const { options, refinedTopic, brief, creator, formatsBundle, report, judge } = params;
  const markdown = creator.markdownContent;
  const textOnly = markdown.replace(/[#*_>`]/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textOnly ? textOnly.split(' ').length : options.config.targetWords;

  const metadata =
    brief?.seoMetadata ??
    ({
      seoTitle: refinedTopic,
      headline: refinedTopic,
      focusKeyphrase: options.focusKeyphrase ?? '',
      metaDescription: refinedTopic,
      urlSlug: refinedTopic
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, ''),
      tags: [],
    } as GeneratedArticle['seoMetadata']);

  return {
    id: params.articleId ?? `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    topic: refinedTopic,
    focusKeyphrase: metadata.focusKeyphrase || options.focusKeyphrase,
    secondaryKeywords: brief?.secondaryKeywords.join(', ') ?? '',
    language: options.config.languages[0] ?? 'en',
    lengthTarget: 'custom',
    targetWordCount: options.config.targetWords,
    targetFormats: options.config.targetFormats,
    formats: formatsBundle as GeneratedArticle['formats'],
    seoMetadata: metadata,
    seoMetadataEn: options.config.languages.includes('en') ? metadata : undefined,
    seoMetadataId: options.config.languages.includes('id') ? metadata : undefined,
    inlineCssHtml: formatsBundle['inline-en'] || formatsBundle['inline-id'] || '',
    cleanHtml: formatsBundle['clean-en'] || formatsBundle['clean-id'] || '',
    imagePrompts: [],
    metrics: {
      wordCount,
      readingTimeMinutes: Math.max(1, Math.ceil(wordCount / 200)),
      fleschScore: 0,
    },
    generatedAt: new Date().toISOString(),
    rawText: markdown,
    providerUsed: `${options.multiAgentConfig.creator.provider.toUpperCase()}: ${options.multiAgentConfig.creator.model}`,
    pipelineConfig: options.config,
    profileSnapshot: options.profile,
    reviewReport: report,
    judgeOutput: judge,
    reviewPassed: params.reviewPassed,
    brandWarnings: params.warnings,
    batchJobId: options.batchRefs?.jobId,
    batchRowId: options.batchRefs?.rowId,
  };
}
