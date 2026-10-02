# Deterministic Scoring & Generation Loop — Design

**Date:** 2026-10-02
**Status:** Approved in chat, awaiting spec review
**Scope:** `src/pipeline/`, `src/utils/`, `src/server/`, `src/components/`, `src/views/`

---

## Problem

Two failures compound today.

**1. The score shown to the user is not measured.** `runArticle.ts` stores
`metrics.fleschScore: 0` — a hardcoded literal. `ArticleWorkspace.tsx` renders
`{article.metrics.fleschScore || 65} (Yoast Compliant)`, so that stored `0` is
displayed as a fabricated **"65 (Yoast Compliant)"**, and the compliance label is
pinned regardless of the real value. `exportUtils.ts` writes
`metrics?.fleschScore ?? 0`, exporting the same fiction. Separately,
`reviewReport.seoScore` is the LLM's own number, merely clamped to 0-100 by
`roleSchemas.ts` — it is never checked against the text.

Meanwhile the repo already contains two *real* calculators that the UI uses
live but the pipeline never records: `calculateReadability()` (true Flesch:
`206.835 - 1.015*asl - 84.6*asw`, real syllable counting) and
`evaluateSeoChecklist()` (`passed/total*100` over 17 HTML checks).

**2. There is no loop.** Creator writes once, Reviewer may trigger exactly one
revision, and the run ends. Nothing compares the output to a target, so a
mediocre article is delivered as final.

A third defect is already fixed and must not regress: the Judge used to replace
the user's topic wholesale (`refinedTopic` overwrote the seed topic), which is
how an article about "Program Makan Bergizi Gratis" came back about gym
infrastructure. This design removes the Judge's topic-rewriting ability
entirely, rather than filtering it after the fact.

---

## Decisions (approved in chat)

| Question | Decision |
|---|---|
| Source of truth for the score | Deterministic score from the real output gates the loop. The model critiques qualitatively and **never** sets a number. |
| What is sent back on failure | The previous draft plus **only the failing checks** as revision instructions. |
| Loop bound | Max 3 iterations. On failure, keep the **highest-scoring** draft, mark it below-target, record the remaining gaps. |
| Fate of Judge / Reviewer | Judge becomes the loop's auditor (keeps its provider settings). Reviewer leaves the pipeline; its provider slot is retained so saved configs stay valid. |

---

## Architecture

```
                     ┌─────────────────────────────────────┐
   seed topic ──────▶│ Creator (iteration 1)                │
   focus keyphrase   └──────────────┬──────────────────────┘
                                    │ markdown draft
                                    ▼
                     ┌─────────────────────────────────────┐
                     │ scoreDraft()  ← DETERMINISTIC       │
                     │ 14 draft checks + Flesch            │
                     └──────────────┬──────────────────────┘
                          pass     │     fail
                    ┌───────────────┘                │
                    ▼                                 ▼
             ┌────────────┐              ┌──────────────────────────┐
             │  Designer  │              │ Judge/Audit: qualitative │
             │  (4 fmt)   │              │ gaps only, no numbers    │
             └─────┬──────┘              └───────────┬──────────────┘
                   │                        extraInstructions = failed checks
                   │                                 ▼
                   │                    ┌──────────────────────────┐
                   │        ┌───────────▶│ Creator (revision)       │
                   │        │            └───────────┬──────────────┘
                   │        │                        │ back to scoreDraft
                   │        └────────────────────────┘  (max 3)
                   ▼
          evaluateHtmlChecks(): 3 rich-media checks, reported post-render
```

**The Judge is only invoked when the score fails.** If the first draft reaches
the target, there is no audit call at all — cheaper than today's pipeline,
where a reviewer always runs when enabled.

---

## 1. Deterministic scoring

### 1.1 Shared check logic

`evaluateSeoChecklist(htmlContent, metadata, focusKeyphraseInput)` is split so the
same logic runs on a markdown draft and on rendered HTML.

Of the 17 existing checks, **14 are computable from the draft**:

