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
| Server | Express 4 locally (Vite middleware + API); Vercel functions in `api/` for deployment — both wrap the same handler cores |
| AI SDKs | `@google/genai` (server-only, never bundled to the browser) + plain `fetch` (OpenAI / Anthropic / Ollama) |
| Persistence | Hand-rolled IndexedDB layer (`src/db`, v2), `localStorage` |
| Export | `jszip` |
| Tests | Vitest (680 tests / 49 files), `fake-indexeddb` |
| Cloud (optional) | Supabase PostgREST through plain `fetch` — no SDK, so the bundle stays small |

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

Open the **Providers** view, pick a role, choose **Ollama (Local)**, and press **Test**. Then
generate — no API key or spend. The browser calls your local Ollama directly
(`http://localhost:11434` by default); the server never touches it. One-time setup on the Ollama
side is required — see [Using Ollama](#using-ollama).

---

## Keyboard shortcuts

Only the bindings that exist today:

| Keys | What it does | Active in |
|---|---|---|
| ⌘/Ctrl + 1 … 5 | Switch view: Generate, Batch, Profile, History, Providers | anywhere |
| ⌘/Ctrl + K | Focus and select the topic field | anywhere on the Generate view |
| ⌘/Ctrl + Enter | Start the run | topic field |
| ⌘/Ctrl + S | Export the active format as an HTML file | code editor |
| Tab | Indent every line the selection touches (two spaces at the caret when nothing is selected) | code editor |
| Shift + Tab | Remove one step (two spaces) of indent from those lines | code editor |

The bindings live in `src/App.tsx` (view switching) and inside `TopicConsole` / `ArticleWorkspace`.
Nothing is bound to ⌘P, ⌘⇧C or ⌘⇧S: an old shortcut sheet promised them, but the browser owns ⌘P
and the toolbar already reaches copy and the ZIP export in one click.

---

## Configuration

Environment variables (documented in [`.env.example`](.env.example)). These are **server-side
fallbacks/defaults** — per-role provider settings live in the Providers view (`localStorage`):

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Fallback key for the Gemini provider (only needed when a Gemini role leaves its own key blank). |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` / `OPENAI_MODEL` | Server-side fallbacks for the OpenAI-compatible provider (blank per-role fields fall back to these). |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` / `ANTHROPIC_MODEL` | Same fallback pattern for Anthropic. |
| `PORT` | Express listen port; defaults to `5177` with automatic fallback. Local/self-host only. |
| `DISABLE_HMR` | Set to `true` to disable Vite HMR/file watching (used by hosted editors). Local dev only. |
| `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` | Optional cloud storage. **Public by design** — they are in the bundle. See [Cloud sync with Supabase](#cloud-sync-with-supabase-optional). |

Ollama has **no server-side variables**: its base URL and model are configured per role in the
Providers view, because the browser — not the server — talks to your local Ollama.

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
all four HTML formats (`inline-en`, `inline-id`, `clean-en`, `clean-id`), languages `en`+`id`,
950 target words. The CMS JSON package is **not** a rendered format: it is assembled at export time
from the resolved SEO metadata plus one language's body (`src/utils/articleJson.ts`), so it costs no
provider call, and the ZIP carries one per language that rendered. Its field list mirrors
`cms-extension/lib.js`, which fills the English form from nine keys and the Indonesian form from
five. Persisted configs are **sanitized on read**
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
- **Designer fan-out** renders one HTML document per selected format. Brand typography and palette are
  **stamped onto the result** rather than hoped for: `applyTokenCss` merges the token declarations
  into each styled element in inline mode, and in clean mode appends the compiled stylesheet *after*
  the one the model wrote, so element rules of equal specificity resolve to the profile. The same
  pass runs on an AI repair (`src/pipeline/improveArticle.ts`), so a fix cannot restyle the article
  off-brand. Off-palette colours are flagged in the preview. Structural guarantees are code-enforced
  after the Designer (`src/utils/articleShell.ts`): fluid text width, no root width caps, normalized
  shell.
- **Closing call to action** is part of the brief (`cta`), required by the writing rules
  (`UniversalRules.requireCta`, worded from the profile's *Default call to action*) and measured as
  the scored `cta_present` check — a missing one fails, so it reaches the Improver instead of
  shipping silently. The block is marked `class="cta"`, which is also what the brand stylesheet
  styles.
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
- **`src/config/tokenCss.ts`** — compiles tokens into the real stylesheet (clean and inline modes),
  **applies it to every render** (`applyTokenCss`, idempotent through a sheet marker) and verifies
  generated HTML for palette compliance (`verifyTokenCompliance`).
- **`src/config/tokenContrast.ts`** — WCAG 2.1 contrast validation of token pairs, surfaced when
  the profile is saved. Every reading pairing also declares which token a repair is allowed to
  move, so the page background is never the thing that gets repainted.
- **`src/config/contrastFixes.ts`** — turns those failures into a concrete proposal: the offending
  colour's lightness is walked (hue and saturation held) to the closest value that clears 4.5:1,
  and the Brand kit panel shows it as an **Auto-fix contrast** button. A colour that cannot be
  measured (someone typed `red`) is listed as unresolved instead of being silently scored.
- **`src/config/brandPresets.ts` + `BrandKitPanel`** — named complete presets with per-format
  overrides, plus export/import of the kit.
- **`UserProfileForm`** (Profile view) — business info, tone, CTA, and a resizable split of design
  token controls vs. a live article-sample preview (`LiveTokenTestBanner`); `RuleDiffPanel` shows
  unsaved token diffs before they overwrite. The four tabs each own their data: **Content rules**
  holds the search exclusions *and* the writing/SEO numbers (`UniversalRules`), and
  **Reset this section** clears only the tab on screen behind a confirm dialog.
- **`src/utils/profileIO.ts`** — the profile as a portable JSON document: download your own,
  download the sample, or import a file (both the export envelope and a bare profile object are
  accepted, unknown shapes are refused rather than half-applied). Provider keys are deliberately
  not part of this document.

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

- Cloud runs stream their activity as **NDJSON lines inside the `/api/run-agent` response
  itself** (`{"kind":"event",...}` while the provider call is in flight, one closing
  `{"kind":"result",...}` line). Ollama runs execute in the browser and emit the same events
  directly — one pipeline, two transports.
- `src/pipeline/agentEvents.ts` is a **client-side event bus**: every event is stamped with a
  per-run id on append, so parallel batch streams that share one `runId` stay in a single,
  gap-free log. `useAgentEvents` just subscribes; there is no polling and no server-side buffer.
- If a stream dies mid-run, the events already received stay in the log and `runAgent` appends a
  local `failed` event so the log always has a closing entry.
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
  `fitseo_universal_rules`, `fitseo_pipeline_config`.
- History updates in place (`upsertArticle`, `src/app/articleList.ts`) so new saves appear without
  a reload.
- **Optional cloud copy**: articles, their version history and the rules can be mirrored to your own
  Supabase project — see [Cloud sync with Supabase](#cloud-sync-with-supabase-optional). IndexedDB
  stays the working store either way; the cloud never becomes a requirement to keep generating.

The live preview runs in an iframe sandboxed as `allow-scripts allow-popups allow-forms` — it
deliberately omits `allow-same-origin`, so agent-generated HTML gets an opaque origin and cannot
read the app's `localStorage`, cookies, or IndexedDB.

---

## Cloud sync with Supabase (optional)

Off by default and inert until configured: with no `VITE_SUPABASE_*` values the app behaves exactly
as it did before, entirely local.

**What is stored**

* Each generated article as one JSONB row — including the full `contentVersions` and
  `metadataVersions` history, metrics, score, review report and the profile snapshot it was built
  from.
* One settings document per workspace: the brand profile with its **design tokens**, `exclusions`
  and per-format overrides, the universal writing/SEO rules, and the pipeline config. This is what
  makes "aturan profile" identical on every device.
* Not stored: provider selections and API keys (they stay in this browser), the run journal and
  batch job state (local-only, they are transient).

**Setup**

1. Create a Supabase project, then run [`supabase/schema.sql`](supabase/schema.sql) once in
   Project Settings → SQL Editor. It creates `fisio_articles`, `fisio_settings`, the row level
   security policies and the `fisio_cloud_handshake()` function the Test button uses.
2. Put the two public values in `.env` (or in Vercel's Environment Variables **before** deploying —
   Vite inlines `VITE_*` at build time):
   ```
   VITE_SUPABASE_URL="https://<ref>.supabase.co"
   VITE_SUPABASE_ANON_KEY="<anon public key>"
   ```
   Restart `npm run dev`.
3. Open **Providers → Cloud storage (Supabase)** → *Generate new secret* → copy it → *Save secret*
   → *Test connection*. The first sync uploads everything already on this device.
4. On a second device, paste **the same secret** instead of generating one; a new secret means a new,
   empty workspace.

**Why the secret is typed, not put in the environment**

The anon key is public by design and grants nothing on its own — row level security decides. The
policies compare the request header `X-Workspace-Secret` against the `workspace_secret` column of
each row, so that string is the only thing that opens your data. Anything in a `VITE_*` variable is
shipped inside the browser bundle, so a workspace key placed there would be handed to every visitor;
typing it once per device keeps it out of git, out of the build and out of the bundle. The client
also refuses to start sync when it finds a `service_role` key (or a key shaped like one), because
that key would bypass every policy in the schema.

**Sync behaviour**

* **Local-first.** IndexedDB is the store the UI reads; sync runs beside it and can never block or
  fail a save.
* Pull when the app finishes loading; push debounced 1.5 s after each change; drain again when the
  browser reports it is back online. Failures retry with 2 s → 4 s → 8 s … capped at 60 s.
* A pending queue (and the deletion tombstones) is persisted in IndexedDB `meta`, so work done
  offline is still uploaded after a reload.
* **Last-write-wins per article**, decided by the newest timestamp the record carries:
  `generatedAt` or the latest saved version. On an exact tie the local copy wins.
* **Version history is unioned, never replaced**, so a smaller cloud copy cannot shorten a local
  editor's history.
* An article too large for one request has its **oldest snapshots dropped from the outgoing copy
  only** — the local record keeps all 50.
* Deletes remove the row remotely and write a tombstone; a delete that could not reach the server is
  retried and the next pull will not resurrect the article.

| Caveat | Consequence |
|---|---|
| One settings row per workspace | The cloud holds one brand at a time; profiles are not multi-tenant. |
| Timestamps come from device clocks | Skewed clocks can decide a conflict wrongly; edit times are otherwise preserved. |
| Rows are plain JSONB | Readable in the Supabase dashboard (deliberate, so you can audit content). Not end-to-end encrypted. |
| A brand-new workspace looks like an empty one | On a workspace with no rows yet, the Test button cannot prove the secret is right — it says "no saved data yet" instead of pretending. |
| Payload limit ~10 MB per request | Handled by trimming outgoing snapshots; a single enormous article still may be refused. |

---

## Using Ollama

Ollama inference happens **in your browser**: the app calls the Ollama server on your machine
directly, so the deployed site never sees your local models — and the server refuses Ollama
requests with a clear message instead of silently failing.

One-time setup:

1. **Start Ollama:** `ollama serve` (listens on port 11434).
2. **Pull a model:** e.g. `ollama pull gemma4:e4b`.
3. **Allow this site's origin.** Ollama rejects cross-origin requests by default, and an HTTPS
   deployment is not an allowed origin. Set `OLLAMA_ORIGINS` *before* starting the server, to the
   exact origin you browse the app from (e.g. `http://localhost:5177` in dev, or
   `https://<app>.vercel.app` once deployed):
   - **Windows:** `setx OLLAMA_ORIGINS "https://<app>.vercel.app,http://localhost:5177"` then
     restart Ollama (close it from the tray icon, not just the terminal).
   - **macOS:** `launchctl setenv OLLAMA_ORIGINS "https://<app>.vercel.app"` then restart the
     Ollama app.
   - **Linux:** `OLLAMA_ORIGINS="https://<app>.vercel.app" ollama serve`.

   Prefer specific origins over `*` — a wildcard lets **any** website your browser visits reach
   your local Ollama.
4. **Verify:** press **Test** in the Providers view — it queries `{baseUrl}/api/tags` from the
   browser and reports the model count, or explains how to allow the origin when the call fails.

Calling `http://localhost:11434` from an HTTPS page is allowed by browsers (localhost is treated
as a secure context), so there is no mixed-content problem in the normal case. The model list and
connection test for Ollama also bypass the server entirely; cloud providers keep going through
it, because their keys live server-side when you use the env fallbacks.

---

## Deploying to Vercel

The repository deploys as-is (Option A: native serverless functions, no Express on Vercel):

1. Push the repo and **Import** it in Vercel — the Vite preset is auto-detected
   (`vercel.json` pins build command and output).
2. Set environment variables in **Project Settings → Environment Variables**:
   `GEMINI_API_KEY` and any `OPENAI_*` / `ANTHROPIC_*` fallbacks you want. All are optional —
   per-role keys typed in the Providers view work without any dashboard config, as does an
   Ollama-only setup (zero cloud keys). Do **not** set `PORT` or `DISABLE_HMR`.
   For the optional cloud storage, the two variables must be named exactly
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`: Vite only exposes the `VITE_` prefix, so the
   `NEXT_PUBLIC_*` names that Supabase's own snippet uses are invisible to this app. They also have
   to be stored as **non-sensitive** values — Vercel withholds sensitive variables from the build,
   and Vite reads them *at build time*, which is what produces a bundle whose config is empty.
   After changing any variable, deploy again; an existing deployment keeps the values it was built
   with.
3. Deploy. `api/*.ts` become `/api/*` automatically; `vercel.json` rewrites everything except
   `/api/` to `index.html` for the SPA.

`api/health.ts`, `api/test-provider.ts`, `api/models.ts` and `api/run-agent.ts` are thin
Request/Response adapters over the same handler cores as the Express app
(`src/server/handlers.ts`), so validation, messages and the NDJSON stream are identical on both
platforms. `npm run dev` / `npm start` keep using Express + Vite middleware locally.

**Why `api/package.json`, `src/package.json` and two extra tsconfigs exist.** The root package is
`"type": "module"`, so Vercel compiles every function — and the `src/` files they import — as ES
modules. Node's ESM resolver refuses extensionless relative imports (`./handlers`), while the whole
codebase is written that way because tsx and Vite both allow it. Rather than append `.js` to every
import forever, the function graph is scoped to CommonJS instead: `api/` and `src/` each declare
`"type": "commonjs"` with a matching tsconfig that sets `module: commonjs`. The browser build is
unaffected — Vite bundles the `.ts` sources, never the compiled output. If a function starts failing
with `ERR_MODULE_NOT_FOUND` or `ERR_REQUIRE_ESM`, these four files are the first place to look.

One more tsconfig rule worth knowing: the root `tsconfig.json` must NOT list `"types"`. A forced
entry (it used to be `vite/client`) is applied to every compilation unit, including the Vercel
function build, whose sandbox cannot resolve that package — TS2688 there took down all four
endpoints. Vite's client types come from `src/vite-env.d.ts` instead, which only the browser graph
reads.

Caveats of the serverless target:

| Caveat | Impact | Mitigation |
|---|---|---|
| Request payload limit is 4.5 MB (the Express 25 MB limit is local-only) | Large batch payloads can be rejected with 413 | Keep batches modest; articles are stored client-side in IndexedDB, not through the server |
| `maxDuration` 300 s on `api/run-agent` | A run over 5 minutes returns 504 | Rare for cloud models (typically < 2 min); the value can be raised on paid plans |
| Model-catalog cache is in-memory per instance | Occasional re-fetch of a provider's catalog | Harmless |
| `pid`/`port`/`instance` in local `/api/health` | Not meaningful serverless | Vercel's `api/health` answers without them; the UI footer degrades gracefully |

---

## HTTP API

Cloud roles run through the server, one role per request; Ollama runs go straight from the
browser to the local server. `GET /api/events` no longer exists — activity streams inside the
run-agent response.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness + `hasKey` (boolean only — a key value never leaves the server), plus `app`, `instance`, `port`, `pid` and `startedAt` so you can tell which dev server answered (`pid`/`port` are local-only). |
| `POST /api/run-agent` | Runs a single role and **responds with NDJSON**: `{"kind":"event",...}` lines as the pipeline progresses (call-start, attempt, model-fallback, repair, chunk, completed/failed), then exactly one closing `{"kind":"result", ok, data/error, telemetry}` line. Ollama requests are rejected with 400 pointing at the browser. |
| `POST /api/test-provider` | Connectivity test for cloud providers: lists the real model catalog first (so messages name actual models), then probes. Ollama is tested by the browser directly. |
| `POST /api/models` | Real model catalog for a cloud provider (`src/server/modelCatalog.ts`, 60 s cache, offline fallback). Ollama's catalog is fetched by the browser from `{baseUrl}/api/tags`. |

Provider dispatch and Gemini's rate-limit model ladder live in `src/server/providers.ts`
(cloud) and `src/server/providers/ollama.ts` (browser-safe, no cloud SDK imports).

---

## Project structure

```
server.ts                    dotenv + port fallback + Vite middleware/static + listen
vercel.json                  Vercel build settings, maxDuration, SPA rewrite excluding /api
api/                         Vercel functions: health, test-provider, models, run-agent (NDJSON)
supabase/schema.sql          Tables, RLS policies and the handshake RPC for optional cloud storage
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
                             ArticleWorkspace, ActivityPanel, UnfinishedRuns, BatchUploadTable,
                             BatchQueueTable, HistoryTable, ReadabilityScorecard,
                             SeoChecklistPanel, UserProfileForm, BrandKitPanel,
                             LiveTokenTestBanner, RuleDiffPanel, ModelPicker, CloudSyncPanel
  sync/                      cloudConfig (env + workspace secret), supabaseRest (PostgREST over
                             fetch), syncMerge (last-write-wins + payload sanitizers),
                             syncQueue (offline-persisted pending work), tombstones (deletes that
                             must not be resurrected), syncEngine (pull/merge/push cycle),
                             useCloudSync (timing only)
  pipeline/                  runArticle (+resumeArticle), runAgent (NDJSON stream reader +
                             browser-side Ollama branch), stages, seoBrief, providerApi
                             (catalog/connection test routing), scoreArticle/scoreHtml,
                             topicFidelity, improveArticle,
                             batchQueue + useBatchQueue (worker pool),
                             agentEvents (client bus) + agentActivity + useAgentEvents (live log)
  server/                    app.ts (Express routes), handlers (framework-agnostic cores),
                             agentRun (executeAgentRun pipeline, shared with the browser),
                             providers/ollama + providers.ts (gemini/openai/anthropic),
                             providerCore/providerText, agentPrompts (per-role builders incl.
                             improver), roleSchemas (validation), chunked (truncation fallback),
                             modelCatalog (browser-safe, no env requirement)
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

`npm test` runs **680 tests across 49 files** covering the pipeline cost matrix and review gate
(with the `resumeArticle` retry/skip paths), the batch queue state machine, CSV parsing, brief
normalization, scoring and topic fidelity, brand tokens / token CSS / contrast, export, role-schema
validation, prompt builders, model catalog, agent events, the IndexedDB layer and its migration,
and the hash router. The cloud layer is covered against a stand-in PostgREST (request headers,
Range paging, upsert conflict targets, RLS rejection mapping), plus merge ordering, payload
sanitizers, the offline queue and tombstones. The profile layer is covered too: JSON import/export
(including the shapes it refuses), the per-section reset scope, and the contrast repair keeping hue
and saturation while clearing 4.5:1. `npm run lint` type-checks the whole project.

---

## Notes

- **Local-first.** No account or telemetry; content and settings stay in your browser's storage and
  your own provider keys.
- **Free by default.** Point every role at Ollama and the whole pipeline — including batch — runs at
  no cost for development and testing.
- **Original AI Studio scaffold:** the app was generated in [Google AI Studio](https://ai.studio/apps/3e62a594-2c35-444d-9ecd-01cae97ae89c);
  this repository is the expanded v2 build.
- See [`docs/README.md`](docs/README.md) for the design blueprint, spec, and implementation plan.
