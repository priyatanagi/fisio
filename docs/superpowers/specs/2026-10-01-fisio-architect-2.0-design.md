# Fisio Architect 2.0 — Design Specification

**Date:** 2026-10-01
**Source:** `blueprint_v2.md`
**Status:** Approved

This document specifies the implementation of the five stages in `blueprint_v2.md`: local
database migration (IndexedDB), user profile system, multi-agent provider restructure,
designer preview with live style preview, and batch CSV generation with a concurrent queue.

---

## 1. Scope and Goals

### 1.1 Goals

1. Move article history from `localStorage` to IndexedDB so hundreds of batch articles persist safely.
2. Add a user profile so generated content is relevant to any business, not one hardcoded brand.
3. Split generation into five distinct AI roles, each with its own provider/model/API key.
4. Add a designer preview with live style rendering driven by the user profile.
5. Add batch CSV generation with a preview table, a bounded concurrent queue, and bulk export.

### 1.2 Non-Goals

- No cloud sync, no user accounts, no server-side persistence. All storage is local to the browser.
- No CSV library dependency; parsing is hand-rolled.
- No routing library dependency; a lightweight hash router is hand-rolled.
- No automated tests for React views, the hash router, or provider calls. See §10.

### 1.3 Current State Assessment

The repository has partial, uncommitted work from an earlier attempt:

| Artifact | State |
|---|---|
| `src/utils/db.ts` | Partial. `saveHistory`/`loadHistory`/`migrateHistoryFromLocalStorage` exist. `App.tsx` imports `addToHistory`, `updateInHistory`, `deleteFromHistory`, `clearHistory` which **do not exist**. Typecheck fails. |
| `src/types/profile.ts` | Type definition and `DEFAULT_USER_PROFILE` only. Referenced nowhere. Design rules lack accent/background/text colors. |
| `src/types/provider.ts` | `AgentRole`, `MultiAgentConfig`, `PROVIDER_PRESETS` present and coherent. |
| `src/components/ProviderSettingsModal.tsx` | Role sidebar and per-role config largely implemented. Will be promoted to a view (§6.4). |
| `src/App.tsx` | Wired to `multiAgentConfig` and `db`, but sends `multiAgentConfig` to an endpoint that does not consume it. |
| `src/server/*` | Does not exist. Provider logic lives inline in `server.ts`. |

### 1.4 Blocking Defect

`server.ts` contains literal backslash-escaped backticks inside template literals at lines
470, 478, 479, 486, and 487:

```ts
console.log(\`Generating Master Markdown for \${langCode}...\`);
```

This is a syntax error. It fails `tsc --noEmit` (20 errors) and `tsx` refuses to start the
server. **This defect is present in `HEAD` (commit `8133edd`)**, so reverting does not fix it.
It must be repaired manually. This is Stage 0.

### 1.5 Approved Design Decisions

| # | Decision | Rationale |
|---|---|---|
| D1 | All five stages in one session | Stages build on each other; one plan, one review. |
| D2 | Client-side pipeline orchestration | Per-row real-time status, client-side concurrency cap, resume-after-reload. |
| D3 | Judge always runs by default, refines the seed topic | Keeps the topic input simple while ensuring brand relevance. Toggleable. |
| D4 | Reviewer: `off` / `advisory` / `strict` | Flexibility matching Impower's levels. |
| D5 | Reviewer gate: one auto-revision, then halt for user decision | Avoids a hallucinated `fail` burning a full generation. |
| D6 | Designer: prompt-driven styling plus deterministic brand-token post-pass | Prompting alone lets the palette drift from the saved profile. |
| D7 | Batch queue: configurable concurrency 1–3 (default 2), pause/resume, per-row retry | Exists specifically to avoid 429 rate limits. |
| D8 | Language-agnostic core; Designer fans out per format | Judge/Impower/Creator/Reviewer run once per article, not once per language. |
| D9 | Profile replaces brand-specific prompt blocks; universal rules stay static | Makes prompts universal while preserving existing behavior on empty profile. |
| D10 | Lightweight hash router, no new dependencies | Deep links and back-button support for five flat views. |
| D11 | Nav rail with five routed views | Single scrolling workspace cannot hold five features. |

---

## 2. Architecture

### 2.1 Overview

The server becomes a **stateless agent-execution service**. It retains provider abstraction and
gains one generic endpoint. Prompt construction stays server-side; orchestration stays client-side.

```
┌─────────────────────────── Browser ────────────────────────────┐
│                                                                │
│  Hash Router (src/app/useHashRoute.ts)                          │
│      └── App Shell + Nav Rail (src/app/*)                       │
│              │                                                 │
│              ├── Generate view ──► TopicConsole                │
│              │                        │                       │
│              │                        ▼                       │
│              │                  runArticle()  ── core          │
│              │                        │                       │
│              ├── Batch view ────► useBatchQueue ── core        │
│              │                        │                       │
│              │   (both call the SAME runArticle)               │
│              │                        │                       │
│              │                        ▼                       │
│              │            POST /api/run-agent  (per stage)     │
│              │                                                 │
│              ├── Profile view ──► UserProfileForm              │
│              ├── History view  ──► HistoryTable                │
│              └── Providers view ─► ProviderSettings (promoted) │
│                                                                │
│  IndexedDB (src/db/*)   │  localStorage (small sync config)   │
└────────────────────────┬───────────────────────────────────────┘
                         │  fetch
                         ▼
┌────────────────────── Express (server.ts) ─────────────────────┐
│  /api/health          │  /api/test-provider │  /api/run-agent │
└────────────────────────┬───────────────────────────────────────┘
                         ▼
     src/server/providers.ts   (Gemini / OpenAI / Anthropic)
     src/server/agentPrompts.ts (per-role prompts + profile injection)
     src/server/roleSchemas.ts  (per-role validation)
```

