# Fisio Architect 2.0

![Fisio Architect — Generate view with the routed sidebar](docs/images/app-generate.png)

A local-first, multi-agent **SEO article generator** for B2B commercial-fitness content. It
turns a seed topic into publish-ready, brand-styled HTML through a configurable pipeline of LLM
agents — Judge → Impower → Creator → Reviewer → Designer — with per-role provider routing, batch
generation from CSV, a deterministic quality scorecard, a sandboxed live preview, an in-article
Improver, and IndexedDB history.

Everything runs locally: an Express + Vite server, a browser SPA, and your own LLM provider —
including **free local inference via Ollama**.

---

## Highlights

- **Configurable cost vs. quality pipeline** — turn Judge/Impower/Reviewer on or off; the floor
  (everything off, one format) is exactly **2 provider calls** (Creator + Designer).
- **Strict review gate with recovery** — a failing Reviewer forces one automatic Creator revision,
  then halts. The halted draft stays readable/copyable, with **Retry Creator** / **Skip to Designer**
  actions to resume without re-running the whole pipeline.
- **Deterministic quality scoring** — `scoreArticle.ts` grades Markdown (and `scoreHtml.ts` the
  rendered HTML) on SEO checklist, word-count band, and Flesch readability with an 85 default pass
  target; unreachable bands are reported but never counted against a run.
- **Improver** — after a run, feed the rendered HTML plus measured evidence (failing checks,
  reviewer issues, brand tokens) to a front-end-repair agent that returns patched HTML and a
  change list, re-scored before it replaces the draft.
- **Live activity feed** — every agent call is traced server-side and streamed to an in-app panel:
  per-call status, provider/model, attempts, repairs, chunk fallbacks, token usage, and timings.
- **Truncation recovery for local models** — Creator/Designer outputs that get cut off are retried
  with a chunk-and-stitch fallback, the main reason Ollama runs stay reliable.
- **Five routed views** (hash router): Generate, Batch, Profile, History, Providers.
- **Per-role provider config, auto-saved** — each field persists the moment you edit it; a unified
  selector applies one provider/model choice to all five roles at once.
- **Local & cloud providers**: Google Gemini, OpenAI-compatible, Anthropic, and **Ollama (no key,
  free)** — with real, searchable model catalogs per provider.
- **Brand kit & design tokens** — one token source drives the React preview, the Designer prompt,
  and a compiled stylesheet; generated HTML is verified against the palette and WCAG contrast is
  checked at save time. Named presets with per-format overrides, export/import.
- **Batch generation** from CSV with a worker pool (concurrency 1–3), pause / cancel / per-row retry,
  and queue persistence across reloads.
- **Sandboxed HTML preview** in an opaque-origin iframe (agent output cannot touch app storage).
- **Export** a single article or a whole batch as a ZIP (per-article folders with every HTML format,
  metadata, Markdown, and the review report). Manual HTML snapshots per format (up to 50).
- **Local-first storage**: articles, batch jobs, and run records in IndexedDB; small settings in
  `localStorage`. No account, no telemetry.
- **Unfinished-runs recovery** — failed or interrupted runs are listed on launch with retry/forget,
  so nothing is silently lost.

---

## Tech stack

| Layer | Choice |
|---|---|
| UI | React 19, TypeScript, Tailwind CSS v4, `lucide-react`, `motion` |
| Build / dev | Vite 8 (`@vitejs/plugin-react`), `tsx` |
| Server | Express 4 (serves the Vite dev middleware and the API) |
| AI SDKs | `@google/genai` + plain `fetch` (OpenAI / Anthropic / Ollama) |
| Persistence | Hand-rolled IndexedDB layer (`src/db`, v2), `localStorage` |
| Export | `jszip` |
| Tests | Vitest (523 tests / 36 files), `fake-indexeddb` |

TypeScript is checked with `tsc --noEmit` (the `lint` script). No separate linter is configured.

---

## Quick start

