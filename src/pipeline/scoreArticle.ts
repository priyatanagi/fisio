import { extractDocument } from '../utils/document';
import { readabilityFromText, type ReadabilityMetrics } from '../utils/readability';
import { evaluateDraftChecks } from '../utils/seoChecklist';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import type { SeoMetadata } from '../types/article';

export interface ScoredCheck {
  id: string;
  title: string;
  passed: boolean;
  actual: string;
  expected: string;
  /** True when the corpus cannot satisfy this check, so it is reported but never scored. */
  unavailable?: boolean;
}

export interface ArticleScore {
  total: number;
  target: number;
  passed: boolean;
  flesch: number;
  wordCount: number;
  wordTarget: number;
  checks: ScoredCheck[];
  failed: ScoredCheck[];
}

/** Word count is judged as a band; local models reliably undershoot an exact figure. */
export const WORD_COUNT_TOLERANCE = 0.2;

/**
 * The best Flesch this corpus could ever reach: the formula's intercept less its syllable
 * penalty at the measured syllable density, counting sentence length as zero words. Below
 * the band's floor the band is unreachable, whatever the writer does to the draft.
 *
 * The two coefficients are copied from the formula in `readabilityFromText`; that file owns
 * the calculation and is not ours to change, so a change there has to be mirrored here.
 */
function fleschCeiling(readability: ReadabilityMetrics): number {
  const syllablesPerWord = readability.syllableCount / Math.max(1, readability.wordCount);
  return Math.round((206.835 - 84.6 * syllablesPerWord) * 10) / 10;
}

export function scoreDraft(
  markdown: string,
  metadata: SeoMetadata,
  focusKeyphrase: string | undefined,
  targetWords: number,
  language: 'en' | 'id',
  target = 85
): ArticleScore {
  const doc = extractDocument(markdown, 'markdown');
  const readability = readabilityFromText(doc.text, language);
  const wordCount = readability.wordCount;
  const low = Math.round(targetWords * (1 - WORD_COUNT_TOLERANCE));
  const high = Math.round(targetWords * (1 + WORD_COUNT_TOLERANCE));
  const { targetFleschMin, targetFleschMax } = DEFAULT_UNIVERSAL_RULES;

  const checks: ScoredCheck[] = evaluateDraftChecks(doc, metadata, focusKeyphrase).map((item) => ({
    id: item.id,
    title: item.title,
    passed: item.passed,
    actual: item.value ?? 'not reported',
    expected: item.recommendation ?? item.description,
  }));

  const ceiling = fleschCeiling(readability);
  const bandReachable = ceiling >= targetFleschMin;
  checks.push({
    id: 'flesch_range',
    title: `Flesch Reading Ease (${targetFleschMin}-${targetFleschMax})`,
    passed: readability.fleschReadingEase >= targetFleschMin && readability.fleschReadingEase <= targetFleschMax,
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

  const scored = checks.filter((c) => !c.unavailable);
  const passedCount = scored.filter((c) => c.passed).length;
  const total = Math.round((passedCount / scored.length) * 100);

  return {
    total,
    target,
    passed: total >= target,
    flesch: readability.fleschReadingEase,
    wordCount,
    wordTarget: targetWords,
    checks,
    failed: checks.filter((c) => !c.passed && !c.unavailable),
  };
}

/** Instruction lines for the next revision. Never names a check that passed or unreachable. */
export function formatFailedChecks(score: ArticleScore): string {
  if (score.failed.length === 0) return '';
  const lines = score.failed.map((c) => `- [${c.id}] ${c.title}: measured "${c.actual}", required ${c.expected}.`);
  return [
    `These measured checks failed (score ${score.total}/100, target ${score.target}). Fix each one and change nothing else:`,
    ...lines,
  ].join('\n');
}