### 2.2 Server Module Split

`server.ts` is currently 630 lines and will roughly double. It is split into four files.

| File | Responsibility | Approx. Size |
|---|---|---|
| `server.ts` | Express wiring, `/api/health`, `/api/test-provider`, `/api/run-agent`, static/Vite middleware, port fallback | ~140 lines |
| `src/server/providers.ts` | `callGemini`, `callOpenAI`, `callAnthropic`, shared JSON extraction, 429 fallback ladder | ~220 lines |
| `src/server/agentPrompts.ts` | Prompt builders for all five roles, profile interpolation, universal rules | ~280 lines |
| `src/server/roleSchemas.ts` | Per-role JSON schema shapes, parse/validate/repair, role discriminator | ~150 lines |

### 2.3 Client Module Split

| File | Responsibility |
|---|---|
| `src/pipeline/runArticle.ts` | Executes the five stages for one article. Emits stage transitions. Owns the Reviewer revision loop. |
| `src/pipeline/stages.ts` | Typed input/output shapes for all five roles, `PipelineState`, `PipelineConfig`, `SeoBrief`. |
| `src/pipeline/runAgent.ts` | Single HTTP call to `/api/run-agent`; `AbortSignal` plumbing; error normalization. |
| `src/pipeline/useBatchQueue.ts` | Worker pool, concurrency cap, pause/resume, per-row retry, persistence. |
| `src/utils/brandTokens.ts` | `applyBrandTokens`, off-palette detection, `BrandWarning`. |
| `src/utils/csv.ts` | `parseCsv`, header detection, per-row validation. |
| `src/db/index.ts` | IndexedDB open, migration, typed store accessors. |
| `src/app/useHashRoute.ts` | Hash route hook. |
| `src/app/AppShell.tsx` | Nav rail + view outlet. |

### 2.4 Endpoint Contract

**`POST /api/run-agent`**

```jsonc
// Request
{
  "role": "judge" | "impower" | "creator" | "reviewer" | "designer",
  "userProfile": UserProfile,
  "input": { /* role-specific, see §4 */ },
  "providerConfig": ProviderConfig,
  "systemPromptOverride": "optional string",
  "negativePromptOverride": "optional string"
}

// Success
{ "ok": true, "data": { /* role-specific output */ } }

// Failure
{ "ok": false, "error": "human-readable message", "recoverable": true }
```

`recoverable: true` indicates a transport or provider error worth retrying (429, timeout, empty
response). `recoverable: false` indicates a schema or validation failure after the repair attempt.

The endpoint is stateless. It holds no per-article state between calls; all inter-stage artifacts
travel in the client. This is what makes the batch queue restartable.

**Removed endpoints:** `/api/generate-article` and `/api/improve-article`. The pipeline replaces
both. `/api/health` and `/api/test-provider` are unchanged.

---

## 3. Types

### 3.1 Pipeline Types

```ts
export type AgentRole = 'judge' | 'impower' | 'creator' | 'reviewer' | 'designer';

export type ImpowerLevel = 'off' | 'lite' | 'standard' | 'max';
export type ReviewerMode = 'off' | 'advisory' | 'strict';
export type OutputFormatId = 'inline-en' | 'inline-id' | 'clean-en' | 'clean-id';
export type TargetLanguage = 'en' | 'id';

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
}
```

### 3.2 Role Output Types

```ts
export interface JudgeOutput {
  refinedTopic: string;
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  audienceAngle: string;
  subtopics: string[];
  rejectedAngles: { angle: string; reason: string }[];
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

export type ImpowerOutput = SeoBrief;   // both levels emit the identical shape

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
  seoScore: number;                 // 0-100
  issues: ReviewIssue[];
  revisedAfterIssues: boolean;      // true when produced after an auto-revision
}

export interface KeywordResearch {
  primaryKeyword: string;
  secondaryKeywords: string[];
  lsiEntities: string[];
  questionQueries: string[];
  intentModifiers: string[];
}

export interface DesignerOutput {
  html: string;
  warnings: BrandWarning[];
}
```

`ImpowerOutput extends SeoBrief` is structural: the `max` level performs keyword research first,
then synthesizes the brief, so both levels emit the same shape with the same `source: 'impower'`.

### 3.3 Profile Types

Replaces `src/types/profile.ts`:

