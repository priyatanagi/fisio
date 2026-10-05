import type {
  AnyRole,
  CreatorOutput,
  DesignerOutput,
  ImpowerOutput,
  JudgeOutput,
  KeywordResearch,
  ReviewReport,
} from '../pipeline/stages';
import { cleanJsonOutput } from './providers';

export type ValidationResult<T> = { ok: true; data: T } | { ok: false; error: string };

function parseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(cleanJsonOutput(raw));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');

const strArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];

/**
 * Local models frequently return these list fields as objects instead of
 * strings -- `ornith:9b` emits internalLinkTargets as {anchorText, ...}. The
 * strict filter above silently dropped those to an empty array, losing the
 * links with no signal anywhere. Prefer the string form, then the common
 * object keys, so the data survives.
 */
function strList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (!entry || typeof entry !== 'object') return '';
      const record = entry as Record<string, unknown>;
      for (const key of ['anchorText', 'text', 'title', 'name', 'value']) {
        const candidate = str(record[key]);
        if (candidate) return candidate;
      }
      return '';
    })
    .filter((entry) => entry.length > 0);
}

function validateJudge(obj: Record<string, unknown>): ValidationResult<JudgeOutput> {
  if (!str(obj.refinedTopic)) {
    return { ok: false, error: 'judge output is missing refinedTopic' };
  }
  const intents = ['informational', 'commercial', 'transactional', 'navigational'];
  const intent = str(obj.searchIntent);
  return {
    ok: true,
    data: {
      refinedTopic: str(obj.refinedTopic),
      searchIntent: intents.includes(intent)
        ? (intent as JudgeOutput['searchIntent'])
        : 'informational',
      audienceAngle: str(obj.audienceAngle),
      subtopics: strArray(obj.subtopics),
      rejectedAngles: Array.isArray(obj.rejectedAngles)
        ? (obj.rejectedAngles as unknown[])
            .filter((v) => Boolean(v) && typeof v === 'object')
            .map((v) => ({
              angle: str((v as Record<string, unknown>).angle),
              reason: str((v as Record<string, unknown>).reason),
            }))
        : [],
    },
  };
}

function coerceBrief(
  obj: Record<string, unknown>,
  source: ImpowerOutput['source']
): ImpowerOutput {
  const meta = (obj.seoMetadata ?? {}) as Record<string, unknown>;
  return {
    seoMetadata: {
      seoTitle: str(meta.seoTitle),
      headline: str(meta.headline),
      focusKeyphrase: str(meta.focusKeyphrase),
      metaDescription: str(meta.metaDescription),
      urlSlug: str(meta.urlSlug),
      tags: strList(meta.tags),
    },
    secondaryKeywords: strList(obj.secondaryKeywords),
    outline: Array.isArray(obj.outline)
      ? (obj.outline as unknown[]).map((o) => ({
          heading: str((o as Record<string, unknown>)?.heading),
          mustCover: strArray((o as Record<string, unknown>)?.mustCover),
        }))
      : [],
    faqPlan: Array.isArray(obj.faqPlan)
      ? (obj.faqPlan as unknown[]).map((f) => ({
          question: str((f as Record<string, unknown>)?.question),
          answerShape: str((f as Record<string, unknown>)?.answerShape),
        }))
      : [],
    statPlan: strList(obj.statPlan),
    internalLinkTargets: strList(obj.internalLinkTargets),
    source,
  };
}

function validateCreator(obj: Record<string, unknown>): ValidationResult<CreatorOutput> {
  if (!str(obj.markdownContent)) {
    return { ok: false, error: 'creator output is missing markdownContent' };
  }
  const out: CreatorOutput = { markdownContent: str(obj.markdownContent) };
  if (obj.selfPlanned && typeof obj.selfPlanned === 'object') {
    out.selfPlanned = coerceBrief(
      obj.selfPlanned as Record<string, unknown>,
      'creator-selfplanned'
    );
  }
  return { ok: true, data: out };
}

function validateReviewer(obj: Record<string, unknown>): ValidationResult<ReviewReport> {
  const verdict = str(obj.verdict);
  if (!['pass', 'revise', 'fail'].includes(verdict)) {
    return { ok: false, error: 'reviewer output is missing a valid verdict' };
  }
  const score = Number(obj.seoScore);
  const severities = ['blocker', 'warning', 'nit'];
  const categories = ['fact', 'seo', 'readability', 'structure', 'brand'];
  return {
    ok: true,
    data: {
      verdict: verdict as ReviewReport['verdict'],
      seoScore: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0,
      issues: Array.isArray(obj.issues)
        ? (obj.issues as unknown[]).map((i) => {
            const record = (i ?? {}) as Record<string, unknown>;
            const sev = str(record.severity);
            const cat = str(record.category);
            return {
              severity: severities.includes(sev)
                ? (sev as ReviewReport['issues'][number]['severity'])
                : 'warning',
              category: categories.includes(cat)
                ? (cat as ReviewReport['issues'][number]['category'])
                : 'seo',
              message: str(record.message),
              suggestedFix: str(record.suggestedFix),
            };
          })
        : [],
      revisedAfterIssues: Boolean(obj.revisedAfterIssues),
    },
  };
}

function validateDesigner(obj: Record<string, unknown>): ValidationResult<DesignerOutput> {
  if (!str(obj.html)) return { ok: false, error: 'designer output is missing html' };
  return { ok: true, data: { html: str(obj.html), warnings: [] } };
}

function validateResearch(obj: Record<string, unknown>): ValidationResult<KeywordResearch> {
  if (!str(obj.primaryKeyword)) {
    return { ok: false, error: 'keyword research output is missing primaryKeyword' };
  }
  return {
    ok: true,
    data: {
      primaryKeyword: str(obj.primaryKeyword),
      secondaryKeywords: strArray(obj.secondaryKeywords),
      lsiEntities: strArray(obj.lsiEntities),
      questionQueries: strArray(obj.questionQueries),
      intentModifiers: strArray(obj.intentModifiers),
    },
  };
}

export function validateRoleOutput(role: AnyRole, raw: string): ValidationResult<unknown> {
  const obj = parseObject(raw);
  if (!obj) return { ok: false, error: `Model returned unparseable output for role "${role}".` };

  switch (role) {
    case 'judge':
      return validateJudge(obj);
    case 'impower':
      return { ok: true, data: coerceBrief(obj, 'impower') };
    case 'creator':
      return validateCreator(obj);
    case 'reviewer':
      return validateReviewer(obj);
    case 'designer':
      return validateDesigner(obj);
    case 'research':
      return validateResearch(obj);
    default:
      return { ok: false, error: `Unknown role "${String(role)}".` };
  }
}

export function buildRepairPrompt(role: AnyRole, raw: string): string {
  return [
    `Your previous response for the "${role}" role was not valid JSON in the required shape.`,
    'Respond again with ONLY the correct JSON object. No markdown fences, no commentary.',
    '',
    'Invalid output was:',
    raw.slice(0, 2000),
  ].join('\n');
}
