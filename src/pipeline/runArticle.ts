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

export async function runArticle(options: RunArticleOptions): Promise<RunArticleResult> {
  const { config, profile, multiAgentConfig, universalRules, signal, onStage } = options;
  const seedTopic = options.seedTopic.trim();

  const call = (role: AnyRole, input: Record<string, unknown>) =>
    runAgent({
      role,
      input,
      userProfile: profile,
      providerConfig: multiAgentConfig[role === 'research' ? 'impower' : role],
      universalRules,
      signal,
    });

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

    // ---- Stage 3: Creator ---------------------------------------------
    onStage('creating', 'Writing the article markdown...');
    let creator = (await call('creator', {
      seedTopic: refinedTopic,
      targetWords: config.targetWords,
      brief,
      toneOverride: options.toneOverride ?? '',
      extraInstructions: '',
    })) as CreatorOutput;

    if (!brief) brief = resolveBrief(creator, refinedTopic, options.focusKeyphrase ?? '');

    // ---- Stage 4: Reviewer --------------------------------------------
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

    if (needsAttention) {
      // The markdown is retained so the user can read and copy what was produced.
      return {
        status: 'needs_attention',
        reviewReport: report,
        article: buildArticle({
          options,
          refinedTopic,
          brief,
          creator,
          formatsBundle: {},
          warnings: [],
          report,
          reviewPassed: false,
          judge,
        }),
      };
    }

    // ---- Stage 5: Designer --------------------------------------------
    onStage('designing', 'Rendering HTML formats...');
    const targets = formatTargets(config.targetFormats, config.languages);

    const rendered = await mapWithConcurrency(targets, DESIGNER_CONCURRENCY, async (target) => {
      const output = await call('designer', {
        markdown: creator.markdownContent,
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

    const article = buildArticle({
      options,
      refinedTopic,
      brief,
      creator,
      formatsBundle,
      warnings: allWarnings,
      report,
      reviewPassed: config.reviewer === 'off' ? undefined : report?.verdict === 'pass',
      judge,
    });

    onStage('done', 'Complete.');
    return { status: 'done', article, reviewReport: report };
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
    id: `art_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
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