```ts
export interface DesignRules {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  buttonStyle: 'rounded' | 'square' | 'pill';
  blockquoteStyle: 'accent-bar' | 'card' | 'plain';
}

export interface UserProfile {
  businessName: string;
  niche: string;
  location: string;
  targetMarket: string;
  usp: string;
  toneOfVoice: string;
  defaultCta: string;
  designRules: DesignRules;
  exclusions: string[];
}
```

`exclusions` holds the search-exclusion rules currently hardcoded in `DEFAULT_NEGATIVE_PROMPT`
(no consumer gym membership searches, no job-seeker searches, no second-hand equipment, etc.). It is
prefilled with that list so default behavior is unchanged, but it becomes editable, because those
exclusions are brand-specific and a physiotherapy clinic must not inherit them.

### 3.4 Batch Types

```ts
export type RowStatus =
  | 'pending' | 'judging' | 'impowering' | 'creating'
  | 'reviewing' | 'designing' | 'done' | 'failed' | 'needs_attention';

export interface BatchRow {
  rowId: string;
  index: number;
  seedTopic: string;
  focusKeyphrase: string;
  targetLength: 'short' | 'standard' | 'long' | 'custom';
  toneOverride: string;
  impowerOverride: ImpowerLevel | '';
  reviewerOverride: ReviewerMode | '';
  status: RowStatus;
  stageMessage: string;
  error: string | null;
  reviewReport: ReviewReport | null;
  articleId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  validationWarning: string | null;
}

export interface BatchJob {
  jobId: string;
  fileName: string;
  createdAt: string;
  updatedAt: string;
  concurrency: number;            // 1-3
  isPaused: boolean;
  globalConfig: Omit<PipelineConfig, 'targetWords'>;
  rows: BatchRow[];
}
```

`targetWords` is omitted from `globalConfig` because it is per-row. `BatchRow.targetLength` maps to
`PipelineConfig.targetWords` when the row runs:

| `Target_Length` | `targetWords` |
|---|---|
| `short` | 600 |
| `standard` | 950 |
| `long` | 1500 |
| `custom` | the custom word count configured in the Batch view |
| blank or unrecognized | 950 |

`custom` resolves against a Batch-view setting rather than a CSV column, because the blueprint's
column list carries no numeric length field. This keeps the CSV format unchanged.

### 3.5 Article Type Changes

`GeneratedArticle` gains:

```ts
export interface GeneratedArticle {
  // Fields below are ADDED to the existing GeneratedArticle in src/types/article.ts.
  // Existing fields (id, topic, focusKeyphrase, language, formats, seoMetadata,
  // inlineCssHtml, cleanHtml, imagePrompts, metrics, generatedAt, ...) are unchanged.

  pipelineConfig?: PipelineConfig;
  profileSnapshot?: UserProfile;   // frozen at generation time
  reviewReport?: ReviewReport;
  judgeOutput?: JudgeOutput;
  reviewPassed?: boolean;          // false when Designer ran after a failed review
  brandWarnings?: BrandWarning[];
  batchJobId?: string;
  batchRowId?: string;
}
```

All new fields are optional, so articles persisted by an earlier version remain readable without
migration of their contents.

`profileSnapshot` is important: editing the profile later must not silently change what an existing
article claims it was. History renders the snapshot, not the live profile.

---

## 4. The Pipeline

### 4.1 Core Contract

`runArticle()` is a linear sequence. `creator` and `designer` always run — that is the floor:
**topic in, HTML out.** Every other stage is opt-in.

```ts
async function runArticle(options: {
  seedTopic: string;
  focusKeyphrase?: string;
  config: PipelineConfig;
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  universalRules: UniversalRules;
  batchRefs?: { jobId: string; rowId: string };
  onStage: (stage: PipelineStage, message: string) => void;
  signal: AbortSignal;
}): Promise<RunArticleResult>
```

```ts
interface RunArticleResult {
  status: 'done' | 'failed' | 'needs_attention';
  article?: GeneratedArticle;
  reviewReport?: ReviewReport;
  error?: string;
}
```

### 4.2 State

```ts
interface PipelineState {
  seedTopic: string;
  profile: UserProfile;
  config: PipelineConfig;
  stage: PipelineStage;
  judge?: JudgeOutput;
  brief?: SeoBrief;
  markdown?: string;
  review?: ReviewReport;
  revisionAttempts: number;
  formatsBundle: FormatsBundle;
  warnings: BrandWarning[];
}
```

`revisionAttempts` is capped at 1 (D5).

### 4.3 The SeoBrief Normalization Problem

When Impower is `off`, something must still produce the brief that Creator, Reviewer, and Designer
consume. The solution is that every stage which builds a brief emits the same `SeoBrief` shape.

- **Impower `off`** → Creator is instructed to emit `selfPlanned` (its own outline and SEO metadata)
  alongside the Markdown in one response. The orchestrator folds it into `SeoBrief` with
  `source: 'creator-selfplanned'`. This applies regardless of the Reviewer mode.
- **Impower `off`, and Creator omitted `selfPlanned`** → the schema repair pass (§10.1) asked for it
  and did not get it. The orchestrator synthesizes a `source: 'minimal'` brief from the Markdown
  alone: first `#` heading as `seoTitle`, first paragraph truncated to 155 characters as
  `metaDescription`, a kebab-cased slug from the seed topic, empty arrays elsewhere. This is the
  degraded-but-working path, and it is what lets Designer run at all in the cheapest configuration.
