import type { GeneratedArticle, OutputFormatId } from '../types/article';
import type { UserProfile } from '../types/profile';
import type { MultiAgentConfig } from '../types/provider';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import { rulesForFormat } from '../config/brandPresets';
import { applyTokenCss } from '../config/tokenCss';
import { runAgent } from './runAgent';
import { normalizeRenderedHtml } from '../utils/articleShell';
import { formatFailedChecks, scoreHtml } from './scoreHtml';
import type { ArticleScore } from './scoreArticle';
import type { ImproverOutput } from './stages';

export interface ImproveArticleOptions {
  article: GeneratedArticle;
  format: OutputFormatId;
  /** The HTML as the user has it in the editor right now, not the stored copy. */
  html: string;
  instruction?: string;
  /** The score the editor is already showing, so the measured state is not re-derived. */
  score?: ArticleScore;
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  signal: AbortSignal;
}

export interface ImproveArticleResult {
  html: string;
  changes: string[];
  score: ArticleScore;
}

const languageOf = (format: OutputFormatId): 'en' | 'id' => (format.endsWith('-id') ? 'id' : 'en');

const cssModeOf = (format: OutputFormatId): 'inline' | 'clean' =>
  format.startsWith('inline') ? 'inline' : 'clean';

/**
 * Ask the agent to repair one format, with the evidence it needs to be precise.
 *
 * Everything the app already measured is passed in — the failing checks, the
 * reviewer's issues, the brief, the brand tokens — so the agent fixes a named
 * problem instead of guessing at what the user disliked.
 */
export async function improveArticle(
  options: ImproveArticleOptions
): Promise<ImproveArticleResult> {
  const { article, format, html, instruction, profile, multiAgentConfig, signal } = options;
  const language = languageOf(format);

  const score =
    options.score ??
    scoreHtml(
      html,
      article.seoMetadata,
      article.focusKeyphrase ?? article.seoMetadata.focusKeyphrase,
      article.targetWordCount,
      language
    );

  const rules = rulesForFormat(profile.designRules, profile.formatOverrides ?? {}, format);

  const output = (await runAgent({
    role: 'improver',
    input: {
      html,
      language,
      cssMode: cssModeOf(format),
      instruction: instruction?.trim() ?? '',
      topic: article.topic,
      focusKeyphrase: article.focusKeyphrase ?? article.seoMetadata.focusKeyphrase,
      targetWords: article.targetWordCount,
      failedChecks: score.failed.map((check) => ({
        id: check.id,
        title: check.title,
        actual: check.actual,
        expected: check.expected,
      })),
      reviewIssues: (article.reviewReport?.issues ?? []).map((issue) => ({
        severity: issue.severity,
        category: issue.category,
        message: issue.message,
        suggestedFix: issue.suggestedFix,
      })),
      seoMetadata: article.seoMetadata,
      markdown: article.rawText ?? '',
    },
    userProfile: { ...profile, designRules: rules },
    providerConfig: multiAgentConfig.designer,
    universalRules: DEFAULT_UNIVERSAL_RULES,
    signal,
  })) as ImproverOutput;

  // The repair goes through the same normalizer as a fresh render, so an
  // improvement cannot reintroduce a page background or a capped width, and
  // through the token pass so it cannot restyle the article off-brand either.
  const repaired = applyTokenCss(normalizeRenderedHtml(output?.html ?? ''), rules, {
    mode: cssModeOf(format),
  }).html;

  return {
    html: repaired,
    changes: output?.changes ?? [],
    score: scoreHtml(
      repaired,
      article.seoMetadata,
      article.focusKeyphrase ?? article.seoMetadata.focusKeyphrase,
      article.targetWordCount,
      language
    ),
  };
}

export { formatFailedChecks };