- metadata-only: `seo_title_length`, `seo_title_keyphrase`, `headline_present`,
  `meta_desc_length`, `meta_desc_keyphrase`, `focus_keyphrase_length`
- text-derived: `keyphrase_in_p1`, `keyphrase_density`
- structure: `no_h1_in_body`, `heading_structure`, `h2_paragraph_rule`,
  `paragraph_depth`, `keyphrase_in_headings`, `statistical_eeat`

The remaining **3 need rendered HTML** and are verified after the Designer:
`native_images`, `contextual_links`, `faq_schema`.

New shape in `src/utils/seoChecklist.ts`:

```ts
export interface ArticleDocument {
  text: string;                       // plain prose
  headings: { level: number; text: string }[];
  html: string | null;                // null for a markdown draft
}

export function extractDocument(source: string, kind: 'html' | 'markdown'): ArticleDocument;
export function evaluateDraftChecks(doc, metadata, focusKeyphrase): SeoCheckItem[];
export function evaluateHtmlChecks(doc): SeoCheckItem[];   // requires doc.html
export function evaluateSeoChecklist(htmlContent, metadata, focusKeyphraseInput?): SeoChecklistReport;
```

`evaluateSeoChecklist` keeps its current signature and behaviour by composing
both — `ReadabilityScorecard` and `SeoChecklistPanel` are unaffected.

### 1.2 Readability on plain text

`calculateReadability(html, lang)` becomes a thin wrapper: strip HTML, then call
a new exported `readabilityFromText(text, lang)`. Draft scoring uses
`readabilityFromText` on markdown-derived text, so `#`, `**`, and `[x](y)` never
pollute sentence and word statistics.

Known limitation, documented in code: `countSyllables` counts the vowels
`aiueo`, which suits Indonesian but ignores English `y`.

### 1.3 The scorer

New module `src/pipeline/scoreArticle.ts`:

```ts
export interface ScoredCheck {
  id: string;
  passed: boolean;
  actual: string;      // what the text actually does
  expected: string;    // what was required
}

export interface ArticleScore {
  total: number;       // 0-100, round(passed / total * 100)
  target: number;
  passed: boolean;
  flesch: number;      // measured, never fabricated
  wordCount: number;
  checks: ScoredCheck[];
}

export function scoreDraft(
  markdown: string,
  metadata: SeoMetadata,
  focusKeyphrase: string | undefined,
  targetWords: number,
  language: 'en' | 'id'
): ArticleScore;
```

`total` uses the same `passed/total*100` convention already in the repo, over
**16 checks**: the 14 draft checks, plus `flesch_range` (passing when the
measured Flesch is within `universalRules.targetFleschMin..targetFleschMax`) and
`word_count_band` (passing within ±20% of `targetWords`). A tolerance band
rather than an exact figure, because local models undershoot — measured: a
1,000-word request returned 833 and 698 words.

### 1.4 Dummy values removed

| Location | Before | After |
|---|---|---|
| `runArticle.ts` `buildArticle` | `fleschScore: 0` | measured value from the rendered HTML of the first successful format, else from the draft text |
| `ArticleWorkspace.tsx` | `{fleschScore || 65} (Yoast Compliant)` | measured value with its real status label; `—` when never computed; no unconditional compliance claim |
| `exportUtils.ts` | `metrics?.fleschScore ?? 0` | stored value, or `n/a` when absent |
| `HistoryTable.tsx` | `reviewReport.seoScore` | `score.total`, the deterministic figure |

---

## 2. The loop

`runCreatorAndReviewer` is replaced by `runGenerationLoop`.

```
if brief is null:
    # Impower is off, so the draft self-plans. The brief must exist before the
    # draft can be scored: it carries the metadata the SEO checks read.
    brief = resolveBrief(firstDraft, refinedTopic, keyphrase)

draft  = creator(seedTopic, brief, targetWords)            # iteration 1
best   = null
for i in 1..MAX_ITERATIONS (3):
    score = scoreDraft(draft.markdownContent, brief.seoMetadata,
                       keyphrase, targetWords, config.languages[0])
    if best is null or score.total > best.score.total:
        best = { draft, score }
    if score.passed: break
    if i == 3: break
    audit = judge({ markdown: draft.markdownContent,
                    failedChecks: score.checks.filter(c => !c.passed), brief })
    draft = creator({
        seedTopic: refinedTopic, originalTopic, focusKeyphrase, brief,
        targetWords,
        reviseFrom: draft.markdownContent,
        extraInstructions: formatFailedChecks(score) + audit.notes
    })
```