- **Judge off** → the raw seed topic feeds Impower or Creator directly.

Downstream stages never branch on `brief.source`. This is what keeps the toggle matrix from
exploding: there are three sources, and all consumers handle all three identically.

### 4.4 Stage 1 — Judge

**Input:** `seedTopic`, `focusKeyphrase` (optional), `profile`
**Output:** `JudgeOutput`

Judge always runs by default (D3). Given the seed topic, it selects one article angle and explains
how it fits the user's target market.

`rejectedAngles` is a deliberate field: it demonstrates that Judge evaluated the seed against the
target market rather than paraphrasing it. It is displayed in the UI as collapsed detail.

### 4.5 Stage 2 — Impower

**Input:** `JudgeOutput` (or raw seed when Judge is off), `profile`
**Output:** `SeoBrief`

| Level | Calls | Output |
|---|---|---|
| `off` | 0 | none; Creator self-plans (§4.3) |
| `lite` | 1 | `seoMetadata` + up to 5 secondary keywords. Empty `outline`, `faqPlan`, `statPlan`, `internalLinkTargets`. |
| `standard` | 1 | Full brief: outline, `faqPlan`, `statPlan`, link targets, tags, slug. **Default.** |
| `max` | 2 | Call 1: `KeywordResearch` (primary + ~20 LSI entities, question queries, intent modifiers). Call 2: full brief synthesized from that research. |

`max` is the only two-call level because it is the only one doing research rather than planning.

### 4.6 Stage 3 — Creator

**Input:** `SeoBrief` (or seed topic when Impower is off), `profile`, `targetWords`
**Output:** `CreatorOutput`

Markdown only. No HTML, no metadata when Impower ran. Word count and Flesch targets come from the
brief and `config.targetWords`, not from a global system prompt.

### 4.7 Stage 4 — Reviewer

**Input:** `markdown`, `SeoBrief`, `profile`
**Output:** `ReviewReport`

| Mode | Calls | Behavior |
|---|---|---|
| `off` | 0 | Skipped entirely. |
| `advisory` | 1 | Report stored and displayed. Never blocks. Designer always runs. |
| `strict` | 1+ | Gates the pipeline (§4.8). |

### 4.8 Review Gate (strict mode)

```
verdict = runReviewer(markdown, brief)

if verdict === 'pass':
    proceed to Designer

if verdict is 'revise' or 'fail' and revisionAttempts === 0:
    revisionAttempts = 1
    markdown = runCreator(markdown = null, brief + blockerIssues appended to prompt)
    verdict = runReviewer(markdown, brief, revisedAfterIssues: true)
    if verdict === 'pass': proceed to Designer
    else: status = 'needs_attention'; HALT

if status === 'needs_attention':
    show review report banner with two actions:
      - "Retry Creator"  → resets revisionAttempts to 0, re-runs Creator + Reviewer
      - "Skip to Designer" → sets reviewPassed = false, proceeds to Designer
```

On `fail`, the Markdown is **retained**. The user can always read and copy what was produced. The
report is stored in both `needs_attention` and `done` outcomes.

In batch mode, `needs_attention` rows stop and surface a per-row Retry button; the queue does not
auto-resolve them, because an automatic retry loop across hundreds of rows would burn quota
unboundedly.

### 4.9 Stage 5 — Designer

**Input:** `markdown`, `profile.designRules`, per-target `(language, cssMode)`
**Output:** HTML string + `BrandWarning[]`

Fan-out. For each combination in `languages × {inline, clean}` filtered by `config.targetFormats`:

```
Promise<OutputFormatId, string>
```

All combinations run concurrently, **capped at 2 concurrent designer calls** regardless of the
batch queue's own concurrency setting. Batch concurrency 2 × designer fan-out 2 = 4 concurrent
provider calls, which is the intended ceiling.

Each returned HTML then passes through `applyBrandTokens()` (§7.2) before entering the preview or
storage.

Truncation protection from the existing `src/utils/cleanHtmlUtils.ts` (`isCleanHtmlIncomplete`,
`synthesizeCleanHtml`) moves from `/api/generate-article` into this stage.

### 4.10 Cost Model

At defaults (`standard` impower, `strict` reviewer, EN + ID, inline + clean):

| Stages | Calls |
|---|---|
| Judge + Impower + Creator + Reviewer | 4 |
| Designer (2 languages × 2 CSS modes) | 4 |
| **Total** | **8** |
| With one auto-revision | 10 |

Floor (Impower off, Reviewer off, Judge off, one format): **2 calls** — Creator plus Designer.

This is why batch rows default to cheaper settings: the CSV can enable the expensive stages for
rows that deserve them.

---

## 5. Prompt System

### 5.1 Block Decomposition