**Prerequisites:** Node.js 18+. To use local models, [Ollama](https://ollama.com) running
(`ollama serve`) with at least one model pulled.

```bash
npm install
cp .env.example .env       # then fill in what you actually use (see below)
npm run dev                # Express + Vite dev server, http://localhost:5177
```

If port 5177 is busy the server automatically tries the next one (up to 10 attempts) and prints the
real URL. Always open the URL printed at startup — a stale `localhost:3000` bookmark will land in
whatever other app owns that port.

Two safeguards back that up, because a restored browser tab can otherwise show you the wrong app:

- The sidebar footer prints the bound port and a per-process instance tag (e.g. `:5177 · BF58`), so
  any tab immediately reveals which server is answering it (parsed from `/api/health`).
- HTML and API responses are sent `Cache-Control: no-store`. Firefox restores session tabs from
  bfcache without contacting the server, so `localhost:3000` could keep displaying whichever app
  owned that port earlier. `no-store` is what prevents that; `no-cache` alone does not.

### Zero-cost testing with Ollama

Open the **Providers** view, pick a role, choose **Ollama (Local)**, and (optionally) press
**Test**. Then generate — no API key or spend. By default the provider resolves to
`http://localhost:11434` / model `gemma4:e4b`; change either per role, or globally with the
`OLLAMA_BASE_URL` / `OLLAMA_MODEL` env fallbacks.

---

## Configuration

Environment variables (documented in [`.env.example`](.env.example)). These are **server-side
fallbacks/defaults** — per-role provider settings live in the Providers view (`localStorage`):

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Fallback key for the Gemini provider (only needed when a Gemini role leaves its own key blank). |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | Server-side fallbacks for the OpenAI-compatible provider (blank per-role fields fall back to these). |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` | Same fallback pattern for Anthropic. |
| `OLLAMA_BASE_URL` | Default base URL for the Ollama provider (blank per-role base URL falls back to this). |
| `OLLAMA_MODEL` | Default model id for the Ollama provider (blank per-role model falls back to this). |
| `APP_URL` | Hosted app URL used for self-referential links. |
| `PORT` | Express listen port; defaults to `5177` with automatic fallback. |
| `DISABLE_HMR` | Set to `true` to disable Vite HMR/file watching (used by hosted editors). |

### Provider roles

Five user-configurable roles — **Judge**, **Impower**, **Creator**, **Reviewer**, **Designer** —
each pointing at any provider. Two internal roles exist (`InternalRole` in
`src/pipeline/stages.ts`) and silently reuse an existing role's provider config, so the provider UI
stays at five roles:

- **`research`** — powers Impower's `max` keyword pass; reuses the **Impower** provider.
- **`improver`** — powers the post-run HTML repair; runs on the **Designer** provider.

Provider fields **auto-save per role** the instant you change them (no Apply step), so nothing is
lost when you navigate away or reload. Each role keeps per-provider saved settings (model/key/base
URL), so switching providers restores your last choice for that provider. The **ModelPicker**
queries the provider's real model catalog (60 s cache, offline-safe fallback to built-in
suggestions); Base URL / API key fields carry autofill guards so password managers don't corrupt
them.

---

## How the pipeline works

```
Seed topic ─▶ [Judge] ─▶ [Impower (+research)] ─▶ [Creator] ─▶ [Reviewer] ─┬─▶ [Designer fan-out] ─▶ HTML formats
             optional       optional, 1-2 calls    always       off/advisory│   one call per format
                                                                            └─ strict: 1 auto-revision,
                                                                               then halt → Retry / Skip
```

**Pipeline settings** (Generate view, persisted to `fitseo_pipeline_config`) and their provider-call
cost for a single format:

| Impower | Reviewer: off | advisory | strict |
|---|---|---|---|
| off | 2 | 3 | 3 (5 with revision) |
| lite | 3 | 4 | 4 (6 with revision) |
| standard | 4 | 5 | 5 (7 with revision) |
| max | 5 | 6 | 6 (8 with revision) |

Judge adds one call when enabled. Default config: Judge on, Impower `standard`, Reviewer `strict`,
all six formats (`inline-en`, `inline-id`, `clean-en`, `clean-id`, `json-en`, `json-id`), languages
`en`+`id`, 950 target words. The `json-*` formats cost no provider call — they are assembled from
the resolved SEO metadata plus that language's rendered body (`src/utils/articleJson.ts`), and the
Designer fan-out skips them. Persisted configs are **sanitized on read**
(`src/app/pipelineConfig.ts`) so a damaged or hand-edited value falls back to defaults instead of
silently enabling a stage.

- **Reviewer modes** — `off` (no gate), `advisory` (reports but never blocks), `strict` (blocks with
  one automatic revision).
- **Review gate + resume** — when a strict review still fails after the one revision, the run halts
  with status `needs_attention`. `runArticle.resumeArticle()` powers the two actions:
  - **Retry Creator** re-runs the Creator → Reviewer cycle (and Designer if it clears);
  - **Skip to Designer** renders the retained Markdown straight through the Designer.
  Both keep the same article id, so the rebuilt record replaces the halted one.
- **Topic fidelity guard** — the Judge cannot silently rewrite your seed topic off-niche; EN+ID
  stop-word-stripped token overlap is checked against the original seed.
- **Designer fan-out** renders one HTML document per selected format, applying brand design tokens;
  off-palette colours are flagged in the preview. Structural guarantees are code-enforced after the
  Designer (`src/utils/articleShell.ts`): fluid text width, no root width caps, normalized shell.
- **Chunk-and-stitch fallback** (`src/server/chunked.ts`) — for `creator` (4 sections) and
  `designer` (3), a truncated/unparseable first attempt is re-planned as per-section JSON calls
  whose bodies are stitched with heading/tail de-duplication. This is what makes small local
  models usable for long outputs.
- **Runs are tracked** — every run writes a `RunRecord` (`running | done | needs_attention |
  failed | interrupted`) to IndexedDB, powering the activity feed and unfinished-run recovery.

Key files: `src/pipeline/runArticle.ts`, `src/pipeline/runAgent.ts`, `src/pipeline/stages.ts`,
`src/server/agentPrompts.ts`, `src/server/roleSchemas.ts`, `src/server/providers.ts`.

---

## Quality scoring & Improver

- **`scoreArticle.ts`** — deterministic score over the Markdown draft: SEO checklist + word-count
  band (±20% tolerance) + Flesch readability band, default pass target 85. Rules that are
  unreachable for a given length (`fleschCeiling`) are reported as `unavailable`, not failed.
- **`scoreHtml.ts`** — the same checks re-run against the rendered HTML, so the editor shows what
  the reader actually gets. The UI also surfaces a readability scorecard and SEO checklist panel.
- **Improver** (`src/pipeline/improveArticle.ts` + `buildImproverPrompt`) — takes the editor's
  current HTML plus the measured evidence (failing checks, reviewer issues, brief, brand tokens,
  your instruction) and returns repaired HTML with a change list, normalized and re-scored.

---

## Brand kit & design tokens

- **`src/config/designTokens.ts`** — single source of truth: every token (colors, typography,
  headings, quotes, tables, FAQ, buttons, image frame, caption style, …) maps to both the React
  preview styles and the declarations compiled into the Designer prompt.
- **`src/config/tokenCss.ts`** — compiles tokens into the real stylesheet (clean and inline modes)
  and **verifies generated HTML** for palette compliance (`verifyTokenCompliance`).
- **`src/config/tokenContrast.ts`** — WCAG 2.1 contrast validation of token pairs, surfaced when
  the profile is saved.
- **`src/config/brandPresets.ts` + `BrandKitPanel`** — named complete presets with per-format
  overrides, plus export/import of the kit.
- **`UserProfileForm`** (Profile view) — business info, tone, CTA, and a resizable split of design
  token controls vs. a live article-sample preview (`LiveTokenTestBanner`); `RuleDiffPanel` shows
  unsaved token diffs before they overwrite.

---

## Batch mode

Upload a CSV (header-aware parser in `src/utils/csv.ts`), press **Generate All**, and a worker pool
(`src/pipeline/useBatchQueue.ts`) runs rows with concurrency clamped to **1–3**:

- **Pause** — in-flight rows finish cleanly, no new rows are claimed.
- **Cancel** — in-flight rows reset to `pending` (never marked `failed`).
- **Per-row retry** after failures.
- **Persistence** — the queue survives a page reload; in-flight rows come back as `pending`.
- **Download Batch ZIP** — one archive, a folder per article.

CSV columns: `Topic_Idea`, `Focus_Keyphrase`, `Target_Length`, `Tone_Override`.

---

## Live activity feed

- The server buffers per-run `AgentEvent`s in memory (`src/server/agentEvents.ts`, 10-minute TTL,
  400 events/run) published around every provider call.
- `GET /api/events?runId&since` is polled every 400 ms by `src/pipeline/agentEvents.ts`; the
  `useAgentEvents` hook adds a 700 ms final flush so nothing is cut off.
- `agentActivity.ts` reduces events into per-call records (attempts, repairs, chunk fallbacks,
  token usage, timings) that `ActivityPanel.tsx` renders as a live log with stage totals.

---

## Storage model

- **IndexedDB** database `fisio_architect` (**v2**), `src/db/index.ts`:
  - `articles` (keyPath `id`, index `generatedAt`)
  - `jobs` (keyPath `jobId`, index `createdAt`) — batch queues
  - `runs` (keyPath `runId`) — run records for activity/unfinished-run recovery
  - `meta` (keyPath `key`)
  - A one-time migration (`src/db/migrate.ts`) moves legacy `localStorage.fitseo_history` into the
    `articles` store.
- **localStorage** (small, synchronous settings): `fitseo_profile`, `fitseo_multi_agent_config`,
  `fitseo_universal_rules`, `fitseo_pipeline_config`, and the prompt overrides written by the rules
  modal (`fitseo_system_prompt`, `fitseo_negative_prompt`).
- History updates in place (`upsertArticle`, `src/app/articleList.ts`) so new saves appear without
  a reload.

The live preview runs in an iframe sandboxed as `allow-scripts allow-popups allow-forms` — it
deliberately omits `allow-same-origin`, so agent-generated HTML gets an opaque origin and cannot
read the app's `localStorage`, cookies, or IndexedDB.

---

## HTTP API

The SPA drives the pipeline one role at a time through the server:

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness + `hasKey` (whether a server Gemini key is present), plus `app`, `instance`, `port`, `pid` and `startedAt` so you can tell which dev server answered. |
| `POST /api/run-agent` | Runs a single role: builds the prompt, calls the provider (with chunked fallback where applicable), validates the JSON shape (one repair attempt on a shape problem), publishes trace events, returns typed data. |
| `POST /api/test-provider` | Connectivity test per provider. Lists the real model catalog first (so messages name actual models), then probes: Ollama/openai use model listing; Gemini/Anthropic run a tiny JSON round-trip. |
| `POST /api/models` | Real model catalog for the provider/baseURL/key currently in the form (`src/server/modelCatalog.ts`, 60 s cache, offline fallback). |
| `GET /api/events` | Poll the buffered agent activity log for a run (`runId`, `since` cursor). |

Provider dispatch and Gemini's rate-limit model ladder live in `src/server/providers.ts`.

---

## Project structure

```
server.ts                    Express app + API routes + Vite middleware, port fallback
vite.config.ts               Vite + React + Tailwind setup
vitest.config.ts             Vitest (node environment, src/**/*.test.ts)

src/
  App.tsx                    Root: settings state, localStorage persistence, route switch
  main.tsx, index.css        Bootstrap + Tailwind entry
  app/
    useHashRoute.ts          #/generate #/batch #/profile #/history #/providers
    AppShell.tsx             Nav shell around routed views
    pipelineConfig.ts        Persisted-config sanitizer
    serverInfo.ts            /api/health parsing for the identity footer
    useArticleRun.ts         Run/resume orchestration + IndexedDB records + activity wiring
    articleList.ts           upsertArticle so History refreshes in place
  views/                     Generate, Batch, Profile, History, Providers
  components/                TopicConsole, PipelineSettingsPanel, ProcessProviderSelector,
                             ArticleWorkspace, HtmlPreviewPane, ActivityPanel, UnfinishedRuns,
                             BatchUploadTable, BatchQueueTable, HistoryTable,
                             ReadabilityScorecard, SeoChecklistPanel, UserProfileForm,
                             BrandKitPanel, DesignTokenPreview, LiveTokenTestBanner,
                             RuleDiffPanel, ModelPicker, Header, RulesModal, ShortcutsModal
  pipeline/                  runArticle (+resumeArticle), runAgent, stages, seoBrief,
                             scoreArticle/scoreHtml, topicFidelity, improveArticle,
                             batchQueue + useBatchQueue (worker pool),
                             agentEvents + agentActivity + useAgentEvents (live log)
  server/                    providers (gemini/openai/anthropic/ollama), agentPrompts
                             (per-role builders incl. improver), roleSchemas (validation),
                             chunked (truncation fallback), modelCatalog, agentEvents (buffer)
  types/                     article, profile, provider, run (RunStatus/RunRecord), agentEvents
  utils/                     brandTokens, articleShell, contentVersions, autofillGuard,
                             cleanHtmlUtils, csv, exportUtils (ZIP), document, diff,
                             readability, seoChecklist, metadata/content versioning, db helpers
  config/                    designTokens, tokenCss, tokenContrast, brandPresets,
                             universalRules, defaultPrompts
  db/                        IndexedDB layer (v2: articles/jobs/runs/meta) + migration
  test/                      smoke test

docs/
  README.md                  Index of the docs folder
  UI/fisio.pen               UI design file
  images/app-generate.png    Screenshot used above
  superpowers/plans/…        Strict TDD implementation plan (Tasks 0–18, checked off)
  superpowers/specs/…        Design spec
  blueprint_v2.md            Approved v2 design notes (Indonesian)
```

---

## Commands

| Command | Does |
|---|---|
| `npm run dev` | Start Express + Vite dev server (`tsx server.ts`). |
| `npm run build` | Production client build to `dist/`. |
| `npm run preview` | Preview the built client. |
| `npm start` | Run the server (same as `dev`). |
| `npm run lint` | Type-check with `tsc --noEmit`. |
| `npm test` | Run the Vitest suite once. |
| `npm run test:watch` | Watch mode. |
| `npm run clean` | Remove `dist/` and `server.js`. |

---

## Testing

`npm test` runs **523 tests across 36 files** covering the pipeline cost matrix and review gate
(with the `resumeArticle` retry/skip paths), the batch queue state machine, CSV parsing, brief
normalization, scoring and topic fidelity, brand tokens / token CSS / contrast, export, role-schema
validation, prompt builders, model catalog, agent events, the IndexedDB layer and its migration,
and the hash router. `npm run lint` type-checks the whole project.

---

## Notes

- **Local-first.** No account or telemetry; content and settings stay in your browser's storage and
  your own provider keys.
- **Free by default.** Point every role at Ollama and the whole pipeline — including batch — runs at
  no cost for development and testing.
- **Original AI Studio scaffold:** the app was generated in [Google AI Studio](https://ai.studio/apps/3e62a594-2c35-444d-9ecd-01cae97ae89c);
  this repository is the expanded v2 build.
- See [`docs/README.md`](docs/README.md) for the design blueprint, spec, and implementation plan.