- The **Designer renders `best.draft`**, never the last draft. If iteration 2
  scored worse than iteration 1, the earlier, better draft is what ships.
- `reviseFrom` is a new Creator input field carrying the previous markdown;
  `buildCreatorPrompt` renders it as "REVISE THIS DRAFT" ahead of the brief.
- `formatFailedChecks` renders only the failures, most severe first, as literal
  instruction lines. Example for `score.total = 62` against `target = 85`:

  ```
  These measured checks failed. Fix each one and change nothing else:
  - Flesch reading ease is 54; required 60-70. Shorten sentences.
  - Focus keyphrase "makan bergizi gratis" is absent from the first paragraph.
  - Word count is 640; required 760-1140 (target 950).
  ```
- `MAX_ITERATIONS = 3` is a module constant. Not configurable, per the
  approved decision; the pipeline panel states it as information.
- **Best-draft retention** is by score, not recency. On a run that never passes,
  the article is built from `best`.
- **Language** for Flesch comes from `config.languages[0]`, since one markdown
  draft feeds all four rendered formats.

### 2.1 Judge becomes the auditor

`JudgeOutput` is replaced. `refinedTopic`, `searchIntent`, `audienceAngle`,
`subtopics`, and `rejectedAngles` are **deleted** — the role can no longer
express a topic, so there is nothing left to hijack the article with.

```ts
export interface AuditOutput {
  hasGaps: boolean;
  notes: string[];       // qualitative only
  priorities: string[];  // ordered, most important first
}
```

The Judge prompt receives the draft, the failing checks as readable statements,
and the brief. It is instructed explicitly: do not invent or estimate a score,
do not rewrite the article, do not change the subject. `roleSchemas.ts` gains
`validateAudit` and stops validating the removed fields.

### 2.2 Topic-fidelity cleanup

`src/pipeline/topicFidelity.ts` exists only to police a `refinedTopic` that no
longer exists. Protection now comes from a stronger mechanism — the Judge cannot
emit a topic at all, and `buildCreatorPrompt` / `buildImpowerPrompt` pin
`ORIGINAL USER TOPIC` and `PINNED FOCUS KEYPHRASE`. The module and its tests are
**deleted**; a prompt test asserts the pinning is present so the guarantee cannot
silently disappear.

### 2.3 Stage strip

`expectedStages` returns `[creating, judging, designing]` labelled
**Write → Audit → Render**. `ActivityPanel` currently finds the *first* timing
for a stage, so a repeated stage would show its earliest attempt; it changes to
use the most recent entry.

---

## 3. Configuration

- New `PipelineConfig.qualityTarget: number`, default `85`. Persisted with the
  rest of the config and covered by `sanitizePipelineConfig` (clamped to
  50-100).
- `PipelineConfig.reviewer` is **deprecated**: still read so older saved configs
  load, no longer gates anything, and is ignored by `sanitizePipelineConfig`.
- `MultiAgentConfig.reviewer` keeps its slot so saved provider settings and the
  Providers screen stay intact. The pipeline never reads it.
- The `PipelineSettingsPanel` "Reviewer — quality gate" block becomes a
  **Quality Gate** block: a target-score slider plus a read-only note that the
  loop runs at most 3 iterations and that Audit only runs after a failed score.

---

## 4. Persistence and History

`GeneratedArticle` gains:

```ts
score?: ArticleScore;
belowTarget?: boolean;
remainingGaps?: string[];
```

`RunRecord.status` gains `below_target`, and `RunRecord` gains
`targetScore?: number` and `achievedScore?: number`.

- `reviewReport` still stores the last audit, but its `seoScore` is no longer
  treated as a score anywhere in the UI.