| Block | Source | Scope |
|---|---|---|
| `UNIVERSAL_RULES` | Static TS constants | Flesch targets, no-`<h1>`, no-`<script>` in inline mode, no emojis, minimum 3-sentence paragraphs, image and internal-link rules, FAQ schema rules. |
| Brand identity | `profile` | business name, niche, location, target market, USP, tone of voice, default CTA. |
| Exclusions | `profile.exclusions` | Search-exclusion rules. Prefilled from current `DEFAULT_NEGATIVE_PROMPT`. |
| Design tokens | `profile.designRules` | Palette, fonts, element styles. Injected into Designer only. |
| Role instructions | `src/server/agentPrompts.ts` | Per-role task definition and output schema. |

### 5.2 What Moves Out of the Hardcoded Prompt

`DEFAULT_BASE_SYSTEM_PROMPT` in `src/config/defaultPrompts.ts` currently hardcodes RealleaderUSA
commercial gym equipment content. The decomposition:

- **Retained as `UNIVERSAL_RULES`:** Flesch/readability standards, no-`<h1>`, no-script-in-inline,
  no-emoji, paragraph structure, SEO metadata limits, FAQ schema requirements, image tag rules,
  linking rules, image-prompt generation rules.
- **Moved to `profile`:** audience segments, tone and positioning, brand colors, CTA requirements,
  and all RealleaderUSA-specific references.
- **Moved to `profile.exclusions`:** the five B2B search-exclusion categories.

`DEFAULT_BASE_SYSTEM_PROMPT` is deleted. Its universal portion is replaced by `UNIVERSAL_RULES` in
a new `src/config/universalRules.ts`. `DEFAULT_NEGATIVE_PROMPT` becomes the default value of
`profile.exclusions`.

### 5.3 Fallback Behavior

When the profile is empty, every brand field falls back to the current RealleaderUSA values, so
the app behaves exactly as it does today. Because this fallback would silently produce off-brand
content, the header displays a "Profile not configured" chip linking to the Profile view whenever
required fields are blank.

### 5.4 Escape Hatches

- **Universal rules override** — the existing RulesModal (⌘,) edits `UNIVERSAL_RULES`, stored at
  `localStorage.fitseo_universal_rules`.
- **Per-role prompt override** — ProviderSettingsModal offers a system-prompt textarea next to each
  role's model selector, so Judge can be tuned independently of Creator.

---

## 6. Navigation and Views

### 6.1 Routing

Hand-rolled hash router (D10). ~40 lines:

```ts
export type RouteId = 'generate' | 'batch' | 'profile' | 'history' | 'providers';

export function useHashRoute(): [RouteId, (id: RouteId) => void]
```

Parses `location.hash` (`#/batch` → `'batch'`), defaults to `'generate'`, listens to `hashchange`,
and sets the hash on navigation. `Ctrl/Cmd+1`–`5` switch views, mirroring the existing ⌘1–⌘4
format shortcuts.

### 6.2 App Shell

```
┌────────────┬──────────────────────────────────────┐
│  Fisio     │                                      │
│  Architect │  ← nav rail                          │
│            │                                      │
│ ● Generate │  ← view content swaps here           │
│ ○ Batch    │                                      │
│ ○ Profile  │                                      │
│ ○ History  │                                      │
│ ○ Providers│                                      │
│            │                                      │
│ [chip]     │                                      │
└────────────┴──────────────────────────────────────┘
```

### 6.3 View Inventory

| Route | Contents |
|---|---|
| `generate` | `TopicConsole` (adds pipeline toggles), progress indicator, `ArticleWorkspace` with the new preview panel. |
| `batch` | CSV upload, preview table with validation, queue table, concurrency control, pause/resume, exports. |
| `profile` | `UserProfileForm`. Replaces the profile modal. |
| `history` | `HistoryTable`. Promoted from `HistoryDrawer`; a slide-over cannot hold hundreds of articles. Filter by language, provider, and date. |
| `providers` | `ProviderSettings`. Promoted from `ProviderSettingsModal`, plus per-role prompt overrides. |

### 6.4 Modal Demotions

`HistoryDrawer` and `ProviderSettingsModal` become views and are deleted as modals. A lightweight
"quick edit" profile popover remains reachable from the header. `RulesModal` (⌘,) and
`ShortcutsModal` (⌘/) remain modals — they are genuinely transient.

### 6.5 ArticleWorkspace Split

`ArticleWorkspace.tsx` is 1347 lines and gains the preview panel. Split into:

- `ArticleWorkspace` — shell, tab bar, active-format state.
- `HtmlPreviewPane` — source view plus sandboxed iframe.
- Existing `SeoChecklistPanel`, `ReadabilityScorecard`, metadata panel — unchanged.

---

## 7. Designer Preview and Brand Tokens

### 7.1 Preview UI

- Split view: readonly HTML source on one side, live `iframe srcdoc` on the other.
- Format tabs reuse the existing `activeFormat` state and ⌘1–⌘4 shortcuts. No new selection concept.
- Viewport toggle (Desktop / Tablet / Mobile) changes the iframe width, not the rendered HTML. This
  catches CTA buttons and FAQ accordions breaking at 375px.
- The existing SEO checklist and Flesch score re-run against the previewed HTML, so those panels
  score what the user is actually looking at.

### 7.2 `applyBrandTokens`

```ts
export interface BrandWarning {
  hex: string;
  occurrences: number;
}

export function applyBrandTokens(
  html: string,
  rules: DesignRules,
  options?: { forcePalette?: boolean }
): { html: string; warnings: BrandWarning[] }
```

