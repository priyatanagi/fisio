import { extractDocument } from '../utils/document';
import { readabilityFromText } from '../utils/readability';
import { evaluateSeoChecklist } from '../utils/seoChecklist';
import type { ScoredCheck } from './scoreArticle';
import { fleschCeiling, WORD_COUNT_TOLERANCE, type ArticleScore } from './scoreArticle';
import { formatFailedChecks } from './scoreArticle';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import type { SeoMetadata } from '../types/article';

/**
 * Score rendered HTML rather than the Markdown draft.
 *
 * The editor scores what the user is actually looking at, so it reuses the
 * pipeline's own deterministic checks and its unavailable-band rule rather than
 * inventing a second scale. It is the same measurement `scoreDraft` performs,
 * taken against the document the user just edited.
 */
export function scoreHtml(
  html: string,
  metadata: SeoMetadata,
  focusKeyphrase: string | undefined,
  targetWords: number,
  language: 'en' | 'id',
  target = 85
): ArticleScore {
  const doc = extractDocument(html, 'html');
  const readability = readabilityFromText(doc.text, language);
  const wordCount = readability.wordCount;
  const low = Math.round(targetWords * (1 - WORD_COUNT_TOLERANCE));
  const high = Math.round(targetWords * (1 + WORD_COUNT_TOLERANCE));
  const { targetFleschMin, targetFleschMax } = DEFAULT_UNIVERSAL_RULES;

  const checks: ScoredCheck[] = evaluateSeoChecklist(html, metadata, focusKeyphrase).items.map(
    (item) => ({
      id: item.id,
      title: item.title,
      passed: item.passed,
      actual: item.value ?? 'not reported',
      expected: item.recommendation ?? item.description,
    })
  );

  const ceiling = fleschCeiling(readability);
  const bandReachable = ceiling >= targetFleschMin;
  checks.push({
    id: 'flesch_range',
    title: `Flesch Reading Ease (${targetFleschMin}-${targetFleschMax})`,
    passed:
      readability.fleschReadingEase >= targetFleschMin &&
      readability.fleschReadingEase <= targetFleschMax,
    actual: String(readability.fleschReadingEase),
    expected: bandReachable
      ? `between ${targetFleschMin} and ${targetFleschMax}`
      : `${targetFleschMin}-${targetFleschMax} is unreachable for this corpus; maximum possible is ${ceiling}`,
    unavailable: bandReachable ? undefined : true,
  });
  checks.push({
    id: 'word_count_band',
    title: 'Word Count (±20% of target)',
    passed: wordCount >= low && wordCount <= high,
    actual: String(wordCount),
    expected: `${low}-${high} words (target ${targetWords})`,
  });

  const scored = checks.filter((check) => !check.unavailable);
  const passedCount = scored.filter((check) => check.passed).length;
  const total = Math.round((passedCount / scored.length) * 100);

  return {
    total,
    target,
    passed: total >= target,
    flesch: readability.fleschReadingEase,
    wordCount,
    wordTarget: targetWords,
    scoredCount: scored.length,
    checks,
    failed: checks.filter((check) => !check.passed && !check.unavailable),
  };
}

export { formatFailedChecks };