- History's articles table shows `score.total` plus a `below target` badge.
- `ArticleWorkspace` shows a below-target banner listing `remainingGaps` and
  offers **Run the loop again**, which restarts generation for the same topic.
- An interrupted or failed run remains journalled and retryable, per the existing
  run journal.

---

## 5. Testing

**Scoring — the anti-rubber-stamp tests.** Fixtures where a deliberately poor
draft must fail the specific checks expected of it, and a compliant draft must
pass. Without these, a scorer that always returns 100 would pass every test.

- `markdownToPlainText` / `extractDocument` unit tests.
- `readabilityFromText` equals `calculateReadability` on equivalent HTML.
- `scoreDraft` on a bad draft: fails `flesch_range`, `keyphrase_in_p1`,
  `word_count_band`; `total` below target.
- `scoreDraft` on a compliant draft: passes, `flesch` is the measured value.
- `evaluateSeoChecklist` still composes all 17 checks (existing callers intact).

**Loop behaviour.**

- First draft passes → exactly 1 creator call, **0** judge calls.
- Fails twice then passes → 3 creator calls, 2 judge calls, saved article is the
  passing draft.
- Never passes → `belowTarget: true`, saved article is the **highest-scoring**
  draft, `remainingGaps` recorded.
- All stages off → still exactly 2 calls (regression guard already added).

**Migration of existing tests.** `runArticle.test.ts` currently asserts the Judge
feeds `refinedTopic` to the Creator ("feeds the refined topic from Judge to
Creator", "still accepts a judge refinement that stays on the user subject",
"never lets a drifted judge angle replace the topic the user typed"). All three
depend on a field that no longer exists and are rewritten against the new
contract: the topic reaching Impower and Creator is the user's seed topic, and
the Judge contributes gap notes only.

---

## Out of scope

- **Explicit `num_ctx` in `providers.ts`.** Measured: the app inherits Ollama's
  allocation from the environment (`OLLAMA_CONTEXT_LENGTH=64192` on this
  machine); Ollama's own default is 4096, which the audit stage (~3.6k tokens)
  would approach. Worth pinning to a fixed value, tracked separately.
- **Wider word-count tolerance for local models.** The ±20% band in §1.3 is the
  first step; making tolerance provider-aware is separate work.
- **Batch CSV overrides.** `useBatchQueue.ts` lets a CSV's `Impower_Level` /
  `Reviewer_Mode` columns override the global toggles. Pre-existing, unrelated to
  this change.
- **Designer's content-loss risk in inline-CSS mode.** Measured 1,644 chars
  emitted versus 5,768 in clean mode with identical markdown — content appears to
  be dropped by small local models, and nothing detects it. Worth a check of its
  own.

## Implementation order

The change is one feature but four dependent layers. Each phase is independently
testable and leaves the app working.

1. **Scoring foundation** — `extractDocument`, `evaluateDraftChecks`,
   `evaluateHtmlChecks`, `readabilityFromText`, `scoreArticle.ts`, plus their
   tests. No behaviour change yet; `evaluateSeoChecklist` keeps its signature.
2. **Remove the dummies** — real Flesch in `buildArticle`, drop `|| 65` and
   `?? 0`, add `score` to the article record. Ships the honest numbers before
   any loop exists.
3. **The loop** — `runGenerationLoop`, `AuditOutput`, `validateAudit`, the Judge
   prompt rewrite, `best`-draft Designer rendering, delete `topicFidelity`,
   migrate the three existing Judge tests.
4. **Configuration, persistence and UI** — `qualityTarget`, deprecated
   `reviewer`, the Quality Gate panel, below-target banner, History score column.

---

## Risks

- The scorer can measure structure, SEO and readability. It **cannot** measure
  whether the prose is good. That remains the Judge's qualitative job, and it is
  a real limit of this design.
- A draft that fails only on Flesch will loop while the model keeps writing the
  same way. The 3-iteration bound is what makes this safe, and the best-draft
  rule is what keeps the failure from degrading the result.
- `countSyllables` is English-flavoured; Indonesian Flesch will be approximate.