Three passes:

1. **Custom properties.** Rewrite CSS custom properties (`--primary`, `--dark`, `--slate`,
   `--bg-neutral`, `--border`) to profile values.
2. **Legacy hex mapping.** Map the known legacy values (`#cc2929`, `#1a1d20`, `#333940`,
   `#f8fafc`, `#e2e8f0`) to their profile equivalents, so a Designer run echoing the old hardcoded
   palette still comes out on-brand.
3. **Off-palette scan.** Collect surviving 6-digit hex values not in the profile palette as
   `warnings`.

Warnings are **not** errors. A designer may legitimately use a neutral grey or a gradient stop;
blocking would be noise. They surface as a dismissible amber chip ("3 off-palette colors detected")
with a **Force palette** toggle that snaps them to the nearest profile token by RGB distance. Off by
default, because silently recoloring the AI's work is worse than flagging it.

### 7.3 Iframe Sandbox

```html
<iframe sandbox="allow-scripts allow-popups allow-forms" srcdoc="...">
```

Generated HTML contains `<script>` (the clean-HTML format ships a FAQ accordion and reading-progress
bar), so `allow-scripts` is required — omitting it would misrepresent the output by showing a
non-functional FAQ.

`allow-same-origin` is **deliberately omitted**. Without it the iframe runs in an opaque origin and
cannot read app storage, cookies, or `localStorage`, even though it is same-site. The content is
AI-generated and profile-influenced, so it is treated as untrusted.

---

## 8. Batch Generation

### 8.1 CSV Format

```
Topic_Idea,Focus_Keyphrase,Target_Length,Tone_Override,Impower_Level,Reviewer_Mode
```

The first four columns are from the blueprint. `Impower_Level` and `Reviewer_Mode` are per-row
overrides of the batch's global settings; blank inherits the global value.

### 8.2 Parsing

Hand-rolled (~30 lines), no dependency. Handles:

- Quoted fields containing commas and newlines.
- CRLF and LF line endings.
- UTF-8 BOM stripping.
- Present or absent header row (detected by testing whether row 1 matches known column names).
- Trailing empty lines.

Validation: rows missing `Topic_Idea` are flagged with `validationWarning` and excluded from the run
rather than silently dropped. Unrecognized `Impower_Level` or `Reviewer_Mode` values fall back to the
global setting with a warning badge on that row, not a failed import.

### 8.3 Preview Table

Upload → parse → validation preview table with per-row status, before any generation begins.

### 8.4 Worker Pool

`useBatchQueue` runs N workers over the row array. Each worker claims the next `pending` row, calls
`runArticle()`, writes the result, and marks the row `done` or `failed`.

```
pending → judging → impowering → creating → reviewing → designing → done
                                                                   ↘ failed
                                                       ↘ needs_attention (strict reviewer halt)
```

Controls: concurrency select (1–3, default 2), Generate All, Pause/Resume, Cancel Job, per-row Retry,
Clear Job. Pause and Cancel are separate actions with different semantics (§8.5, §8.6).

### 8.5 Abort Semantics — Critical

Each stage is a separate `fetch`, and the server's 429 fallback ladder already tries four Gemini
models before failing. With batch concurrency 2 that ladder multiplies.

`runArticle` therefore threads an `AbortSignal` through **every** stage call. There are exactly two
reasons to abort:

| Trigger | Scope | Row outcome |
|---|---|---|
| **Cancel job** (user discards the batch) | All in-flight rows | Reset to `pending` |
| **View unmount / page unload** | All in-flight rows | Left as-is; reset to `pending` on next load |

An `AbortError` at any point is **never** recorded as `failed`. It resets the row to `pending`. This
is the single most important correctness rule in the queue: without it, cancelling or reloading a
batch produces a column of spurious failures for work that was never actually lost.

Abort is deliberately **not** triggered by Pause (§8.6), because killing an in-flight request wastes
the tokens already spent on it.

### 8.6 Pause Semantics

Pause stops workers from claiming new rows. In-flight rows run to completion, then no new rows are
claimed. No `AbortController` is fired. This costs the user nothing and produces no failed rows.

The distinction is deliberate and load-bearing:

- **Pause** — "stop when you're ready." Free, non-destructive, instant to reverse.
- **Cancel** — "abandon this." Fires `AbortController`, resets in-flight rows, discards the job.

### 8.7 Persistence

One `BatchJob` record in IndexedDB, written on every status transition. On reload the queue is
restored. Any row that was mid-flight when the tab closed resets to `pending` and re-runs, because
a partially generated article is not a recoverable artifact.

### 8.8 Export

- Per-row ZIP — the existing `downloadAllAsZip` in `src/utils/exportUtils.ts`.
- Whole-batch ZIP — one folder per article inside a single archive, built with the existing `jszip`
  dependency.

---

## 9. Storage

### 9.1 IndexedDB Schema

| Store | Key path | Contents | Indexes |
|---|---|---|---|
| `articles` | `id` | One `GeneratedArticle` record each | `generatedAt` |
| `jobs` | `jobId` | One `BatchJob` record each | `createdAt` |
| `meta` | `key` | `profile`, `universalRules`, `schemaVersion` | none |

**Per-record articles are the actual Stage 1 fix.** The current `db.ts` calls
`set(HISTORY_KEY, history)`, rewriting the entire array on every save. With 300 batch articles that
is roughly 300 full-array writes per batch, each re-serializing every article. One record per
article eliminates this entirely.

### 9.2 LocalStorage

| Key | Contents |
|---|---|
| `fitseo_profile` | `UserProfile` (small, needed synchronously at first render) |
| `fitseo_multi_agent_config` | `MultiAgentConfig` |
| `fitseo_universal_rules` | `UniversalRules` override |
| `fitseo_history` | **Read once during migration, then deleted** |

Profile and provider config stay in `localStorage` because they are tiny and needed synchronously on
first paint; IndexedDB is async and would require a loading gate. Both are mirrored into the `meta`
store for durability.

### 9.3 Migration

Gated on `meta.schemaVersion`. Runs once:

1. If the `articles` store is empty, read `localStorage.fitseo_history`, write each article as its
   own record, then remove the localStorage key.
2. If the legacy single-key store `fitseo_history` exists in IndexedDB (partial work from the earlier
   attempt), read and expand it into `articles`, then delete it.
3. Seed `meta.schemaVersion` to `1`.

Any failure logs and continues. A bad migration must never prevent the app from starting.

### 9.4 DB Accessors

```ts
// src/db/index.ts
export async function initDb(): Promise<void>
export async function getArticle(id: string): Promise<GeneratedArticle | undefined>
export async function putArticle(article: GeneratedArticle): Promise<void>
export async function listArticles(): Promise<GeneratedArticle[]>   // sorted by generatedAt desc
export async function deleteArticle(id: string): Promise<void>
export async function clearArticles(): Promise<void>
export async function getJob(jobId: string): Promise<BatchJob | undefined>
export async function putJob(job: BatchJob): Promise<void>
export async function clearJobs(): Promise<void>
export async function getMeta<T>(key: string): Promise<T | undefined>
export async function setMeta(key: string, value: unknown): Promise<void>
```

---

## 10. Error Handling and Testing

### 10.1 Error Classes

| Class | Example | Handling |
|---|---|---|
| **Stage failure** | Provider error, malformed JSON, empty output | Row → `failed` with a readable message. Batch continues. Retryable. |
| **Reviewer halt** | `strict` verdict still not `pass` after auto-revision | Not a failure. Surfaces the report with *Retry Creator* / *Skip to Designer*. |
| **Schema mismatch** | Valid JSON of the wrong shape | One repair attempt requesting the same shape again, then `recoverable: false`. |

The existing 429 fallback ladder in `callGemini` is preserved. It is scoped to a single call, so a
batch of N rows produces at most N ladders, not N × concurrency × stages.

### 10.2 Test Coverage

The project has no test runner. Vitest is added, targeting the pure logic where bugs are likely and
cheap to catch:

| Target | Rationale |
|---|---|
| `applyBrandTokens` | Pure string transform; off-palette detection is easy to get subtly wrong. |
| `parseCsv` | Quoted commas, CRLF, BOM, missing header are classic edge cases. |
| `useBatchQueue` reducer | Concurrency cap, pause-vs-cancel, and abort-is-not-failure look correct and are not. This is the highest-risk logic in the project. |
| Role schema validation | Malformed model output is the most likely runtime failure. |
| `SeoBrief` normalization | Creator-self-planned → brief conversion must not drop fields. |

Server provider calls, the hash router, and React views are **not** unit tested — they would need
heavy mocking for little signal. They are verified by typecheck plus manual exercise.

### 10.3 Zero-Error Verification Gate

No stage is complete until all of the following pass:

1. `npm run lint` (`tsc --noEmit`) exits with zero errors.
2. `npm run build` succeeds.
3. `npm test` passes, if tests exist for the touched modules.
4. The server starts (`npm run dev`) without error.
5. Every view (`Generate`, `Batch`, `Profile`, `History`, `Providers`) loads and renders without a
   console error.
6. A single article generates end-to-end through `runArticle`. All twelve Impower × Reviewer
   combinations are exercised: 4 Impower levels (`off`/`lite`/`standard`/`max`) × 3 Reviewer modes
   (`off`/`advisory`/`strict`). The floor combination (`off`/`off`) is verified to make exactly two
   provider calls.
7. A CSV batch of at least 3 rows completes, with pause, resume, cancel, and per-row retry exercised.
   Cancel and page-reload both produce zero spurious `failed` rows.
8. An article generated before the profile is edited still renders its original `profileSnapshot`.

Stages are committed incrementally so the repository is always in a runnable state.

---

## 11. Implementation Stages

| Stage | Contents | Exit criteria |
|---|---|---|
| **0** | Repair `server.ts` syntax errors (§1.4) | `npm run lint` clean; server starts |
| **1** | `src/db/*`, per-record schema, migration, fix `db.ts` exports | Migration verified; history round-trips through IndexedDB |
| **2** | Hash router, nav rail, app shell, five view shells | Navigation works; all views render |
| **3** | `UserProfile`, form view, prompt decomposition, fallback | Profile persists; empty-profile output matches pre-change behavior |
| **4** | Server split, `/api/run-agent`, role schemas, `runArticle` | Single article generates through all five stages |
| **5** | Designer preview, `applyBrandTokens`, workspace split | Preview renders; brand tokens applied; off-palette warnings shown |
| **6** | CSV parse, batch view, `useBatchQueue`, exports | Batch completes; pause/resume/retry verified |
| **7** | History view, export polish, dead-code cleanup | Full §10.3 gate passes |

The review gate (§4.8) is built in Stage 4 alongside `runArticle`, not deferred to Stage 7, because
the orchestrator owns the loop and retrofitting it later would mean restructuring `runArticle`.

Stages 0–3 are independent of the pipeline and reduce risk early. Stages 4–5 are the core value.
Stage 6 is additive. Stage 7 is integration and cleanup.

---

## 12. Open Items Resolved During Design

These were decided in conversation and are recorded here so implementation does not relitigate them:

| Question | Decision |
|---|---|
| Scope of this work | All five stages, one spec, one plan (D1). |
| Pipeline location | Client-side orchestration (D2). |
| Judge in the flow | Always runs by default, refines the seed; toggleable (D3). |
| Reviewer gate | One auto-revision, then halt for user decision (D5). |
| Reviewer levels | `off` / `advisory` / `strict` (D4). |
| Designer styling | Prompt-driven plus deterministic post-pass (D6). |
| Batch queue | Concurrency 1–3 default 2, pause/resume, per-row retry (D7). |
| Language × format | Language-agnostic core; Designer fans out (D8). |
| Profile vs hardcoded prompts | Profile replaces brand blocks; universal rules stay static (D9). |
| Routing | Lightweight hash router, no dependency (D10). |
| Navigation | Nav rail with five routed views (D11). |
| Preview cost control | Users deselect formats in `TopicConsole`; no new preview-only affordance. |
| Preview iframe | `sandbox="allow-scripts allow-popups allow-forms"`; `allow-same-origin` omitted, so opaque origin. |

---

## 13. File Change Map

### New files

```
src/server/providers.ts
src/server/agentPrompts.ts
src/server/roleSchemas.ts
src/config/universalRules.ts
src/pipeline/stages.ts
src/pipeline/runAgent.ts
src/pipeline/runArticle.ts
src/pipeline/useBatchQueue.ts
src/utils/brandTokens.ts
src/utils/csv.ts
src/db/index.ts
src/db/migrate.ts
src/app/useHashRoute.ts
src/app/AppShell.tsx
src/components/UserProfileForm.tsx
src/components/PipelineSettingsPanel.tsx
src/components/BatchUploadTable.tsx
src/components/BatchQueueTable.tsx
src/components/HtmlPreviewPane.tsx
src/components/HistoryTable.tsx
src/views/GenerateView.tsx
src/views/BatchView.tsx
src/views/ProfileView.tsx
src/views/HistoryView.tsx
src/views/ProvidersView.tsx
```

### Modified files

```
server.ts                     — strip provider logic, add /api/run-agent
src/App.tsx                   — reduce to shell + route dispatch
src/types/article.ts          — add pipeline fields
src/types/provider.ts         — add AgentRole labels/metadata
src/types/profile.ts          — extend DesignRules, add exclusions
src/utils/exportUtils.ts      — add batch ZIP export
src/config/defaultPrompts.ts  — remove DEFAULT_BASE_SYSTEM_PROMPT, keep segments/lists
src/components/ArticleWorkspace.tsx — split
src/components/HistoryDrawer.tsx    — delete (becomes HistoryTable)
src/components/ProviderSettingsModal.tsx — promote to view
src/components/Header.tsx     — nav chip, profile status
src/components/TopicConsole.tsx — add pipeline toggles
package.json                  — add vitest, test script
```

### Deleted files

```
src/utils/db.ts               — superseded by src/db/index.ts
src/components/HistoryDrawer.tsx
src/components/ProviderSettingsModal.tsx
```

---

## 14. Acceptance Criteria

The work is complete when:

1. `npm run lint` and `npm run build` exit with zero errors.
2. The app starts and all five views render without console errors.
3. A topic with Impower off and Reviewer off produces HTML using exactly two provider calls.
4. A topic at defaults (standard Impower, strict Reviewer, EN+ID, inline+clean) produces four
   formats with a stored review report.
5. A failing strict review triggers exactly one automatic Creator revision, then halts with visible
   retry and skip actions.
6. Editing the profile changes newly generated output and leaves existing articles rendering their
   original snapshot.
7. Designer output contains no legacy hardcoded brand hexes after `applyBrandTokens`.
8. A 3-row CSV batch completes with at most the configured concurrency in flight.
9. Pausing mid-batch produces zero `failed` rows, and in-flight rows complete.
10. Cancelling mid-batch or reloading the page mid-batch produces zero `failed` rows; affected rows
    return to `pending` and re-run.
11. A 300-article history loads from IndexedDB without rewriting the full set on each save.
12. Generated HTML in the preview iframe cannot access app storage or cookies.
13. `npm test` passes.
