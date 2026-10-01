# Fisio Architect 2.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the article generator around a configurable five-role AI pipeline, a brand profile, a designer preview, and a batch CSV queue, all persisted in IndexedDB.

**Architecture:** The Express server becomes a stateless agent-execution service exposing one generic `POST /api/run-agent` endpoint. All pipeline orchestration runs client-side so the batch queue can control concurrency, emit per-row status, and resume after reload. Two provider calls are the guaranteed floor: Creator plus Designer. Every other stage is opt-in.

**Tech Stack:** TypeScript 7, React 19, Vite 8, Express 4, Tailwind 4, `idb-keyval` 6, `jszip` 3, `lucide-react`, Vitest 5 with a Node environment.

**Spec:** `docs/superpowers/specs/2026-10-01-fisio-architect-2.0-design.md`

## Global Constraints

- Every task ends with `npm run lint` (which is `tsc --noEmit`) exiting with **zero errors**. Run it before every commit.
- No new runtime dependencies. The only new dev dependencies are `vitest` and `fake-indexeddb`. No CSV library, no router library.
- Testing environment is Node, not jsdom. Only pure logic is unit tested. No component tests.
- Every module has one responsibility. If a file needs a comment explaining what else it does, split it.
- The provider-call ceiling is 4 concurrent: batch concurrency 2 x designer fan-out 2. Never exceed it.
- `AbortError` is never recorded as a `failed` batch row. It resets the row to `pending`. This is the single most load-bearing correctness rule in the project.
- All new `GeneratedArticle` fields are optional, so articles persisted by earlier versions stay readable.
- The preview iframe never receives `allow-same-origin`. Generated HTML is untrusted.
- Stages commit incrementally. The repository must be runnable after every commit.

### Known intermediate lint failure

`src/App.tsx:14` imports `addToHistory`, `updateInHistory`, `deleteFromHistory`, and `clearHistory` from `./utils/db`. These functions were never written — that is the defect left by the earlier partial attempt. Task 2 deletes `src/utils/db.ts`, which makes those imports dangle and produces **4 `TS2305` errors**.

These 4 errors are expected and permitted from Task 2 through Task 15. Task 16 rewires `App.tsx` and clears them. Any error outside `src/App.tsx` during that window is a real failure and must be fixed immediately.

---

## File Structure

**New — server:**

| File | Responsibility |
|---|---|
| `src/server/providers.ts` | `callProvider`, `callGemini`, `callOpenAI`, `callAnthropic`, `cleanJsonOutput`, `ProviderCallError` |
| `src/server/agentPrompts.ts` | Prompt builders for 5 roles; profile and universal-rule injection |
| `src/server/roleSchemas.ts` | Per-role output validation and repair prompt |

**New — pipeline:**

| File | Responsibility |
|---|---|
| `src/pipeline/stages.ts` | All role I/O types, `PipelineConfig`, `SeoBrief` |
| `src/pipeline/runAgent.ts` | One `POST /api/run-agent` call with `AbortSignal` |
| `src/pipeline/seoBrief.ts` | Brief normalization from any source |
| `src/pipeline/runArticle.ts` | Stage sequencing and the review gate |
| `src/pipeline/useBatchQueue.ts` | Queue reducer and worker-pool hook |

**New — utils / config / db / app / views:**

| File | Responsibility |
|---|---|
| `src/utils/brandTokens.ts` | `applyBrandTokens`, off-palette detection |
| `src/utils/csv.ts` | `parseCsv`, `validateRow` |
| `src/config/universalRules.ts` | `UniversalRules` type and defaults |
| `src/db/index.ts` | IndexedDB open and typed accessors |
| `src/db/migrate.ts` | `schemaVersion`-gated migration |
| `src/app/useHashRoute.ts` | Hash route parsing and hook |
| `src/app/AppShell.tsx` | Nav rail and view outlet |
| `src/views/*.tsx` | 5 routed views |
| `src/components/HtmlPreviewPane.tsx` | Source view plus sandboxed iframe |
| `src/components/UserProfileForm.tsx` | Brand profile editor |
| `src/components/PipelineSettingsPanel.tsx` | Stage toggles |
| `src/components/BatchUploadTable.tsx` | CSV preview with validation |
| `src/components/BatchQueueTable.tsx` | Queue with live status |
| `src/components/HistoryTable.tsx` | Full-page article history |

**Deleted:** `src/utils/db.ts`, `src/components/HistoryDrawer.tsx`, `src/components/ProviderSettingsModal.tsx`

---

## Task 0: Repair `server.ts` Syntax

The server does not currently start. Five lines contain literal backslash-backtick sequences inside template literals. This defect is in `HEAD` (commit `8133edd`), so reverting does not fix it. Nothing else can be verified until this is done.

**Files:**
- Modify: `server.ts` (lines 470, 478, 479, 486, 487)

- [x] **Step 1: Confirm the failure**

Run: `npx tsc --noEmit 2>&1 | Select-Object -First 5`
Expected: 5 or more errors including `server.ts(470,19): error TS1127: Invalid character.`

- [x] **Step 2: Fix each escaped backtick**

Replace these five lines with real template literals:

```ts
      console.log(`Generating Master Markdown for ${langCode}...`);
```

```ts
      if (targetFormats.includes(`clean-${langCode}`)) {
        console.log(`Converting to Clean HTML for ${langCode}...`);
```

```ts
      if (targetFormats.includes(`inline-${langCode}`)) {
        console.log(`Converting to Inline CSS HTML for ${langCode}...`);
```

- [x] **Step 3: Verify the build is clean for server.ts**

Run: `npx tsc --noEmit 2>&1 | Select-String "server.ts"`
Expected: no output.

- [x] **Step 4: Verify the server starts**

Run: `$env:PORT=3199; npx tsx server.ts`, wait 5 seconds, then `Invoke-WebRequest localhost:3199/api/health -UseBasicParsing | Select-Object -Expand Content`
Expected: JSON containing `"status":"ok"`. Kill the process afterward.
If port 3199 is taken the server auto-increments — read the printed URL and use that port.

- [x] **Step 5: Commit**

```bash
git add server.ts
git commit -m "fix: repair escaped template literals that prevented server startup"
```

---

## Task 1: Test Infrastructure

All later tasks use TDD. This establishes the runner first.

**Files:**
- Modify: `package.json` (add devDependencies and scripts)
- Create: `vitest.config.ts`
- Create: `src/test/smoke.test.ts`

- [x] **Step 1: Install the runner**

Run: `npm install --save-dev vitest@^5 fake-indexeddb`
Expected: both packages added to `devDependencies`.

- [x] **Step 2: Add the test scripts**

Edit `package.json` scripts to:

```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [x] **Step 3: Add the config**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
```

`environment: 'node'` is deliberate. No component is unit tested, so jsdom is unnecessary weight.

- [x] **Step 4: Verify the runner works**

Create `src/test/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('test runner', () => {
  it('executes assertions', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm test`
Expected: `1 passed`.

- [x] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts src/test/smoke.test.ts
git commit -m "test: add vitest with node environment"
```

---

## Task 2: IndexedDB Layer

The current `db.ts` rewrites the entire history array on every save. With 300 batch articles that is roughly 300 full re-serializations per batch. One record per article eliminates it. Migration must also recover the legacy single-key store left by the earlier partial attempt.

**Files:**
- Create: `src/db/index.ts`
- Create: `src/db/testHelpers.ts`
- Create: `src/db/db.test.ts`
- Create: `src/db/migrate.ts`
- Create: `src/db/migrate.test.ts`
- Delete: `src/utils/db.ts`

**Interfaces:**
- Consumes: `GeneratedArticle` from `src/types/article.ts`
- Produces: `initDb`, `getArticle`, `putArticle`, `listArticles`, `deleteArticle`, `clearArticles`, `getJob`, `putJob`, `listJobs`, `clearJobs`, `getMeta`, `setMeta`, `runMigration`

- [x] **Step 1: Write the failing test**

Create `src/db/testHelpers.ts`:

```ts
import { IDBFactory } from 'fake-indexeddb';

// fake-indexeddb/auto installs a global factory on import. Reassigning it gives
// each test a genuinely empty database rather than shared state.
export function resetFakeDb(): void {
  (globalThis as any).indexedDB = new IDBFactory();
}
```

Create `src/db/db.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { resetFakeDb } from './testHelpers';

type Mod = typeof import('./index');
let mod: Mod;

beforeEach(async () => {
  resetFakeDb();
  mod = await import('./index');
});

afterEach(() => resetFakeDb());

const article = (id: string, generatedAt: string) => ({ id, generatedAt, topic: id } as any);

describe('article store', () => {
  it('round-trips a single article', async () => {
    await mod.putArticle(article('a1', '2026-01-01T00:00:00Z'));
    expect((await mod.getArticle('a1'))?.topic).toBe('a1');
  });

  it('stores one record per article rather than one array', async () => {
    await mod.putArticle(article('a1', '2026-01-01T00:00:00Z'));
    await mod.putArticle(article('a2', '2026-01-02T00:00:00Z'));
    expect(await mod.listArticles()).toHaveLength(2);
  });

  it('returns newest first', async () => {
    await mod.putArticle(article('old', '2026-01-01T00:00:00Z'));
    await mod.putArticle(article('new', '2026-06-01T00:00:00Z'));
    const all = await mod.listArticles();
    expect(all[0].id).toBe('new');
    expect(all[1].id).toBe('old');
  });

  it('overwrites rather than duplicating on repeated puts', async () => {
    await mod.putArticle(article('a1', '2026-01-01T00:00:00Z'));
    await mod.putArticle({ ...article('a1', '2026-01-01T00:00:00Z'), topic: 'updated' });
    const all = await mod.listArticles();
    expect(all).toHaveLength(1);
    expect(all[0].topic).toBe('updated');
  });

  it('deletes one article', async () => {
    await mod.putArticle(article('a1', '2026-01-01T00:00:00Z'));
    await mod.deleteArticle('a1');
    expect(await mod.listArticles()).toHaveLength(0);
  });

  it('clears all articles', async () => {
    await mod.putArticle(article('a1', '2026-01-01T00:00:00Z'));
    await mod.clearArticles();
    expect(await mod.listArticles()).toHaveLength(0);
  });
});

describe('meta store', () => {
  it('round-trips a value', async () => {
    await mod.setMeta('profile', { businessName: 'Sehat Sentosa' });
    expect((await mod.getMeta<any>('profile')).businessName).toBe('Sehat Sentosa');
  });

  it('returns undefined for a missing key', async () => {
    expect(await mod.getMeta('nope')).toBeUndefined();
  });
});

describe('job store', () => {
  it('round-trips a job', async () => {
    await mod.putJob({
      jobId: 'j1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect((await mod.getJob('j1'))?.jobId).toBe('j1');
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npm test -- db.test`
Expected: FAIL — cannot resolve `./index`.

- [x] **Step 3: Write the implementation**

Create `src/db/index.ts`:

```ts
import { openDB, type IDBPDatabase } from 'idb-keyval';
import type { GeneratedArticle } from '../types/article';

const DB_NAME = 'fisio_architect';
const DB_VERSION = 1;

export interface JobRecord {
  jobId: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('articles')) {
          const store = db.createObjectStore('articles', { keyPath: 'id' });
          store.createIndex('generatedAt', 'generatedAt');
        }
        if (!db.objectStoreNames.contains('jobs')) {
          const store = db.createObjectStore('jobs', { keyPath: 'jobId' });
          store.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains('meta')) {
          db.createObjectStore('meta', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export async function initDb(): Promise<void> {
  await getDb();
}

export async function getArticle(id: string): Promise<GeneratedArticle | undefined> {
  return (await getDb()).get('articles', id);
}

export async function putArticle(article: GeneratedArticle): Promise<void> {
  await (await getDb()).put('articles', article);
}

export async function listArticles(): Promise<GeneratedArticle[]> {
  const all = (await (await getDb()).getAll('articles')) as GeneratedArticle[];
  return all.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
}

export async function deleteArticle(id: string): Promise<void> {
  await (await getDb()).delete('articles', id);
}

export async function clearArticles(): Promise<void> {
  await (await getDb()).clear('articles');
}

export async function getJob(jobId: string): Promise<JobRecord | undefined> {
  return (await getDb()).get('jobs', jobId);
}

export async function putJob(job: JobRecord): Promise<void> {
  await (await getDb()).put('jobs', job);
}

export async function listJobs(): Promise<JobRecord[]> {
  return (await getDb()).getAll('jobs');
}

export async function clearJobs(): Promise<void> {
  await (await getDb()).clear('jobs');
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const record = await (await getDb()).get('meta', key);
  return record?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await getDb()).put('meta', { key, value });
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npm test -- db.test`
Expected: 10 passed.

- [x] **Step 5: Write the failing migration test**

Create `src/db/migrate.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { resetFakeDb } from './testHelpers';

const LS_KEY = 'fitseo_history';

beforeEach(() => {
  resetFakeDb();
  localStorage.clear();
});

describe('runMigration', () => {
  it('migrates localStorage history into per-article records', async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([
        { id: 'a', generatedAt: '2026-01-01T00:00:00Z', topic: 'one' },
        { id: 'b', generatedAt: '2026-01-02T00:00:00Z', topic: 'two' },
      ]),
    );
    const { runMigration } = await import('./migrate');
    await runMigration();
    const db = await import('./index');
    expect(await db.listArticles()).toHaveLength(2);
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect(await db.getMeta('schemaVersion')).toBe(1);
  });

  it('is a no-op when schemaVersion is already current', async () => {
    const db0 = await import('./index');
    await db0.setMeta('schemaVersion', 1);
    localStorage.setItem(LS_KEY, JSON.stringify([{ id: 'x', topic: 'y' }]));
    const { runMigration } = await import('./migrate');
    await runMigration();
    expect(await db0.listArticles()).toHaveLength(0);
  });

  it('never throws on malformed localStorage JSON', async () => {
    localStorage.setItem(LS_KEY, '{not json');
    const { runMigration } = await import('./migrate');
    await expect(runMigration()).resolves.toBeUndefined();
  });

  it('never throws when there is nothing to migrate', async () => {
    const { runMigration } = await import('./migrate');
    await expect(runMigration()).resolves.toBeUndefined();
  });
});
```

- [x] **Step 6: Run to verify it fails**

Run: `npm test -- migrate`
Expected: FAIL — cannot resolve `./migrate`.

- [x] **Step 7: Write the migration**

Create `src/db/migrate.ts`:

```ts
import { get, del } from 'idb-keyval';
import type { GeneratedArticle } from '../types/article';
import { initDb, putArticle, listArticles, setMeta, getMeta } from './index';

const LEGACY_LS_KEY = 'fitseo_history';
const LEGACY_IDB_KEY = 'fitseo_history';
export const CURRENT_SCHEMA_VERSION = 1;

export async function runMigration(): Promise<void> {
  try {
    await initDb();

    if ((await getMeta<number>('schemaVersion')) === CURRENT_SCHEMA_VERSION) return;

    // 1. The pre-v2 location: localStorage.
    const stored = localStorage.getItem(LEGACY_LS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as GeneratedArticle[];
        if (Array.isArray(parsed) && parsed.length > 0 && (await listArticles()).length === 0) {
          for (const article of parsed) await putArticle(article);
        }
      } catch (err) {
        console.warn('[db] Could not parse localStorage history:', err);
      }
      localStorage.removeItem(LEGACY_LS_KEY);
    }

    // 2. The legacy single-key IndexedDB store from the partial earlier attempt.
    //    It lives in a different database, so its absence is expected and normal.
    try {
      const legacy = await get<GeneratedArticle[]>(LEGACY_IDB_KEY);
      if (Array.isArray(legacy) && legacy.length > 0 && (await listArticles()).length === 0) {
        for (const article of legacy) await putArticle(article);
      }
      if (legacy !== undefined) await del(LEGACY_IDB_KEY);
    } catch {
      // Database does not exist. Nothing to recover.
    }

    await setMeta('schemaVersion', CURRENT_SCHEMA_VERSION);
  } catch (err) {
    // A failed migration must never prevent the app from starting.
    console.warn('[db] Migration skipped:', err);
  }
}
```

- [x] **Step 8: Run the migration tests**

Run: `npm test -- migrate`
Expected: 4 passed.

- [x] **Step 9: Delete the old module**

Delete `src/utils/db.ts`. Do not yet touch `src/App.tsx` — Task 16 rewires it.

Run: `npm run lint`
Expected: exactly 4 errors, all `TS2305` in `src/App.tsx` line 14. Any other error is a real failure.

- [x] **Step 10: Commit**

```bash
git add -A src/db src/utils/db.ts
git commit -m "feat(db): per-article IndexedDB stores with version-gated migration"
```

---

## Task 3: Universal Rules and Profile Types

The hardcoded `DEFAULT_BASE_SYSTEM_PROMPT` is brand-specific. This task carves out the universal portion and extends the profile so palette control is total.

**Files:**
- Create: `src/config/universalRules.ts`
- Modify: `src/types/profile.ts`

**Interfaces:**
- Produces: `UniversalRules`, `DEFAULT_UNIVERSAL_RULES`, `LEGACY_EXCLUSIONS`; `UserProfile` with 9-field `DesignRules` plus `exclusions`; `FALLBACK_BRAND`, `isProfileConfigured`, `resolveProfile`

- [x] **Step 1: Create `universalRules.ts`**

```ts
export interface UniversalRules {
  targetFleschMin: number;
  targetFleschMax: number;
  maxSentenceWords: number;
  minSentencesPerParagraph: number;
  minParagraphsPerH2: number;
  seoTitleMaxChars: number;
  metaDescriptionMaxChars: number;
  focusKeyphraseMaxChars: number;
  requireStats: boolean;
  requireFaq: boolean;
  allowInlineScripts: boolean;
  allowH1InArticle: boolean;
}

export const DEFAULT_UNIVERSAL_RULES: UniversalRules = {
  targetFleschMin: 60,
  targetFleschMax: 70,
  maxSentenceWords: 20,
  minSentencesPerParagraph: 3,
  minParagraphsPerH2: 2,
  seoTitleMaxChars: 55,
  metaDescriptionMaxChars: 155,
  focusKeyphraseMaxChars: 20,
  requireStats: true,
  requireFaq: true,
  allowInlineScripts: false,
  allowH1InArticle: false,
};

// The five B2B search-exclusion categories currently hardcoded in
// DEFAULT_NEGATIVE_PROMPT. Kept verbatim so default behaviour is unchanged, but
// now editable, because a physiotherapy clinic must not inherit
// "exclude clinical rehabilitation".
export const LEGACY_EXCLUSIONS: string[] = [
  'EXCLUDE consumer gym member searches ("gym terdekat", "membership gym", "gym harian", "daftar member gym"). Target the facility owner or buyer, not consumer gym-goers.',
  'EXCLUDE job and career searches ("lowongan kerja", "loker", "gaji personal trainer").',
  'EXCLUDE second-hand or scrap gear ("alat fitness bekas", "treadmill bekas", "second"). Positioning is exclusively premium new equipment.',
  'EXCLUDE DIY or amateur workout tutorials ("cara membuat alat gym", "tutorial latihan", "contoh gerakan").',
  'EXCLUDE clinical medical or therapy services ("biaya fisioterapi", "klinik fisioterapi", "terapi stroke").',
];
```

- [x] **Step 2: Rewrite `src/types/profile.ts`**

```ts
import { LEGACY_EXCLUSIONS } from '../config/universalRules';

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

// Empty strings mean "not configured". Prompts fall back to FALLBACK_BRAND so
// the app behaves as it did before profiles existed; the nav rail surfaces a
// warning chip so that fallback is never silent.
export const DEFAULT_USER_PROFILE: UserProfile = {
  businessName: '',
  niche: '',
  location: '',
  targetMarket: '',
  usp: '',
  toneOfVoice: '',
  defaultCta: '',
  designRules: {
    primaryColor: '#cc2929',
    secondaryColor: '#1a1d20',
    accentColor: '#cc2929',
    backgroundColor: '#f8fafc',
    textColor: '#333940',
    headingFont: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    bodyFont: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    buttonStyle: 'rounded',
    blockquoteStyle: 'accent-bar',
  },
  exclusions: [...LEGACY_EXCLUSIONS],
};

// These values reproduce the pre-profile app's output exactly.
export const FALLBACK_BRAND = {
  businessName: 'RealleaderUSA',
  niche: 'Commercial gym equipment supplier and facility planning',
  location: 'Indonesia and global B2B markets',
  targetMarket:
    'Gym owners and commercial investors, five-star hotels and resorts, premium apartments and condominiums, international and premium schools, corporate and hospital wellness programmes, and early-stage facility planners.',
  usp:
    'Commercial-grade biomechanics equipment in matte powder-coated steel, with warranty support, 2D/3D facility layout planning, installation, and after-sales service.',
  toneOfVoice: 'Professional, authoritative, consultative, ROI-driven, and easy to read.',
  defaultCta:
    'Request a quotation for facility layout planning, 2D/3D floor planning, and the commercial catalogue.',
} as const;

export function isProfileConfigured(profile: UserProfile): boolean {
  return Boolean(
    profile.businessName.trim() &&
      profile.niche.trim() &&
      profile.targetMarket.trim() &&
      profile.toneOfVoice.trim()
  );
}

export function resolveProfile(
  profile: UserProfile
): Pick<UserProfile, 'businessName' | 'niche' | 'location' | 'targetMarket' | 'usp' | 'toneOfVoice' | 'defaultCta'> {
  const pick = (value: string, fallback: string) => (value.trim() ? value.trim() : fallback);
  return {
    businessName: pick(profile.businessName, FALLBACK_BRAND.businessName),
    niche: pick(profile.niche, FALLBACK_BRAND.niche),
    location: pick(profile.location, FALLBACK_BRAND.location),
    targetMarket: pick(profile.targetMarket, FALLBACK_BRAND.targetMarket),
    usp: pick(profile.usp, FALLBACK_BRAND.usp),
    toneOfVoice: pick(profile.toneOfVoice, FALLBACK_BRAND.toneOfVoice),
    defaultCta: pick(profile.defaultCta, FALLBACK_BRAND.defaultCta),
  };
}
```

- [x] **Step 3: Verify**

Run: `npm run lint` — expect only the 4 known `src/App.tsx` errors.
Run: `npm test` — expect pass.

- [x] **Step 4: Commit**

```bash
git add src/config/universalRules.ts src/types/profile.ts
git commit -m "feat(profile): full palette, editable exclusions, and brand fallback"
```

---

## Task 4: Provider Layer Extraction

`server.ts` is 630 lines. Extracting provider calls gives `/api/run-agent` a clean dependency.

**Files:**
- Create: `src/server/providers.ts`
- Modify: `server.ts` (remove inline provider functions, import the module)

**Interfaces:**
- Produces: `ProviderCallError`, `cleanJsonOutput`, `callGemini`, `callOpenAI`, `callAnthropic`, `callProvider`

- [x] **Step 1: Create `providers.ts`**

Move `cleanJsonOutput`, `getGeminiClient`, `callGemini`, `callOpenAI`, `callAnthropic` from `server.ts` into this file, then add the dispatcher. The Gemini fallback ladder and its two-attempt inner retry are preserved exactly — they are the defence against free-tier quota exhaustion.

```ts
import { GoogleGenAI } from '@google/genai';
import type { ProviderConfig } from '../types/provider';

export class ProviderCallError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean
  ) {
    super(message);
    this.name = 'ProviderCallError';
  }
}

export function cleanJsonOutput(raw: string): string {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return cleaned.trim();
}

function getGeminiClient(customKey?: string) {
  const apiKey = customKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new ProviderCallError(
      'GEMINI_API_KEY is not configured in server environment or provider settings.',
      false
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

export async function callGemini(fullPrompt: string, config?: ProviderConfig): Promise<string> {
  const customKey = config?.apiKey?.trim();
  const requestedModel = config?.model?.trim() || 'gemini-2.5-flash';
  const ai = getGeminiClient(customKey);

  const candidateModels: string[] = [
    requestedModel,
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-flash-latest',
  ];
  const uniqueModels = Array.from(new Set(candidateModels));
  let responseText = '';
  let lastError: unknown = null;

  for (const modelName of uniqueModels) {
    let isRateLimited = false;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: fullPrompt,
          config: { responseMimeType: 'application/json', temperature: 0.7 },
        });
        responseText = response.text || '';
        if (responseText) return responseText;
      } catch (err) {
        const errMsg = String((err as Error)?.message || err);
        const is429 =
          (err as { status?: number })?.status === 429 ||
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('quota');

        lastError = err;
        if (is429) {
          isRateLimited = true;
          break; // never retry an exhausted model
        }
        await new Promise((resolve) => setTimeout(resolve, 800 * attempt));
      }
    }

    if (isRateLimited && modelName !== uniqueModels[uniqueModels.length - 1]) continue;
  }

  const finalErrMsg = (lastError as Error)?.message || 'Gemini API failed to return content.';
  if (finalErrMsg.includes('429') || finalErrMsg.includes('RESOURCE_EXHAUSTED')) {
    throw new ProviderCallError(
      'Gemini free-tier quota limit reached. Switch to Gemini 3.1 Flash Lite or add your own API key in Providers.',
      true
    );
  }
  throw new ProviderCallError(finalErrMsg, true);
}

export async function callOpenAI(fullPrompt: string, config?: ProviderConfig): Promise<string> {
  const apiKey = config?.apiKey?.trim();
  if (!apiKey) throw new ProviderCallError('API key is required for OpenAI Compatible.', false);

  const baseUrl = (config?.baseUrl?.trim() || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = config?.model?.trim() || 'gpt-4o';

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You are an Expert B2B Commercial Fitness SEO Strategist and Web Developer. You MUST output ONLY valid JSON matching the user schema. Do not write markdown wrappers or extraneous text.',
        },
        { role: 'user', content: fullPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new ProviderCallError(
      `OpenAI-compatible endpoint returned ${response.status}: ${errText}`,
      response.status === 429
    );
  }
  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new ProviderCallError('No content returned from OpenAI-compatible provider.', true);
  return content;
}

export async function callAnthropic(fullPrompt: string, config?: ProviderConfig): Promise<string> {
  const apiKey = config?.apiKey?.trim();
  if (!apiKey) throw new ProviderCallError('API key is required for Anthropic.', false);

  const baseUrl = (config?.baseUrl?.trim() || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
  const model = config?.model?.trim() || 'claude-3-7-sonnet-20250219';

  const response = await fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      system:
        'You are an Expert B2B Commercial Fitness SEO Strategist and Web Developer. You MUST output ONLY valid raw JSON conforming strictly to the requested schema. Never output markdown codeblock ticks or preamble.',
      messages: [{ role: 'user', content: fullPrompt }],
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new ProviderCallError(
      `Anthropic endpoint returned ${response.status}: ${errText}`,
      response.status === 429
    );
  }
  const data = await response.json();
  const text = data.content?.[0]?.text;
  if (!text) throw new ProviderCallError('No content returned from Anthropic provider.', true);
  return text;
}

export async function callProvider(prompt: string, config: ProviderConfig): Promise<string> {
  if (config.provider === 'gemini') return callGemini(prompt, config);
  if (config.provider === 'openai') return callOpenAI(prompt, config);
  if (config.provider === 'anthropic') return callAnthropic(prompt, config);
  throw new ProviderCallError(`Unsupported provider: ${config.provider}`, false);
}
```

- [x] **Step 2: Rewire `server.ts`**

Delete `cleanJsonOutput`, `getGeminiClient`, `callGemini`, `callOpenAI`, and `callAnthropic` from `server.ts`. Add:

```ts
import { callProvider, cleanJsonOutput, callGemini } from './src/server/providers.js';
```

Route the remaining handlers through these imports so `/api/health` and `/api/test-provider` keep working:

- In `/api/test-provider`, replace the provider dispatch with `await callProvider(testPrompt, testConfig)`. The existing `callGemini` import stays for the OpenAI-compatible branch, which does its own `/models` fetch.
- In `/api/generate-article`, delete the local `callProvider` arrow function and use the imported one.
- Delete the local `callProvider` helper defined inside `/api/generate-article` and replace its three uses with the import.

The generation routes are removed in Task 7, so they must keep functioning until then.

- [x] **Step 3: Verify**

Run: `npm run lint` — expect only the 4 known `src/App.tsx` errors.
Run: `npm test` — expect pass.

- [x] **Step 4: Commit**

```bash
git add server.ts src/server/providers.ts
git commit -m "refactor(server): extract provider calls into a dispatcher module"
```

---

## Task 5: Prompt Builders

Every role needs a prompt. Brand content is interpolated from the profile; technical rules come from `UNIVERSAL_RULES`.

**Files:**
- Create: `src/pipeline/stages.ts` (partial — completed in Task 6)
- Create: `src/server/agentPrompts.ts`
- Create: `src/server/agentPrompts.test.ts`

**Interfaces:**
- Consumes: `UserProfile`, `UniversalRules`, `resolveProfile`
- Produces: `buildBrandBlock`, `buildUniversalRulesBlock`, `buildDesignTokenBlock`, `buildJudgePrompt`, `buildKeywordResearchPrompt`, `buildImpowerPrompt`, `buildCreatorPrompt`, `buildReviewerPrompt`, `buildDesignerPrompt`

- [x] **Step 1: Create the partial `stages.ts`**

The prompts need `SeoBrief`, and Task 6 completes this file:

```ts
export interface OutlineSection {
  heading: string;
  mustCover: string[];
}

export interface FaqPlanItem {
  question: string;
  answerShape: string;
}

export interface SeoBrief {
  seoMetadata: import('../types/article').SeoMetadata;
  secondaryKeywords: string[];
  outline: OutlineSection[];
  faqPlan: FaqPlanItem[];
  statPlan: string[];
  internalLinkTargets: string[];
  source: 'impower' | 'creator-selfplanned' | 'minimal';
}
```

- [x] **Step 2: Write the failing test**

Create `src/server/agentPrompts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DEFAULT_USER_PROFILE, FALLBACK_BRAND } from '../types/profile';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import {
  buildBrandBlock,
  buildUniversalRulesBlock,
  buildDesignTokenBlock,
  buildJudgePrompt,
  buildCreatorPrompt,
} from './agentPrompts';

const configured = {
  ...DEFAULT_USER_PROFILE,
  businessName: 'Klinik Sehat Sentosa',
  niche: 'Klinik fisioterapi',
  targetMarket: 'Karyawan kantoran usia 25-45 tahun dengan nyeri punggung',
};

describe('buildBrandBlock', () => {
  it('falls back to legacy brand values when the profile is empty', () => {
    const block = buildBrandBlock(DEFAULT_USER_PROFILE);
    expect(block).toContain(FALLBACK_BRAND.businessName);
    expect(block).toContain(FALLBACK_BRAND.niche);
  });

  it('uses configured values when present', () => {
    const block = buildBrandBlock(configured);
    expect(block).toContain('Klinik Sehat Sentosa');
    expect(block).toContain('Klinik fisioterapi');
    expect(block).not.toContain(FALLBACK_BRAND.businessName);
  });

  it('includes exclusions when non-empty', () => {
    expect(buildBrandBlock(DEFAULT_USER_PROFILE)).toContain('EXCLUDE');
  });

  it('omits the exclusions section when the list is empty', () => {
    expect(buildBrandBlock({ ...DEFAULT_USER_PROFILE, exclusions: [] })).not.toContain('EXCLUDE');
  });
});

describe('buildUniversalRulesBlock', () => {
  it('renders configured numeric limits', () => {
    const block = buildUniversalRulesBlock({ ...DEFAULT_UNIVERSAL_RULES, seoTitleMaxChars: 60 });
    expect(block).toContain('60');
    expect(block).not.toContain('55');
  });

  it('forbids h1 when allowH1InArticle is false', () => {
    expect(buildUniversalRulesBlock(DEFAULT_UNIVERSAL_RULES)).toMatch(/do not use <h1>/i);
  });

  it('permits h1 when allowH1InArticle is true', () => {
    const block = buildUniversalRulesBlock({ ...DEFAULT_UNIVERSAL_RULES, allowH1InArticle: true });
    expect(block).toContain('H1 tags are permitted');
  });
});

describe('buildDesignTokenBlock', () => {
  it('emits every palette value', () => {
    const block = buildDesignTokenBlock(DEFAULT_USER_PROFILE.designRules);
    expect(block).toContain('#cc2929');
    expect(block).toContain('#f8fafc');
    expect(block).toContain('#333940');
  });
});

describe('buildJudgePrompt', () => {
  it('includes the seed topic and demands the judge shape', () => {
    const prompt = buildJudgePrompt({ seedTopic: 'Gym ROI' }, DEFAULT_USER_PROFILE);
    expect(prompt).toContain('Gym ROI');
    expect(prompt).toContain('refinedTopic');
    expect(prompt).toContain('rejectedAngles');
  });

  it('includes a focus keyphrase when supplied', () => {
    const prompt = buildJudgePrompt(
      { seedTopic: 'Gym ROI', focusKeyphrase: 'roi gym' },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('roi gym');
  });
});

describe('buildCreatorPrompt', () => {
  it('states the word target and forbids h1', () => {
    const prompt = buildCreatorPrompt(
      { seedTopic: 'Treadmill guide', targetWords: 1200, brief: null },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('1200');
    expect(prompt).toMatch(/do not use <h1>/i);
  });

  it('asks for selfPlanned metadata when no brief is supplied', () => {
    const prompt = buildCreatorPrompt(
      { seedTopic: 'Treadmill guide', targetWords: 900, brief: null },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('selfPlanned');
  });

  it('embeds an outline when a brief exists', () => {
    const prompt = buildCreatorPrompt(
      {
        seedTopic: 'Treadmill guide',
        targetWords: 900,
        brief: {
          seoMetadata: {
            seoTitle: 'T',
            headline: 'H',
            focusKeyphrase: 'treadmill',
            metaDescription: 'M',
            urlSlug: 'treadmill',
            tags: [],
          },
          secondaryKeywords: ['commercial treadmill'],
          outline: [{ heading: 'Motor specs', mustCover: ['HP rating'] }],
          faqPlan: [],
          statPlan: [],
          internalLinkTargets: [],
          source: 'impower',
        },
      },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('Motor specs');
    expect(prompt).toContain('commercial treadmill');
    expect(prompt).not.toContain('selfPlanned');
  });

  it('applies a tone override when given', () => {
    const prompt = buildCreatorPrompt(
      { seedTopic: 'T', targetWords: 900, brief: null, toneOverride: 'Playful and casual' },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('Playful and casual');
  });
});
```

- [x] **Step 3: Run to verify it fails**

Run: `npm test -- agentPrompts`
Expected: FAIL — cannot resolve `./agentPrompts`.

- [x] **Step 4: Write the implementation**

Create `src/server/agentPrompts.ts`:

```ts
import type { UserProfile, DesignRules } from '../types/profile';
import { resolveProfile } from '../types/profile';
import type { UniversalRules } from '../config/universalRules';
import type { SeoBrief } from '../pipeline/stages';

export function buildBrandBlock(profile: UserProfile): string {
  const brand = resolveProfile(profile);
  const lines = [
    `Brand name: ${brand.businessName}`,
    `Industry / niche: ${brand.niche}`,
    `Location: ${brand.location}`,
    `Target market: ${brand.targetMarket}`,
    `Unique selling proposition: ${brand.usp}`,
    `Tone of voice: ${brand.toneOfVoice}`,
    `Default call to action: ${brand.defaultCta}`,
  ];
  if (profile.exclusions.length > 0) {
    lines.push('', 'SEARCH EXCLUSIONS (must be respected):');
    for (const rule of profile.exclusions) lines.push(`- ${rule}`);
  }
  return lines.join('\n');
}

export function buildUniversalRulesBlock(rules: UniversalRules): string {
  return [
    'UNIVERSAL WRITING AND SEO RULES:',
    `- Target Flesch Reading Ease between ${rules.targetFleschMin} and ${rules.targetFleschMax}.`,
    `- Keep sentences under ${rules.maxSentenceWords} words; at least 25% of sentences must be shorter.`,
    `- Every paragraph must contain at least ${rules.minSentencesPerParagraph} full sentences. No single-sentence paragraphs.`,
    `- Every H2 must be followed by at least ${rules.minParagraphsPerH2} paragraphs.`,
    `- SEO title at most ${rules.seoTitleMaxChars} characters, containing the focus keyphrase.`,
    `- Meta description at most ${rules.metaDescriptionMaxChars} characters, containing the focus keyphrase.`,
    `- Focus keyphrase at most ${rules.focusKeyphraseMaxChars} characters.`,
    rules.allowH1InArticle
      ? '- H1 tags are permitted.'
      : '- Do not use <h1> tags in the article body; the CMS supplies the H1.',
    rules.allowInlineScripts
      ? '- Inline scripts are permitted.'
      : '- Do not use <script> tags in inline-CSS output.',
    '- Never use emojis anywhere.',
    '- Avoid generic AI cliches: "delve into", "tapestry", "in a world where", "game-changer", "unleash", "embark".',
    rules.requireStats
      ? '- Include one or two specific authoritative statistics, emphasised or in a callout.'
      : '- Statistics are optional.',
    rules.requireFaq
      ? '- Include two or three FAQs as details/summary elements; in clean HTML also emit FAQPage JSON-LD.'
      : '- FAQs are optional.',
    '- Insert native <figure> and <img> tags in place with src, alt, title, loading="lazy", width, and height.',
    '- Include at least two internal and two external contextual links within the text flow.',
  ].join('\n');
}

export function buildDesignTokenBlock(rules: DesignRules): string {
  return [
    'BRAND DESIGN TOKENS (use exactly these, never substitute):',
    `- Primary colour: ${rules.primaryColor}`,
    `- Secondary colour (headers, accordions): ${rules.secondaryColor}`,
    `- Accent colour (highlights, badges): ${rules.accentColor}`,
    `- Background / neutral surface: ${rules.backgroundColor}`,
    `- Body text colour: ${rules.textColor}`,
    `- Heading font stack: ${rules.headingFont}`,
    `- Body font stack: ${rules.bodyFont}`,
    `- Button style: ${rules.buttonStyle}`,
    `- Blockquote style: ${rules.blockquoteStyle}`,
  ].join('\n');
}

export function buildJudgePrompt(
  input: { seedTopic: string; focusKeyphrase?: string },
  profile: UserProfile
): string {
  const keyphrase = input.focusKeyphrase?.trim();
  return `You are the Judge: an editorial strategist who decides which single article angle best serves a business's target market.

${buildBrandBlock(profile)}

SEED TOPIC: "${input.seedTopic}"
${keyphrase ? `PREFERRED FOCUS KEYPHRASE: "${keyphrase}"` : ''}

Evaluate the seed topic against the target market above. Choose ONE angle and reject the alternatives, explaining why each was rejected.

Respond with ONLY this JSON shape:
{
  "refinedTopic": "the specific angle this article will take",
  "searchIntent": "informational | commercial | transactional | navigational",
  "audienceAngle": "how this framing differs for this specific business",
  "subtopics": ["4 to 6 subtopics"],
  "rejectedAngles": [{ "angle": "...", "reason": "..." }]
}`;
}

export function buildKeywordResearchPrompt(topic: string, profile: UserProfile): string {
  return `You are a keyword research specialist.

${buildBrandBlock(profile)}

TOPIC: "${topic}"

Respond with ONLY this JSON shape:
{
  "primaryKeyword": "...",
  "secondaryKeywords": ["..."],
  "lsiEntities": ["..."],
  "questionQueries": ["..."],
  "intentModifiers": ["..."]
}
Provide up to 20 LSI entities and up to 10 question queries.`;
}

export function buildImpowerPrompt(
  input: { topic: string; targetWords: number; research?: unknown },
  profile: UserProfile
): string {
  const research = input.research ? `\nKEYWORD RESEARCH:\n${JSON.stringify(input.research, null, 2)}\n` : '';
  return `You are Impower: an SEO strategist who produces the content brief an article will be written from.

${buildBrandBlock(profile)}
${buildUniversalRulesBlock({
  targetFleschMin: 60,
  targetFleschMax: 70,
  maxSentenceWords: 20,
  minSentencesPerParagraph: 3,
  minParagraphsPerH2: 2,
  seoTitleMaxChars: 55,
  metaDescriptionMaxChars: 155,
  focusKeyphraseMaxChars: 20,
  requireStats: true,
  requireFaq: true,
  allowInlineScripts: false,
  allowH1InArticle: false,
})}

TOPIC: "${input.topic}"
TARGET LENGTH: ~${input.targetWords} words
${research}
Respond with ONLY this JSON shape:
{
  "seoMetadata": {
    "seoTitle": "max 55 chars, contains the focus keyphrase",
    "headline": "click-magnet headline",
    "focusKeyphrase": "max 20 chars",
    "metaDescription": "max 155 chars, contains the focus keyphrase",
    "urlSlug": "kebab-case-slug",
    "tags": ["5 tags"]
  },
  "secondaryKeywords": ["..."],
  "outline": [{ "heading": "H2 text", "mustCover": ["what this section must include"] }],
  "faqPlan": [{ "question": "...", "answerShape": "what the answer should cover" }],
  "statPlan": ["specific authoritative figures to cite"],
  "internalLinkTargets": ["suggested internal link anchors"]
}`;
}

export function buildCreatorPrompt(
  input: {
    seedTopic: string;
    targetWords: number;
    brief: SeoBrief | null;
    toneOverride?: string;
    extraInstructions?: string;
  },
  profile: UserProfile
): string {
  const briefBlock = input.brief
    ? `\nCONTENT BRIEF (follow it exactly):\n${JSON.stringify(input.brief, null, 2)}\n`
    : '';
  const selfPlan = input.brief
    ? ''
    : '\nNo brief was supplied, so plan it yourself. After the markdown, emit a "selfPlanned" object with the same keys as the brief: seoMetadata, secondaryKeywords, outline, faqPlan, statPlan, internalLinkTargets.\n';
  const tone = input.toneOverride?.trim()
    ? `\nTONE OVERRIDE for this article: ${input.toneOverride.trim()}\n`
    : '';
  const extra = input.extraInstructions?.trim()
    ? `\nADDITIONAL INSTRUCTIONS:\n${input.extraInstructions.trim()}\n`
    : '';
  const shape = input.brief
    ? '{ "markdownContent": "# First section\\n\\nFull article markdown..." }'
    : '{ "markdownContent": "# First section\\n\\nFull article markdown...", "selfPlanned": { "seoMetadata": {}, "secondaryKeywords": [], "outline": [], "faqPlan": [], "statPlan": [], "internalLinkTargets": [] } }';

  return `You are the Creator: a long-form article writer.

${buildBrandBlock(profile)}
${buildUniversalRulesBlock({
  targetFleschMin: 60,
  targetFleschMax: 70,
  maxSentenceWords: 20,
  minSentencesPerParagraph: 3,
  minParagraphsPerH2: 2,
  seoTitleMaxChars: 55,
  metaDescriptionMaxChars: 155,
  focusKeyphraseMaxChars: 20,
  requireStats: true,
  requireFaq: true,
  allowInlineScripts: false,
  allowH1InArticle: false,
})}

TOPIC: "${input.seedTopic}"
TARGET LENGTH: ~${input.targetWords} words
${briefBlock}${selfPlan}${tone}${extra}
Write the article as Markdown. Do not write HTML. Do not write a preamble or a closing note.

Respond with ONLY this JSON shape:
${shape}`;
}

export function buildReviewerPrompt(
  input: { markdown: string; brief: SeoBrief | null; revisedAfterIssues: boolean },
  profile: UserProfile
): string {
  return `You are the Reviewer: an independent auditor. You did not write this article. Fact-check it and audit its SEO against the brief.

${buildBrandBlock(profile)}

${input.brief ? `CONTENT BRIEF:\n${JSON.stringify(input.brief, null, 2)}\n` : ''}

ARTICLE MARKDOWN:
${input.markdown}

Judge "pass" only if there are no blocker issues. Use "revise" for fixable SEO or structure problems and "fail" for factual errors or off-brand content.

Respond with ONLY this JSON shape:
{
  "verdict": "pass | revise | fail",
  "seoScore": 0,
  "issues": [{ "severity": "blocker | warning | nit", "category": "fact | seo | readability | structure | brand", "message": "...", "suggestedFix": "..." }]
}`;
}

export function buildDesignerPrompt(
  input: { markdown: string; language: 'en' | 'id'; cssMode: 'inline' | 'clean' },
  profile: UserProfile
): string {
  const langName = input.language === 'id' ? 'Bahasa Indonesia' : 'English (US)';
  const modeRules =
    input.cssMode === 'inline'
      ? '- Apply inline CSS via a style attribute on EVERY tag, for example style="font-family: system-ui; line-height: 1.75;".
- Do NOT include a <style> block.
- Do NOT include <script> tags.'
      : '- Emit semantic HTML with NO inline styles at all. No style attributes.
- Include one <style> block at the top defining CSS custom properties, then style everything through those properties and classes.
- Include a JSON-LD FAQPage script block and a small accordion script.';

  const example =
    input.cssMode === 'inline'
      ? '{ "html": "<article style=\\"...\\">...</article>" }'
      : `{ "html": "<style>:root{--primary:${profile.designRules.primaryColor};}</style><article>...</article>" }`;

  return `You are the Designer: a front-end developer converting Markdown into publish-ready HTML.

${buildBrandBlock(profile)}
${buildDesignTokenBlock(profile.designRules)}

TARGET LANGUAGE: ${langName}. Write all visible text, headings and metadata natively in this language.
CSS MODE: ${input.cssMode.toUpperCase()}

RULES:
${modeRules}
- Preserve all content, headings, lists and structure exactly as written.
- Never introduce a colour that is not in the brand design tokens above.

MARKDOWN:
${input.markdown}

Respond with ONLY this JSON shape:
${example}`;
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: pass.

- [x] **Step 6: Commit**

```bash
git add src/pipeline/stages.ts src/server/agentPrompts.ts src/server/agentPrompts.test.ts
git commit -m "feat(prompts): per-role prompt builders with profile and universal-rule injection"
```

---

## Task 6: Role Schemas and Complete Pipeline Types

Malformed model output is the most likely runtime failure. Validation must tolerate nulls and missing optional fields while rejecting genuinely wrong shapes.

**Files:**
- Modify: `src/pipeline/stages.ts` (replace with the complete version)
- Create: `src/server/roleSchemas.ts`
- Create: `src/server/roleSchemas.test.ts`

**Interfaces:**
- Produces: `validateRoleOutput(role, raw)`, `buildRepairPrompt(role, raw)`; completes `stages.ts` with `AgentRole`, `InternalRole`, `AnyRole`, `ImpowerLevel`, `ReviewerMode`, `TargetLanguage`, `CssMode`, `PipelineStage`, `PipelineConfig`, `JudgeOutput`, `CreatorOutput`, `ReviewReport`, `KeywordResearch`, `BrandWarning`, `DesignerOutput`, `PipelineState`, `RunArticleResult`, `DEFAULT_PIPELINE_CONFIG`

- [x] **Step 1: Complete `stages.ts`**

Replace the file. `SeoMetadata` and `OutputFormatId` are re-exported from `types/article.ts` rather than redeclared, so there is exactly one definition of each:

```ts
import type { GeneratedArticle, OutputFormatId, SeoMetadata } from '../types/article';

export type { GeneratedArticle, OutputFormatId, SeoMetadata } from '../types/article';

export type AgentRole = 'judge' | 'impower' | 'creator' | 'reviewer' | 'designer';

/**
 * Internal role for Impower's `max` keyword-research pass. Not user-configurable;
 * it reuses the Impower provider, so the provider UI stays at five roles.
 */
export type InternalRole = 'research';
export type AnyRole = AgentRole | InternalRole;

export type ImpowerLevel = 'off' | 'lite' | 'standard' | 'max';
export type ReviewerMode = 'off' | 'advisory' | 'strict';
export type TargetLanguage = 'en' | 'id';
export type CssMode = 'inline' | 'clean';

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

export type ImpowerOutput = SeoBrief;

export interface JudgeOutput {
  refinedTopic: string;
  searchIntent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  audienceAngle: string;
  subtopics: string[];
  rejectedAngles: { angle: string; reason: string }[];
}

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
  seoScore: number;
  issues: ReviewIssue[];
  revisedAfterIssues: boolean;
}

export interface KeywordResearch {
  primaryKeyword: string;
  secondaryKeywords: string[];
  lsiEntities: string[];
  questionQueries: string[];
  intentModifiers: string[];
}

export interface BrandWarning {
  hex: string;
  occurrences: number;
}

export interface DesignerOutput {
  html: string;
  warnings: BrandWarning[];
}

// runArticle keeps its working set in local variables and returns a
// RunArticleResult. This interface documents the shape for readers and is
// useful for debugging, but no code path constructs one; if it goes stale,
// delete it rather than maintaining a parallel description of the flow.
export interface PipelineState {
  seedTopic: string;
  stage: PipelineStage;
  judge?: JudgeOutput;
  brief?: SeoBrief;
  markdown?: string;
  review?: ReviewReport;
  revisionAttempts: number;
  formatsBundle: Record<string, string>;
  warnings: BrandWarning[];
}

export interface RunArticleResult {
  status: 'done' | 'failed' | 'needs_attention';
  article?: GeneratedArticle;
  reviewReport?: ReviewReport;
  error?: string;
}

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  judge: true,
  impower: 'standard',
  reviewer: 'strict',
  targetFormats: ['inline-en', 'inline-id', 'clean-en', 'clean-id'],
  languages: ['en', 'id'],
  targetWords: 950,
};
```

- [x] **Step 2: Write the failing test**

Create `src/server/roleSchemas.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { validateRoleOutput, buildRepairPrompt } from './roleSchemas';

const judge = {
  refinedTopic: 'Why gym ROI falls in year two',
  searchIntent: 'commercial',
  audienceAngle: 'framed for owners',
  subtopics: ['a', 'b'],
  rejectedAngles: [{ angle: 'x', reason: 'y' }],
};

describe('validateRoleOutput: judge', () => {
  it('accepts a well-formed object', () => {
    expect(validateRoleOutput('judge', JSON.stringify(judge)).ok).toBe(true);
  });

  it('tolerates a missing rejectedAngles array', () => {
    const { rejectedAngles, ...rest } = judge;
    const result = validateRoleOutput('judge', JSON.stringify(rest));
    expect(result.ok).toBe(true);
    expect((result as any).data.rejectedAngles).toEqual([]);
  });

  it('tolerates null values inside arrays', () => {
    const messy = JSON.stringify({ ...judge, subtopics: ['a', null, 'b'] });
    expect(validateRoleOutput('judge', messy).ok).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(validateRoleOutput('judge', '').ok).toBe(false);
  });

  it('rejects non-JSON', () => {
    expect(validateRoleOutput('judge', 'sorry, I cannot').ok).toBe(false);
  });

  it('strips markdown fences before parsing', () => {
    const fenced = '```json\n' + JSON.stringify(judge) + '\n```';
    expect(validateRoleOutput('judge', fenced).ok).toBe(true);
  });

  it('rejects output missing refinedTopic', () => {
    const { refinedTopic, ...rest } = judge;
    expect(validateRoleOutput('judge', JSON.stringify(rest)).ok).toBe(false);
  });

  it('defaults an unrecognised searchIntent to informational', () => {
    const bad = JSON.stringify({ ...judge, searchIntent: 'nonsense' });
    expect((validateRoleOutput('judge', bad) as any).data.searchIntent).toBe('informational');
  });
});

describe('validateRoleOutput: impower', () => {
  it('always succeeds and fills missing arrays', () => {
    const result = validateRoleOutput('impower', JSON.stringify({ seoMetadata: { seoTitle: 'T' } }));
    expect(result.ok).toBe(true);
    const data = (result as any).data;
    expect(data.outline).toEqual([]);
    expect(data.secondaryKeywords).toEqual([]);
    expect(data.source).toBe('impower');
  });
});

describe('validateRoleOutput: creator', () => {
  it('requires markdownContent', () => {
    expect(validateRoleOutput('creator', JSON.stringify({})).ok).toBe(false);
  });

  it('tags a selfPlanned payload as creator-selfplanned', () => {
    const raw = JSON.stringify({
      markdownContent: '# T',
      selfPlanned: { seoMetadata: { seoTitle: 'T' } },
    });
    expect((validateRoleOutput('creator', raw) as any).data.selfPlanned.source).toBe(
      'creator-selfplanned'
    );
  });
});

describe('validateRoleOutput: reviewer', () => {
  it('requires a verdict', () => {
    expect(validateRoleOutput('reviewer', JSON.stringify({ seoScore: 80 })).ok).toBe(false);
  });

  it('accepts pass with no issues', () => {
    expect(
      validateRoleOutput('reviewer', JSON.stringify({ verdict: 'pass', seoScore: 90 })).ok
    ).toBe(true);
  });

  it('defaults a missing seoScore to 0', () => {
    const result = validateRoleOutput('reviewer', JSON.stringify({ verdict: 'revise' }));
    expect(result.ok).toBe(true);
    expect((result as any).data.seoScore).toBe(0);
  });

  it('defaults a missing issues array to an empty one', () => {
    const result = validateRoleOutput('reviewer', JSON.stringify({ verdict: 'pass', seoScore: 90 }));
    expect((result as any).data.issues).toEqual([]);
  });

  it('clamps an out-of-range seoScore', () => {
    const high = validateRoleOutput('reviewer', JSON.stringify({ verdict: 'pass', seoScore: 250 }));
    expect(high.ok).toBe(true);
    expect((high as any).data.seoScore).toBe(100);
  });

  it('defaults an unrecognised issue severity to warning', () => {
    const raw = JSON.stringify({ verdict: 'pass', issues: [{ severity: 'nope', message: 'm' }] });
    expect((validateRoleOutput('reviewer', raw) as any).data.issues[0].severity).toBe('warning');
  });
});

describe('validateRoleOutput: designer', () => {
  it('requires a non-empty html field', () => {
    expect(validateRoleOutput('designer', JSON.stringify({ html: '' })).ok).toBe(false);
    expect(validateRoleOutput('designer', JSON.stringify({ html: '<p>x</p>' })).ok).toBe(true);
  });
});

describe('buildRepairPrompt', () => {
  it('names the role and echoes the bad output', () => {
    const prompt = buildRepairPrompt('judge', 'not json');
    expect(prompt).toContain('judge');
    expect(prompt).toContain('not json');
  });
});
```

- [x] **Step 3: Run to verify it fails**

Run: `npm test -- roleSchemas`
Expected: FAIL — cannot resolve `./roleSchemas`.

- [x] **Step 4: Write the implementation**

Create `src/server/roleSchemas.ts`:

```ts
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
      searchIntent: (intents as string[]).includes(intent)
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

function coerceBrief(obj: Record<string, unknown>, source: ImpowerOutput['source']): ImpowerOutput {
  const meta = (obj.seoMetadata ?? {}) as Record<string, unknown>;
  return {
    seoMetadata: {
      seoTitle: str(meta.seoTitle),
      headline: str(meta.headline),
      focusKeyphrase: str(meta.focusKeyphrase),
      metaDescription: str(meta.metaDescription),
      urlSlug: str(meta.urlSlug),
      tags: strArray(meta.tags),
    },
    secondaryKeywords: strArray(obj.secondaryKeywords),
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
    statPlan: strArray(obj.statPlan),
    internalLinkTargets: strArray(obj.internalLinkTargets),
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
              severity: (severities as string[]).includes(sev)
                ? (sev as ReviewReport['issues'][number]['severity'])
                : 'warning',
              category: (categories as string[]).includes(cat)
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
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: pass.

- [x] **Step 6: Commit**

```bash
git add src/pipeline/stages.ts src/server/roleSchemas.ts src/server/roleSchemas.test.ts
git commit -m "feat(server): role output validation with tolerant coercion and repair prompt"
```

---

## Task 7: `/api/run-agent` Endpoint

**Files:**
- Modify: `server.ts`

**Interfaces:**
- Consumes: `callProvider`, `validateRoleOutput`, `buildRepairPrompt`, all prompt builders
- Produces: `POST /api/run-agent` accepting `{ role, input, userProfile, providerConfig }`

- [x] **Step 1: Add the imports**

At the top of `server.ts`:

```ts
import { validateRoleOutput, buildRepairPrompt } from './src/server/roleSchemas.js';
import {
  buildJudgePrompt,
  buildImpowerPrompt,
  buildKeywordResearchPrompt,
  buildCreatorPrompt,
  buildReviewerPrompt,
  buildDesignerPrompt,
} from './src/server/agentPrompts.js';
```

- [x] **Step 2: Add the dispatcher and route**

Add before `listenWithFallback`:

```ts
function promptForRole(role: string, input: any, profile: any): string {
  switch (role) {
    case 'judge':
      return buildJudgePrompt(input, profile);
    case 'impower':
      return buildImpowerPrompt(input, profile);
    case 'research':
      return buildKeywordResearchPrompt(input.topic, profile);
    case 'creator':
      return buildCreatorPrompt(input, profile);
    case 'reviewer':
      return buildReviewerPrompt(input, profile);
    case 'designer':
      return buildDesignerPrompt(input, profile);
    default:
      throw new Error(`Unsupported role: ${role}`);
  }
}

app.post('/api/run-agent', async (req, res) => {
  try {
    const { role, input = {}, userProfile, providerConfig } = req.body;

    if (!role) return res.status(400).json({ ok: false, error: 'role is required' });
    if (!providerConfig?.provider) {
      return res.status(400).json({ ok: false, error: 'providerConfig is required' });
    }
    if (!userProfile) {
      return res.status(400).json({ ok: false, error: 'userProfile is required' });
    }

    const prompt = promptForRole(role, input, userProfile);

    let raw = await callProvider(prompt, providerConfig);
    let result = validateRoleOutput(role as any, raw);

    // One repair attempt for shape problems. Transport failures already
    // exhausted the 429 ladder inside callProvider, so this is the only extra
    // call a bad response can cost.
    if (!result.ok) {
      console.warn(`[run-agent] ${role} returned invalid output, repairing:`, result.error);
      raw = await callProvider(buildRepairPrompt(role as any, raw), providerConfig);
      result = validateRoleOutput(role as any, raw);
    }

    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.error, recoverable: false });
    }
    return res.json({ ok: true, data: result.data });
  } catch (error: any) {
    console.error('[run-agent] failed:', error);
    return res.status(502).json({
      ok: false,
      error: error?.message || 'Agent call failed',
      recoverable: error?.recoverable === true,
    });
  }
});
```

- [x] **Step 3: Remove the superseded routes**

Delete the `app.post('/api/generate-article', ...)` and `app.post('/api/improve-article', ...)` handlers entirely. Keep `/api/health` and `/api/test-provider`.

Delete these now-unused imports from `server.ts`:

```ts
import { DEFAULT_BASE_SYSTEM_PROMPT, DEFAULT_NEGATIVE_PROMPT } from './src/config/defaultPrompts.js';
import { isCleanHtmlIncomplete, synthesizeCleanHtml } from './src/utils/cleanHtmlUtils.js';
```

Delete the `ensureCompleteCleanHtml` helper as well.

- [x] **Step 4: Verify**

Run: `npm run lint` — expect only the 4 known `src/App.tsx` errors.
Run: `npm test` — expect pass.
Run: `npx tsx server.ts`, then `Invoke-WebRequest localhost:<port>/api/health -UseBasicParsing` — expect `"status":"ok"`. Kill afterward.

- [x] **Step 5: Commit**

```bash
git add server.ts
git commit -m "feat(server): generic run-agent endpoint with repair, drop single-shot generation routes"
```

---

## Task 8: Brief Normalization

When Impower is off, something must still produce the brief that Creator, Reviewer, and Designer consume. Every producer emits the same `SeoBrief` shape.

**Files:**
- Create: `src/pipeline/seoBrief.ts`
- Create: `src/pipeline/seoBrief.test.ts`

**Interfaces:**
- Consumes: `CreatorOutput`, `SeoBrief`
- Produces: `briefFromCreator`, `minimalBrief`, `resolveBrief`

- [x] **Step 1: Write the failing test**

Create `src/pipeline/seoBrief.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { briefFromCreator, minimalBrief, resolveBrief } from './seoBrief';

describe('briefFromCreator', () => {
  it('builds a brief from a Creator selfPlanned payload', () => {
    const brief = briefFromCreator(
      'How to choose a commercial treadmill',
      {
        seoMetadata: {
          seoTitle: 'Commercial Treadmill Guide',
          headline: 'Pick the Right Treadmill',
          focusKeyphrase: 'commercial treadmill',
          metaDescription: 'A guide.',
          urlSlug: 'commercial-treadmill',
          tags: ['gym'],
        },
        secondaryKeywords: ['treadmill motor'],
        outline: [{ heading: 'Motors', mustCover: ['HP'] }],
        faqPlan: [],
        statPlan: [],
        internalLinkTargets: [],
      },
      'gym'
    );
    expect(brief.source).toBe('creator-selfplanned');
    expect(brief.seoMetadata.focusKeyphrase).toBe('commercial treadmill');
    expect(brief.outline).toHaveLength(1);
  });

  it('fills missing arrays rather than leaving them undefined', () => {
    const brief = briefFromCreator('Topic', undefined, 'gym');
    expect(brief.secondaryKeywords).toEqual([]);
    expect(brief.outline).toEqual([]);
    expect(brief.faqPlan).toEqual([]);
    expect(brief.statPlan).toEqual([]);
    expect(brief.internalLinkTargets).toEqual([]);
  });

  it('supplies a fallback focus keyphrase from the seed topic', () => {
    const brief = briefFromCreator('Commercial Treadmill Buying', undefined, 'treadmill');
    expect(brief.seoMetadata.focusKeyphrase).toBe('treadmill');
  });

  it('derives a slug when none was supplied', () => {
    const brief = briefFromCreator('Best Gym Shoes & Trainers', undefined, 'kw');
    expect(brief.seoMetadata.urlSlug).toBe('best-gym-shoes-trainers');
  });
});

describe('minimalBrief', () => {
  it('derives a title from the first markdown heading', () => {
    const brief = minimalBrief('Seed topic', '# Choosing a Treadmill\n\nBody text here.', 'treadmill');
    expect(brief.source).toBe('minimal');
    expect(brief.seoMetadata.seoTitle).toContain('Choosing a Treadmill');
  });

  it('truncates the meta description to 155 characters', () => {
    const long = 'word '.repeat(80);
    const brief = minimalBrief('Seed', `# T\n\n${long}`, 'kw');
    expect(brief.seoMetadata.metaDescription.length).toBeLessThanOrEqual(155);
  });

  it('produces a kebab-case slug', () => {
    const brief = minimalBrief('Seed topic', '# T\n\nbody', 'kw');
    expect(brief.seoMetadata.urlSlug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('handles markdown with no heading', () => {
    const brief = minimalBrief('Fallback Seed Topic', 'just a paragraph', 'kw');
    expect(brief.seoMetadata.seoTitle.length).toBeGreaterThan(0);
  });

  it('falls back to the seed topic when there is no body text', () => {
    const brief = minimalBrief('Seed topic', '', 'kw');
    expect(brief.seoMetadata.metaDescription.length).toBeGreaterThan(0);
  });
});

describe('resolveBrief', () => {
  it('prefers the selfPlanned payload', () => {
    const brief = resolveBrief(
      {
        markdownContent: '# T',
        selfPlanned: {
          seoMetadata: {
            seoTitle: 'Planned',
            headline: 'H',
            focusKeyphrase: 'kw',
            metaDescription: 'M',
            urlSlug: 's',
            tags: [],
          },
        },
      },
      'Seed',
      'kw'
    );
    expect(brief.source).toBe('creator-selfplanned');
  });

  it('falls back to minimal when selfPlanned is absent', () => {
    const brief = resolveBrief({ markdownContent: '# Title\n\nBody.' }, 'Seed', 'kw');
    expect(brief.source).toBe('minimal');
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npm test -- seoBrief`
Expected: FAIL — cannot resolve `./seoBrief`.

- [x] **Step 3: Write the implementation**

Create `src/pipeline/seoBrief.ts`:

```ts
import type { CreatorOutput, SeoBrief, SeoMetadata } from './stages';

const MAX_META_DESCRIPTION = 155;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function briefFromCreator(
  seedTopic: string,
  selfPlanned: Partial<SeoBrief> | undefined,
  focusKeyphrase: string
): SeoBrief {
  const meta = (selfPlanned?.seoMetadata ?? {}) as Partial<SeoMetadata>;
  const keyword = meta.focusKeyphrase?.trim() || focusKeyphrase || slugify(seedTopic).slice(0, 20);

  return {
    seoMetadata: {
      seoTitle: meta.seoTitle?.trim() || seedTopic,
      headline: meta.headline?.trim() || seedTopic,
      focusKeyphrase: keyword,
      metaDescription: meta.metaDescription?.trim() || seedTopic,
      urlSlug: meta.urlSlug?.trim() || slugify(seedTopic),
      tags: Array.isArray(meta.tags) ? meta.tags.filter(Boolean) : [],
    },
    secondaryKeywords: selfPlanned?.secondaryKeywords ?? [],
    outline: selfPlanned?.outline ?? [],
    faqPlan: selfPlanned?.faqPlan ?? [],
    statPlan: selfPlanned?.statPlan ?? [],
    internalLinkTargets: selfPlanned?.internalLinkTargets ?? [],
    source: 'creator-selfplanned',
  };
}

export function minimalBrief(
  seedTopic: string,
  markdown: string,
  focusKeyphrase: string
): SeoBrief {
  const headingMatch = markdown.match(/^#{1,2}\s+(.+)$/m);
  const title = (headingMatch ? headingMatch[1] : seedTopic).trim();

  const body = markdown.replace(/^#{1,6}\s+.*$/gm, '').trim();
  const firstParagraph = (body.split(/\n\s*\n/)[0] ?? '').replace(/\s+/g, ' ').trim();
  const metaDescription = firstParagraph
    ? firstParagraph.length > MAX_META_DESCRIPTION
      ? `${firstParagraph.slice(0, MAX_META_DESCRIPTION - 3).trimEnd()}...`
      : firstParagraph
    : seedTopic;

  return {
    seoMetadata: {
      seoTitle: title.slice(0, 55),
      headline: title,
      focusKeyphrase: focusKeyphrase || slugify(seedTopic).slice(0, 20),
      metaDescription,
      urlSlug: slugify(title || seedTopic),
      tags: [],
    },
    secondaryKeywords: [],
    outline: [],
    faqPlan: [],
    statPlan: [],
    internalLinkTargets: [],
    source: 'minimal',
  };
}

export function resolveBrief(
  creator: CreatorOutput,
  seedTopic: string,
  focusKeyphrase: string
): SeoBrief {
  return creator.selfPlanned
    ? briefFromCreator(seedTopic, creator.selfPlanned, focusKeyphrase)
    : minimalBrief(seedTopic, creator.markdownContent, focusKeyphrase);
}
```

- [x] **Step 4: Run the tests**

Run: `npm test -- seoBrief`
Expected: 13 passed.

- [x] **Step 5: Commit**

```bash
git add src/pipeline/seoBrief.ts src/pipeline/seoBrief.test.ts
git commit -m "feat(pipeline): normalize SeoBrief from any source"
```

---

## Task 9: Client Pipeline Runtime

`runAgent` is one HTTP call; `runArticle` sequences the stages and owns the review gate.

**Files:**
- Create: `src/pipeline/runAgent.ts`
- Create: `src/pipeline/runArticle.ts`
- Create: `src/pipeline/runArticle.test.ts`
- Modify: `src/types/article.ts` (add optional pipeline fields)

**Interfaces:**
- Consumes: everything from `stages.ts`, `MultiAgentConfig`, `UserProfile`, `UniversalRules`
- Produces: `runAgent(options)`, `AgentError`, `runArticle(options)`, `formatTargets(formats, languages)`

- [x] **Step 1: Write `runAgent.ts`**

```ts
import type { AnyRole } from './stages';
import type { ProviderConfig } from '../types/provider';
import type { UserProfile } from '../types/profile';
import type { UniversalRules } from '../config/universalRules';

export interface RunAgentOptions {
  role: AnyRole;
  input: Record<string, unknown>;
  userProfile: UserProfile;
  providerConfig: ProviderConfig;
  universalRules: UniversalRules;
  signal: AbortSignal;
}

export class AgentError extends Error {
  constructor(
    message: string,
    public readonly recoverable: boolean,
    public readonly aborted = false
  ) {
    super(message);
    this.name = 'AgentError';
  }
}

export async function runAgent(options: RunAgentOptions): Promise<any> {
  let response: Response;
  try {
    response = await fetch('/api/run-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: options.signal,
      body: JSON.stringify({
        role: options.role,
        input: options.input,
        userProfile: options.userProfile,
        providerConfig: options.providerConfig,
        universalRules: options.universalRules,
      }),
    });
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      throw new AgentError('Request aborted', true, true);
    }
    throw new AgentError((err as Error).message || 'Network error', true);
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload.ok === false) {
    throw new AgentError(
      payload.error || `Server responded with status ${response.status}`,
      payload.recoverable !== false
    );
  }

  return payload.data;
}
```

- [x] **Step 2: Write the failing `runArticle` test**

Create `src/pipeline/runArticle.test.ts`. `runAgent` is mocked so the cost model can be asserted exactly:

```ts
import { describe, it, expect, vi } from 'vitest';

const calls: Record<string, number> = {};

vi.mock('./runAgent', () => ({
  AgentError: class AgentError extends Error {
    constructor(
      message: string,
      public recoverable: boolean,
      public aborted = false
    ) {
      super(message);
      this.name = 'AgentError';
    }
  },
  runAgent: async (options: any) => {
    const role = options.role;
    calls[role] = (calls[role] ?? 0) + 1;
    const handler = (globalThis as any).__handlers?.[role];
    if (!handler) throw new Error(`No handler for ${role}`);
    const value = await handler(options.input);
    if (value instanceof Error) throw value;
    return value;
  },
}));

import { runArticle } from './runArticle';
import { DEFAULT_USER_PROFILE } from '../types/profile';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import type { PipelineConfig } from './stages';

const multiAgentConfig: any = {
  judge: { provider: 'gemini', model: 'm', apiKey: 'k', baseUrl: '' },
  impower: { provider: 'gemini', model: 'm', apiKey: 'k', baseUrl: '' },
  creator: { provider: 'gemini', model: 'm', apiKey: 'k', baseUrl: '' },
  reviewer: { provider: 'gemini', model: 'm', apiKey: 'k', baseUrl: '' },
  designer: { provider: 'gemini', model: 'm', apiKey: 'k', baseUrl: '' },
};

const markdown = '# Choosing a Treadmill\n\nSome body content for the article.';
const html = '<article><p>Body</p></article>';

const judgeOutput = {
  refinedTopic: 'Choosing a commercial treadmill',
  searchIntent: 'commercial',
  audienceAngle: 'for owners',
  subtopics: ['a', 'b'],
  rejectedAngles: [],
};

const brief = {
  seoMetadata: {
    seoTitle: 'T',
    headline: 'H',
    focusKeyphrase: 'kw',
    metaDescription: 'M',
    urlSlug: 's',
    tags: [],
  },
  secondaryKeywords: [],
  outline: [],
  faqPlan: [],
  statPlan: [],
  internalLinkTargets: [],
  source: 'impower' as const,
};

const pass = { verdict: 'pass' as const, seoScore: 90, issues: [], revisedAfterIssues: false };
const fail = {
  verdict: 'fail' as const,
  seoScore: 30,
  issues: [
    {
      severity: 'blocker' as const,
      category: 'fact' as const,
      message: 'bad stat',
      suggestedFix: 'remove',
    },
  ],
  revisedAfterIssues: false,
};

const baseConfig: PipelineConfig = {
  judge: false,
  impower: 'off',
  reviewer: 'off',
  targetFormats: ['inline-en'],
  languages: ['en'],
  targetWords: 900,
};

async function run(config: Partial<PipelineConfig>, handlers: Record<string, any>) {
  for (const key of Object.keys(calls)) delete calls[key];
  (globalThis as any).__handlers = handlers;
  return runArticle({
    seedTopic: 'Treadmill buying',
    focusKeyphrase: 'treadmill',
    config: { ...baseConfig, ...config },
    profile: DEFAULT_USER_PROFILE,
    multiAgentConfig,
    universalRules: DEFAULT_UNIVERSAL_RULES,
    onStage: () => {},
    signal: new AbortController().signal,
  });
}

const total = () => Object.values(calls).reduce((a, b) => a + b, 0);

describe('floor configuration', () => {
  it('makes exactly two provider calls with everything off', async () => {
    const result = await run({}, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(total()).toBe(2);
    expect(calls.creator).toBe(1);
    expect(calls.designer).toBe(1);
    expect(result.status).toBe('done');
  });

  it('never calls Judge when judge is disabled', async () => {
    await run({ judge: false }, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.judge).toBeUndefined();
  });

  it('never calls Impower when impower is off', async () => {
    await run({ impower: 'off' }, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.impower).toBeUndefined();
  });

  it('feeds the refined topic from Judge to Creator', async () => {
    let received = '';
    await run({ judge: true }, {
      judge: () => judgeOutput,
      creator: (input: any) => {
        received = input.seedTopic;
        return { markdownContent: markdown };
      },
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.judge).toBe(1);
    expect(received).toBe('Choosing a commercial treadmill');
  });
});

describe('Impower levels', () => {
  it('makes one call at standard', async () => {
    await run({ impower: 'standard' }, {
      impower: () => brief,
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.impower).toBe(1);
  });

  it('makes one call at lite', async () => {
    await run({ impower: 'lite' }, {
      impower: () => brief,
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.impower).toBe(1);
  });

  it('makes two calls at max (research then brief)', async () => {
    await run({ impower: 'max' }, {
      research: () => ({
        primaryKeyword: 'kw',
        secondaryKeywords: [],
        lsiEntities: [],
        questionQueries: [],
        intentModifiers: [],
      }),
      impower: () => brief,
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.research).toBe(1);
    expect(calls.impower).toBe(1);
  });
});

describe('Reviewer modes', () => {
  it('never calls Reviewer when off', async () => {
    await run({ reviewer: 'off' }, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.reviewer).toBeUndefined();
  });

  it('does not block in advisory mode', async () => {
    const result = await run({ reviewer: 'advisory' }, {
      reviewer: () => fail,
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.creator).toBe(1);
    expect(calls.designer).toBe(1);
    expect(result.status).toBe('done');
    expect(result.reviewReport?.verdict).toBe('fail');
  });

  it('forces exactly one revision then halts in strict mode', async () => {
    const result = await run({ reviewer: 'strict' }, {
      reviewer: () => fail,
      creator: () => ({ markdownContent: markdown }),
    });
    expect(calls.creator).toBe(2);
    expect(calls.reviewer).toBe(2);
    expect(calls.designer).toBeUndefined();
    expect(result.status).toBe('needs_attention');
  });

  it('proceeds to design when the revision passes', async () => {
    let attempt = 0;
    const result = await run({ reviewer: 'strict' }, {
      reviewer: () => (++attempt === 1 ? fail : pass),
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.creator).toBe(2);
    expect(result.status).toBe('done');
    expect(calls.designer).toBe(1);
  });

  it('retains the markdown on needs_attention', async () => {
    const result = await run({ reviewer: 'strict' }, {
      reviewer: () => fail,
      creator: () => ({ markdownContent: markdown }),
    });
    expect(result.article?.rawText).toContain('Some body content');
  });

  it('records reviewPassed as true when the review passes', async () => {
    const result = await run({ reviewer: 'strict' }, {
      reviewer: () => pass,
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(result.article?.reviewPassed).toBe(true);
  });
});

describe('Designer fan-out', () => {
  it('makes one call per requested format', async () => {
    await run(
      { targetFormats: ['inline-en', 'clean-en', 'inline-id'], languages: ['en', 'id'] },
      {
        creator: () => ({ markdownContent: markdown }),
        designer: () => ({ html, warnings: [] }),
      }
    );
    expect(calls.designer).toBe(3);
  });

  it('filters formats by the configured languages', async () => {
    const result = await run(
      { targetFormats: ['inline-en', 'inline-id'], languages: ['en'] },
      {
        creator: () => ({ markdownContent: markdown }),
        designer: () => ({ html, warnings: [] }),
      }
    );
    expect(calls.designer).toBe(1);
    expect(Object.keys(result.article!.formats)).toEqual(['inline-en']);
  });

  it('freezes a profile snapshot on the article', async () => {
    const result = await run({}, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(result.article?.profileSnapshot).toBeDefined();
  });
});

describe('failure handling', () => {
  it('returns failed rather than throwing when a stage throws', async () => {
    const result = await run({}, {
      creator: () => new Error('provider exploded'),
      designer: () => ({ html, warnings: [] }),
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('provider exploded');
  });
});
```

- [x] **Step 3: Run to verify it fails**

Run: `npm test -- runArticle`
Expected: FAIL — cannot resolve `./runArticle`.

- [x] **Step 4: Write `runArticle.ts`**

Create `src/pipeline/runArticle.ts`:

```ts
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
```

Add `PipelineConfig` to the type import list from `./stages` — it is used in `RunArticleOptions`.

- [x] **Step 5: Add the optional article fields**

At the top of `src/types/article.ts` add:

```ts
import type {
  PipelineConfig,
  ReviewReport,
  JudgeOutput,
  BrandWarning,
} from '../pipeline/stages';
import type { UserProfile } from './profile';
```

Then append these fields to the `GeneratedArticle` interface, before its closing brace:

```ts
  pipelineConfig?: PipelineConfig;
  profileSnapshot?: UserProfile;
  reviewReport?: ReviewReport;
  judgeOutput?: JudgeOutput;
  reviewPassed?: boolean;
  brandWarnings?: BrandWarning[];
  batchJobId?: string;
  batchRowId?: string;
```

`stages.ts` re-exports types from `article.ts` while `article.ts` now imports types from `stages.ts`. This circular reference is safe: both use `import type`, which TypeScript erases entirely, so no runtime cycle exists.

- [x] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: pass.

- [x] **Step 7: Commit**

```bash
git add src/pipeline/runAgent.ts src/pipeline/runArticle.ts src/pipeline/runArticle.test.ts src/types/article.ts
git commit -m "feat(pipeline): stage sequencing, concurrency-capped designer fan-out, review gate"
```

---

## Task 10: Brand Tokens

This is the deterministic half of D6. Prompting alone lets the palette drift from the saved profile; this pass makes the profile authoritative.

**Files:**
- Create: `src/utils/brandTokens.ts`
- Create: `src/utils/brandTokens.test.ts`

**Interfaces:**
- Consumes: `DesignRules`
- Produces: `applyBrandTokens(html, rules, options?)`, `BrandWarning`

- [x] **Step 1: Write the failing test**

Create `src/utils/brandTokens.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyBrandTokens } from './brandTokens';
import type { DesignRules } from '../types/profile';

const rules: DesignRules = {
  primaryColor: '#111111',
  secondaryColor: '#222222',
  accentColor: '#333333',
  backgroundColor: '#444444',
  textColor: '#555555',
  headingFont: 'Arial, sans-serif',
  bodyFont: 'Verdana, sans-serif',
  buttonStyle: 'rounded',
  blockquoteStyle: 'accent-bar',
};

describe('custom property rewriting', () => {
  it('rewrites --primary to the profile colour', () => {
    const { html } = applyBrandTokens('<style>:root{--primary:#cc2929;}</style>', rules);
    expect(html).toContain('--primary:#111111');
    expect(html).not.toContain('#cc2929');
  });

  it('rewrites --dark and --slate to secondary and text', () => {
    const { html } = applyBrandTokens('<style>:root{--dark:#1a1d20;--slate:#333940;}</style>', rules);
    expect(html).toContain('--dark:#222222');
    expect(html).toContain('--slate:#555555');
  });

  it('rewrites --bg-neutral and --border', () => {
    const { html } = applyBrandTokens(
      '<style>:root{--bg-neutral:#f8fafc;--border:#e2e8f0;}</style>',
      rules
    );
    expect(html).toContain('--bg-neutral:#444444');
    expect(html).toContain('--border:#111111');
  });

  it('is case-insensitive on hex values', () => {
    const { html } = applyBrandTokens('<style>:root{--primary:#CC2929;}</style>', rules);
    expect(html).toContain('#111111');
  });
});

describe('legacy hex mapping', () => {
  it('maps legacy brand hexes appearing in inline styles', () => {
    const { html } = applyBrandTokens('<p style="color:#cc2929">Hi</p>', rules);
    expect(html).toContain('color:#111111');
  });

  it('is case-insensitive on legacy hexes', () => {
    const { html } = applyBrandTokens('<p style="color:#1A1D20">Hi</p>', rules);
    expect(html).toContain('color:#222222');
  });

  it('does not double-map a hex already replaced', () => {
    const { html } = applyBrandTokens('<p style="color:#cc2929">x</p>', rules);
    expect(html).not.toContain('#111111;');
  });
});

describe('off-palette detection', () => {
  it('reports no warnings when only profile colours are used', () => {
    const { warnings } = applyBrandTokens('<style>:root{--primary:#111111;}</style>', rules);
    expect(warnings).toEqual([]);
  });

  it('warns about a colour outside the palette', () => {
    const { warnings } = applyBrandTokens('<p style="color:#abcdef">Hi</p>', rules);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].hex).toBe('#abcdef');
  });

  it('counts repeated occurrences of the same colour', () => {
    const { warnings } = applyBrandTokens(
      '<p style="color:#abcdef">a</p><p style="color:#abcdef">b</p>',
      rules
    );
    expect(warnings[0].occurrences).toBe(2);
  });

  it('does not treat profile colours as off-palette', () => {
    const html = [
      '#111111',
      '#222222',
      '#333333',
      '#444444',
      '#555555',
    ]
      .map((v) => `<p style="color:${v}">x</p>`)
      .join('');
    expect(applyBrandTokens(html, rules).warnings).toEqual([]);
  });

  it('ignores three-digit hex shorthand', () => {
    const { warnings } = applyBrandTokens('<p style="color:#fff">x</p>', rules);
    expect(warnings).toEqual([]);
  });
});

describe('forcePalette', () => {
  it('leaves off-palette colours untouched by default', () => {
    const { html } = applyBrandTokens('<p style="color:#abcdef">x</p>', rules);
    expect(html).toContain('#abcdef');
  });

  it('snaps an off-palette colour to the nearest profile token when forced', () => {
    const { html, warnings } = applyBrandTokens('<p style="color:#abcdef">x</p>', rules, {
      forcePalette: true,
    });
    expect(html).not.toContain('#abcdef');
    // #abcdef is nearest to #111111 among the palette entries.
    expect(html).toContain('#111111');
    expect(warnings).toHaveLength(1);
  });
});

describe('safety', () => {
  it('leaves HTML with no styles untouched', () => {
    const input = '<article><h2>Title</h2><p>Body</p></article>';
    expect(applyBrandTokens(input, rules).html).toBe(input);
  });

  it('does not corrupt non-hex CSS values', () => {
    const { html } = applyBrandTokens('<p style="font-size:16px;margin:0 auto">x</p>', rules);
    expect(html).toContain('font-size:16px');
    expect(html).toContain('margin:0 auto');
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npm test -- brandTokens`
Expected: FAIL — cannot resolve `./brandTokens`.

- [x] **Step 3: Write the implementation**

Create `src/utils/brandTokens.ts`:

```ts
import type { DesignRules } from '../types/profile';

export interface BrandWarning {
  hex: string;
  occurrences: number;
}

// The five values hardcoded in the pre-profile prompts, mapped to their
// profile equivalents so a Designer run that echoes the old palette still
// comes out on-brand.
const LEGACY_MAP: Record<string, keyof DesignRules> = {
  '#cc2929': 'primaryColor',
  '#1a1d20': 'secondaryColor',
  '#333940': 'textColor',
  '#f8fafc': 'backgroundColor',
  '#e2e8f0': 'primaryColor',
};

const CUSTOM_PROPERTY_MAP: Record<string, keyof DesignRules> = {
  '--primary': 'primaryColor',
  '--accent': 'accentColor',
  '--dark': 'secondaryColor',
  '--slate': 'textColor',
  '--bg-neutral': 'backgroundColor',
  '--border': 'primaryColor',
};

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
  ];
}

function rgbDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return (ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2;
}

export function applyBrandTokens(
  html: string,
  rules: DesignRules,
  options: { forcePalette?: boolean } = {}
): { html: string; warnings: BrandWarning[] } {
  const palette = [
    rules.primaryColor,
    rules.secondaryColor,
    rules.accentColor,
    rules.backgroundColor,
    rules.textColor,
  ].map((c) => c.toLowerCase());

  let output = html;

  // Pass 1: CSS custom properties.
  for (const [property, ruleKey] of Object.entries(CUSTOM_PROPERTY_MAP)) {
    const value = rules[ruleKey];
    const pattern = new RegExp(`(${property}\\s*:\\s*)(#[0-9a-fA-F]{3,8})`, 'g');
    output = output.replace(pattern, `$1${value}`);
  }

  // Pass 2: legacy hex values. Escaped so a hex inside a character class or
  // quantifier in the generated RegExp cannot be misread as syntax.
  for (const [legacy, ruleKey] of Object.entries(LEGACY_MAP)) {
    const value = rules[ruleKey];
    output = output.replace(new RegExp(legacy.replace('#', '\\#'), 'gi'), value);
  }

  // Pass 3: off-palette detection.
  const found = new Map<string, number>();
  for (const match of output.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    const hex = match[0].toLowerCase();
    if (!palette.includes(hex)) {
      found.set(hex, (found.get(hex) ?? 0) + 1);
    }
  }
  const warnings: BrandWarning[] = [...found.entries()].map(([hex, occurrences]) => ({
    hex,
    occurrences,
  }));

  if (options.forcePalette && warnings.length > 0) {
    for (const warning of warnings) {
      const nearest = palette.reduce((best, candidate) =>
        rgbDistance(warning.hex, candidate) < rgbDistance(warning.hex, best) ? candidate : best
      );
      output = output.replace(new RegExp(warning.hex.replace('#', '\\#'), 'gi'), nearest);
    }
  }

  return { html: output, warnings };
}
```

- [x] **Step 4: Run the tests**

Run: `npm test -- brandTokens`
Expected: 18 passed.

- [x] **Step 5: Commit**

```bash
git add src/utils/brandTokens.ts src/utils/brandTokens.test.ts
git commit -m "feat(brand): deterministic palette enforcement with off-palette warnings"
```

---

## Task 11: CSV Parsing

**Files:**
- Create: `src/utils/csv.ts`
- Create: `src/utils/csv.test.ts`

**Interfaces:**
- Consumes: `ImpowerLevel`, `ReviewerMode`
- Produces: `parseCsv(raw)`, `validateRow(row, globals)`, `CSV_COLUMNS`, `IMPOWER_LEVELS`, `REVIEWER_MODES`

- [x] **Step 1: Write the failing test**

Create `src/utils/csv.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseCsv, validateRow } from './csv';

const HEADER =
  'Topic_Idea,Focus_Keyphrase,Target_Length,Tone_Override,Impower_Level,Reviewer_Mode';

describe('parseCsv basics', () => {
  it('maps a simple table positionally and fills every canonical key', () => {
    const rows = parseCsv('Treadmill,kw');
    expect(rows).toHaveLength(1);
    expect(rows[0].Topic_Idea).toBe('Treadmill');
    expect(rows[0].Focus_Keyphrase).toBe('kw');
    // Sparse rows still expose every column so callers never see undefined.
    expect(rows[0].Impower_Level).toBe('');
    expect(rows[0].Reviewer_Mode).toBe('');
  });

  it('detects and strips a header row', () => {
    const rows = parseCsv(`${HEADER}\nTreadmill guide,kw,short,`);
    expect(rows).toHaveLength(1);
    expect(rows[0].Topic_Idea).toBe('Treadmill guide');
  });

  it('maps columns by name', () => {
    const rows = parseCsv(`${HEADER}\nTreadmill,kw,long,Casual,off,advisory`);
    expect(rows[0]).toMatchObject({
      Topic_Idea: 'Treadmill',
      Focus_Keyphrase: 'kw',
      Target_Length: 'long',
      Tone_Override: 'Casual',
      Impower_Level: 'off',
      Reviewer_Mode: 'advisory',
    });
  });

  it('tolerates a reordered header', () => {
    const rows = parseCsv(
      'Focus_Keyphrase,Topic_Idea\nkw,Treadmill guide'
    );
    expect(rows[0].Topic_Idea).toBe('Treadmill guide');
    expect(rows[0].Focus_Keyphrase).toBe('kw');
  });

  it('assigns positional columns when no header is present', () => {
    const rows = parseCsv('Treadmill,kw,short');
    expect(rows[0].Topic_Idea).toBe('Treadmill');
    expect(rows[0].Target_Length).toBe('short');
  });
});

describe('parseCsv edge cases', () => {
  it('keeps commas inside quoted fields', () => {
    const rows = parseCsv(`${HEADER}\n"Commercial treadmills, motors, and belts",kw`);
    expect(rows[0].Topic_Idea).toBe('Commercial treadmills, motors, and belts');
  });

  it('handles escaped quotes inside a quoted field', () => {
    const rows = parseCsv(`${HEADER}\n"He said ""treadmill"" loudly",kw`);
    expect(rows[0].Topic_Idea).toBe('He said "treadmill" loudly');
  });

  it('handles CRLF line endings', () => {
    const rows = parseCsv(`${HEADER}\r\nTreadmill,kw`);
    expect(rows[0].Topic_Idea).toBe('Treadmill');
  });

  it('strips a UTF-8 BOM', () => {
    const rows = parseCsv(`\uFEFF${HEADER}\nTreadmill,kw`);
    expect(rows[0].Topic_Idea).toBe('Treadmill');
  });

  it('ignores trailing blank lines', () => {
    expect(parseCsv(`${HEADER}\nTreadmill,kw\n\n\n`)).toHaveLength(1);
  });

  it('fills missing trailing columns with empty strings', () => {
    const rows = parseCsv(`${HEADER}\nTreadmill`);
    expect(rows[0].Target_Length).toBe('');
  });

  it('handles newlines inside a quoted field', () => {
    const rows = parseCsv(`${HEADER}\n"line one\nline two",kw`);
    expect(rows[0].Topic_Idea).toBe('line one\nline two');
  });

  it('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([]);
  });
});

describe('validateRow', () => {
  const globals = { impower: 'standard' as const, reviewer: 'strict' as const };
  const base = {
    Topic_Idea: 'Topic',
    Focus_Keyphrase: '',
    Target_Length: '',
    Tone_Override: '',
    Impower_Level: '',
    Reviewer_Mode: '',
  };

  it('inherits globals when override columns are blank', () => {
    const result = validateRow(base, globals);
    expect(result.impower).toBe('standard');
    expect(result.reviewer).toBe('strict');
    expect(result.issues).toEqual([]);
  });

  it('honours a valid Impower override', () => {
    expect(validateRow({ ...base, Impower_Level: 'max' }, globals).impower).toBe('max');
  });

  it('falls back with a warning for an invalid Impower override', () => {
    const result = validateRow({ ...base, Impower_Level: 'ultra' }, globals);
    expect(result.impower).toBe('standard');
    expect(result.issues[0].fatal).toBe(false);
  });

  it('honours a valid Reviewer override', () => {
    expect(validateRow({ ...base, Reviewer_Mode: 'off' }, globals).reviewer).toBe('off');
  });

  it('defaults Target_Length to standard when blank', () => {
    expect(validateRow(base, globals).targetLength).toBe('standard');
  });

  it('flags a missing topic as fatal', () => {
    const result = validateRow({ ...base, Topic_Idea: '  ' }, globals);
    expect(result.issues.some((i) => i.fatal && i.field === 'Topic_Idea')).toBe(true);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npm test -- csv`
Expected: FAIL — cannot resolve `./csv`.

- [x] **Step 3: Write the implementation**

Create `src/utils/csv.ts`:

```ts
import type { ImpowerLevel, ReviewerMode } from '../pipeline/stages';

export interface CsvRow {
  Topic_Idea: string;
  Focus_Keyphrase: string;
  Target_Length: string;
  Tone_Override: string;
  Impower_Level: string;
  Reviewer_Mode: string;
}

export const CSV_COLUMNS = [
  'Topic_Idea',
  'Focus_Keyphrase',
  'Target_Length',
  'Tone_Override',
  'Impower_Level',
  'Reviewer_Mode',
] as const;

export const IMPOWER_LEVELS: ImpowerLevel[] = ['off', 'lite', 'standard', 'max'];
export const REVIEWER_MODES: ReviewerMode[] = ['off', 'advisory', 'strict'];
export const LENGTHS = ['short', 'standard', 'long', 'custom'];

// Splits CSV text into a rectangular string grid, honouring quoted fields with
// embedded delimiters, newlines, and doubled quotes.
function toGrid(raw: string): string[][] {
  const grid: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const text = raw.replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      grid.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  row.push(field);
  grid.push(row);

  return grid.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function normalise(cell: string): string {
  return cell.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function parseCsv(raw: string): CsvRow[] {
  const grid = toGrid(raw);
  if (grid.length === 0) return [];

  const hasHeader = normalise(grid[0][0] ?? '') === 'topic_idea';
  const body = hasHeader ? grid.slice(1) : grid;

  // With a header, map by column name so a reordered CSV still imports.
  // Without one, fall back to the canonical positional order.
  const order = hasHeader
    ? grid[0].map((cell) => {
        const name = normalise(cell);
        return (CSV_COLUMNS as readonly string[]).includes(name) ? name : null;
      })
    : [...CSV_COLUMNS];

  return body.map((cells) => {
    const row: Record<string, string> = {};
    order.forEach((column, index) => {
      if (column) row[column] = (cells[index] ?? '').trim();
    });
    // Guarantee every canonical key exists even for sparse rows.
    for (const column of CSV_COLUMNS) {
      if (!(column in row)) row[column] = '';
    }
    return row as unknown as CsvRow;
  });
}

export interface RowIssue {
  field: string;
  message: string;
  fatal: boolean;
}

export function validateRow(
  row: CsvRow,
  globals: { impower: ImpowerLevel; reviewer: ReviewerMode }
): { impower: ImpowerLevel; reviewer: ReviewerMode; targetLength: string; issues: RowIssue[] } {
  const issues: RowIssue[] = [];

  if (!row.Topic_Idea?.trim()) {
    issues.push({ field: 'Topic_Idea', message: 'Topic is required', fatal: true });
  }

  let impower = globals.impower;
  const requestedImpower = (row.Impower_Level ?? '').trim().toLowerCase();
  if (requestedImpower) {
    if ((IMPOWER_LEVELS as string[]).includes(requestedImpower)) {
      impower = requestedImpower as ImpowerLevel;
    } else {
      issues.push({
        field: 'Impower_Level',
        message: `Unknown value "${row.Impower_Level}", using ${globals.impower}`,
        fatal: false,
      });
    }
  }

  let reviewer = globals.reviewer;
  const requestedReviewer = (row.Reviewer_Mode ?? '').trim().toLowerCase();
  if (requestedReviewer) {
    if ((REVIEWER_MODES as string[]).includes(requestedReviewer)) {
      reviewer = requestedReviewer as ReviewerMode;
    } else {
      issues.push({
        field: 'Reviewer_Mode',
        message: `Unknown value "${row.Reviewer_Mode}", using ${globals.reviewer}`,
        fatal: false,
      });
    }
  }

  let targetLength = (row.Target_Length ?? '').trim().toLowerCase() || 'standard';
  if (!LENGTHS.includes(targetLength)) {
    issues.push({
      field: 'Target_Length',
      message: `Unknown value "${row.Target_Length}", using standard`,
      fatal: false,
    });
    targetLength = 'standard';
  }

  return { impower, reviewer, targetLength, issues };
}
```

- [x] **Step 4: Run the tests**

Run: `npm test -- csv`
Expected: 18 passed.

- [x] **Step 5: Commit**

```bash
git add src/utils/csv.ts src/utils/csv.test.ts
git commit -m "feat(csv): header-aware CSV parser with per-row validation"
```

---

## Task 12: Batch Queue Reducer

The highest-risk logic in the project. Pause must not fail rows. Abort must reset rather than fail. Concurrency must actually cap.

**Files:**
- Create: `src/pipeline/useBatchQueue.ts`
- Create: `src/pipeline/batchQueue.test.ts`

**Interfaces:**
- Consumes: `ImpowerLevel`, `ReviewerMode`, `PipelineConfig`, `ReviewReport`
- Produces: `RowStatus`, `BatchRow`, `BatchJob`, `QueueState`, `QueueAction`, `initialQueueState`, `batchQueueReducer`

- [x] **Step 1: Write the failing test**

Create `src/pipeline/batchQueue.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  batchQueueReducer,
  initialQueueState,
  type QueueState,
  type BatchRow,
} from './useBatchQueue';

function makeRow(index: number, overrides: Partial<BatchRow> = {}): BatchRow {
  return {
    rowId: `r${index}`,
    index,
    seedTopic: `topic ${index}`,
    focusKeyphrase: '',
    targetLength: 'standard',
    toneOverride: '',
    impowerOverride: '',
    reviewerOverride: '',
    status: 'pending',
    stageMessage: '',
    error: null,
    reviewReport: null,
    articleId: null,
    startedAt: null,
    completedAt: null,
    validationWarning: null,
    ...overrides,
  };
}

function makeState(rowCount: number, overrides: Partial<QueueState['job']> = {}): QueueState {
  return {
    ...initialQueueState,
    job: {
      jobId: 'j1',
      fileName: 'batch.csv',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
      concurrency: 2,
      isPaused: false,
      customWordCount: 1000,
      globalConfig: {
        judge: true,
        impower: 'standard',
        reviewer: 'strict',
        targetFormats: ['inline-en'],
        languages: ['en'],
      },
      rows: Array.from({ length: rowCount }, (_, i) => makeRow(i)),
      ...overrides,
    },
  };
}

// Deliberately verbose: `done` is already a common word in this codebase and a
// short helper name by it invites confusion during review.
const inFlightCount = (s: QueueState): number =>
  s.job!.rows.filter((r) =>
    ['running', 'judging', 'impowering', 'creating', 'reviewing', 'designing'].includes(r.status)
  ).length;

describe('CLAIM_ROWS honours concurrency', () => {
  it('claims exactly the concurrency limit', () => {
    expect(inFlightCount(batchQueueReducer(makeState(10), { type: 'CLAIM_ROWS' }))).toBe(2);
  });

  it('honours a limit of 1', () => {
    expect(
      inFlightCount(batchQueueReducer(makeState(5, { concurrency: 1 }), { type: 'CLAIM_ROWS' }))
    ).toBe(1);
  });

  it('never exceeds the limit across repeated claims', () => {
    let s = batchQueueReducer(makeState(10), { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'CLAIM_ROWS' });
    expect(inFlightCount(s)).toBe(2);
  });

  it('claims nothing when paused', () => {
    expect(
      inFlightCount(batchQueueReducer(makeState(5, { isPaused: true }), { type: 'CLAIM_ROWS' }))
    ).toBe(0);
  });

  it('claims nothing when every row is already claimed', () => {
    const claimed = batchQueueReducer(makeState(2), { type: 'CLAIM_ROWS' });
    expect(inFlightCount(batchQueueReducer(claimed, { type: 'CLAIM_ROWS' }))).toBe(2);
  });

  it('claims nothing when there are no rows', () => {
    expect(inFlightCount(batchQueueReducer(makeState(0), { type: 'CLAIM_ROWS' }))).toBe(0);
  });

  it('stamps startedAt on a newly claimed row', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    expect(claimed.job!.rows.find((r) => r.rowId === 'r0')?.startedAt).not.toBeNull();
  });
});

describe('SET_PAUSED does not disturb in-flight rows', () => {
  it('sets the flag', () => {
    const s = batchQueueReducer(makeState(4), { type: 'SET_PAUSED', paused: true });
    expect(s.job!.isPaused).toBe(true);
  });

  it('leaves running rows running', () => {
    const claimed = batchQueueReducer(makeState(4), { type: 'CLAIM_ROWS' });
    const paused = batchQueueReducer(claimed, { type: 'SET_PAUSED', paused: true });
    expect(inFlightCount(paused)).toBe(2);
  });

  it('claims nothing further while paused', () => {
    let s = batchQueueReducer(makeState(6), { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'SET_PAUSED', paused: true });
    s = batchQueueReducer(s, { type: 'CLAIM_ROWS' });
    expect(inFlightCount(s)).toBe(2);
  });

  it('resumes claiming after unpausing', () => {
    let s = batchQueueReducer(makeState(6), { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'SET_PAUSED', paused: true });
    s = batchQueueReducer(s, { type: 'SET_PAUSED', paused: false });
    s = batchQueueReducer(s, { type: 'CLAIM_ROWS' });
    expect(inFlightCount(s)).toBe(2);
  });
});

describe('ROW_STAGE', () => {
  it('records the stage and message', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, {
      type: 'ROW_STAGE',
      rowId: 'r0',
      stage: 'creating',
      message: 'writing markdown',
    });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.status).toBe('creating');
    expect(row?.stageMessage).toBe('writing markdown');
  });

  it('does not disturb other rows', () => {
    const claimed = batchQueueReducer(makeState(2), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, {
      type: 'ROW_STAGE',
      rowId: 'r0',
      stage: 'creating',
      message: 'x',
    });
    expect(next.job!.rows.find((r) => r.rowId === 'r1')?.status).toBe('running');
  });

  it('ignores an unknown rowId', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, {
      type: 'ROW_STAGE',
      rowId: 'nope',
      stage: 'creating',
      message: 'x',
    });
    expect(next.job!.rows).toHaveLength(1);
  });
});

describe('ROW_DONE', () => {
  it('marks the row done and links the article', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, {
      type: 'ROW_DONE',
      rowId: 'r0',
      articleId: 'art_1',
      reviewReport: null,
    });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.status).toBe('done');
    expect(row?.articleId).toBe('art_1');
    expect(row?.completedAt).not.toBeNull();
  });

  it('frees a slot so the next row can be claimed', () => {
    let s = batchQueueReducer(makeState(4), { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'ROW_DONE', rowId: 'r0', articleId: 'a', reviewReport: null });
    s = batchQueueReducer(s, { type: 'CLAIM_ROWS' });
    expect(inFlightCount(s)).toBe(2);
  });
});

describe('ROW_FAILED is only for genuine failures', () => {
  it('marks the row failed with an error message', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, {
      type: 'ROW_FAILED',
      rowId: 'r0',
      error: 'provider returned 500',
    });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.status).toBe('failed');
    expect(row?.error).toContain('500');
  });
});

describe('ROW_ABORTED resets rather than fails', () => {
  it('returns the row to pending', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, { type: 'ROW_ABORTED', rowId: 'r0' });
    expect(next.job!.rows.find((r) => r.rowId === 'r0')?.status).toBe('pending');
  });

  it('clears the error and stage message', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const staged = batchQueueReducer(claimed, {
      type: 'ROW_STAGE',
      rowId: 'r0',
      stage: 'creating',
      message: 'writing',
    });
    const next = batchQueueReducer(staged, { type: 'ROW_ABORTED', rowId: 'r0' });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.stageMessage).toBe('');
    expect(row?.error).toBeNull();
  });

  it('never leaves any row failed after aborting all in-flight rows', () => {
    const claimed = batchQueueReducer(makeState(3), { type: 'CLAIM_ROWS' });
    let next = claimed;
    for (const row of claimed.job!.rows.filter((r) => r.status === 'running')) {
      next = batchQueueReducer(next, { type: 'ROW_ABORTED', rowId: row.rowId });
    }
    expect(next.job!.rows.some((r) => r.status === 'failed')).toBe(false);
  });
});

describe('ROW_ATTENTION', () => {
  it('marks the row needs_attention and stores the report', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const report = {
      verdict: 'fail' as const,
      seoScore: 30,
      issues: [],
      revisedAfterIssues: true,
    };
    const next = batchQueueReducer(claimed, {
      type: 'ROW_ATTENTION',
      rowId: 'r0',
      articleId: 'art_1',
      reviewReport: report,
    });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.status).toBe('needs_attention');
    expect(row?.reviewReport).toEqual(report);
  });
});

describe('RETRY_ROW', () => {
  it('resets a failed row to pending', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const failed = batchQueueReducer(claimed, {
      type: 'ROW_FAILED',
      rowId: 'r0',
      error: 'boom',
    });
    const next = batchQueueReducer(failed, { type: 'RETRY_ROW', rowId: 'r0' });
    const row = next.job!.rows.find((r) => r.rowId === 'r0');
    expect(row?.status).toBe('pending');
    expect(row?.error).toBeNull();
  });

  it('resets a needs_attention row to pending', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const halted = batchQueueReducer(claimed, {
      type: 'ROW_ATTENTION',
      rowId: 'r0',
      articleId: null,
      reviewReport: {
        verdict: 'fail',
        seoScore: 1,
        issues: [],
        revisedAfterIssues: true,
      },
    });
    const next = batchQueueReducer(halted, { type: 'RETRY_ROW', rowId: 'r0' });
    expect(next.job!.rows.find((r) => r.rowId === 'r0')?.status).toBe('pending');
  });

  it('makes the row claimable again', () => {
    const claimed = batchQueueReducer(makeState(1), { type: 'CLAIM_ROWS' });
    const failed = batchQueueReducer(claimed, {
      type: 'ROW_FAILED',
      rowId: 'r0',
      error: 'boom',
    });
    const retried = batchQueueReducer(failed, { type: 'RETRY_ROW', rowId: 'r0' });
    expect(inFlightCount(batchQueueReducer(retried, { type: 'CLAIM_ROWS' }))).toBe(1);
  });
});

describe('RESET_IN_FLIGHT', () => {
  it('returns every running row to pending, as on page unload', () => {
    const claimed = batchQueueReducer(makeState(4), { type: 'CLAIM_ROWS' });
    const next = batchQueueReducer(claimed, { type: 'RESET_IN_FLIGHT' });
    expect(inFlightCount(next)).toBe(0);
    expect(next.job!.rows.every((r) => r.status === 'pending')).toBe(true);
  });

  it('leaves completed rows untouched', () => {
    let s = batchQueueReducer(makeState(4), { type: 'CLAIM_ROWS' });
    s = batchQueueReducer(s, { type: 'ROW_DONE', rowId: 'r0', articleId: 'a', reviewReport: null });
    s = batchQueueReducer(s, { type: 'RESET_IN_FLIGHT' });
    expect(s.job!.rows.find((r) => r.rowId === 'r0')?.status).toBe('done');
  });
});

describe('job-level actions', () => {
  it('SET_CONCURRENCY changes the limit', () => {
    const s = batchQueueReducer(makeState(5), { type: 'SET_CONCURRENCY', concurrency: 3 });
    expect(inFlightCount(batchQueueReducer(s, { type: 'CLAIM_ROWS' }))).toBe(3);
  });

  it('SET_CONCURRENCY clamps to the 1-3 range', () => {
    expect(batchQueueReducer(makeState(1), { type: 'SET_CONCURRENCY', concurrency: 9 }).job!.concurrency).toBe(3);
    expect(batchQueueReducer(makeState(1), { type: 'SET_CONCURRENCY', concurrency: 0 }).job!.concurrency).toBe(1);
  });

  it('LOAD_JOB replaces the job', () => {
    const s = batchQueueReducer(makeState(1), {
      type: 'LOAD_JOB',
      job: makeState(7).job!,
    });
    expect(s.job!.rows).toHaveLength(7);
  });

  it('CLEAR_JOB empties the job', () => {
    expect(batchQueueReducer(makeState(3), { type: 'CLEAR_JOB' }).job).toBeNull();
  });
});

describe('null-job safety', () => {
  it('returns the same state for every action when there is no job', () => {
    const actions: Parameters<typeof batchQueueReducer>[1][] = [
      { type: 'CLAIM_ROWS' },
      { type: 'SET_PAUSED', paused: true },
      { type: 'RESET_IN_FLIGHT' },
      { type: 'RETRY_ROW', rowId: 'r0' },
    ];
    for (const action of actions) {
      expect(batchQueueReducer(initialQueueState, action)).toBe(initialQueueState);
    }
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npm test -- batchQueue`
Expected: FAIL — cannot resolve `./useBatchQueue`.

- [x] **Step 3: Write the reducer**

Create `src/pipeline/useBatchQueue.ts` with types and reducer only. The hook is added in Task 13:

```ts
import type {
  ImpowerLevel,
  PipelineConfig,
  PipelineStage,
  ReviewerMode,
  ReviewReport,
} from './stages';

export type RowStatus =
  | 'pending'
  | 'running'
  | 'judging'
  | 'impowering'
  | 'creating'
  | 'reviewing'
  | 'designing'
  | 'done'
  | 'failed'
  | 'needs_attention';

export interface BatchRow {
  rowId: string;
  index: number;
  seedTopic: string;
  focusKeyphrase: string;
  targetLength: string;
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
  concurrency: number;
  isPaused: boolean;
  customWordCount: number;
  globalConfig: Omit<PipelineConfig, 'targetWords'>;
  rows: BatchRow[];
}

export interface QueueState {
  job: BatchJob | null;
}

export type QueueAction =
  | { type: 'LOAD_JOB'; job: BatchJob }
  | { type: 'CLEAR_JOB' }
  | { type: 'CLAIM_ROWS' }
  | { type: 'SET_PAUSED'; paused: boolean }
  | { type: 'SET_CONCURRENCY'; concurrency: number }
  | { type: 'ROW_STAGE'; rowId: string; stage: PipelineStage; message: string }
  | { type: 'ROW_DONE'; rowId: string; articleId: string; reviewReport: ReviewReport | null }
  | { type: 'ROW_FAILED'; rowId: string; error: string }
  | { type: 'ROW_ABORTED'; rowId: string }
  | { type: 'ROW_ATTENTION'; rowId: string; articleId: string | null; reviewReport: ReviewReport }
  | { type: 'RETRY_ROW'; rowId: string }
  | { type: 'RESET_IN_FLIGHT' };

export const initialQueueState: QueueState = { job: null };

const IN_FLIGHT: RowStatus[] = [
  'running',
  'judging',
  'impowering',
  'creating',
  'reviewing',
  'designing',
];

function isInFlight(row: BatchRow): boolean {
  return IN_FLIGHT.includes(row.status);
}

function updateRow(job: BatchJob, rowId: string, patch: Partial<BatchRow>): BatchJob {
  return {
    ...job,
    updatedAt: new Date().toISOString(),
    rows: job.rows.map((row) => (row.rowId === rowId ? { ...row, ...patch } : row)),
  };
}

export function batchQueueReducer(state: QueueState, action: QueueAction): QueueState {
  const { job } = state;
  if (!job) return state;

  switch (action.type) {
    case 'LOAD_JOB':
      return { job: action.job };

    case 'CLEAR_JOB':
      return { job: null };

    case 'SET_PAUSED':
      return { job: { ...job, isPaused: action.paused, updatedAt: new Date().toISOString() } };

    case 'SET_CONCURRENCY':
      return {
        job: {
          ...job,
          concurrency: Math.max(1, Math.min(3, action.concurrency)),
          updatedAt: new Date().toISOString(),
        },
      };

    case 'CLAIM_ROWS': {
      if (job.isPaused) return state;

      let slots = job.concurrency - job.rows.filter(isInFlight).length;
      if (slots <= 0) return state;

      const now = new Date().toISOString();
      const rows = job.rows.map((row) => {
        if (slots > 0 && row.status === 'pending') {
          slots -= 1;
          return {
            ...row,
            status: 'running' as RowStatus,
            stageMessage: 'starting...',
            error: null,
            startedAt: now,
          };
        }
        return row;
      });

      return { job: { ...job, rows, updatedAt: new Date().toISOString() } };
    }

    case 'ROW_STAGE':
      return {
        job: updateRow(job, action.rowId, {
          status: action.stage as RowStatus,
          stageMessage: action.message,
        }),
      };

    case 'ROW_DONE':
      return {
        job: updateRow(job, action.rowId, {
          status: 'done',
          stageMessage: 'complete',
          articleId: action.articleId,
          reviewReport: action.reviewReport,
          error: null,
          completedAt: new Date().toISOString(),
        }),
      };

    case 'ROW_FAILED':
      return {
        job: updateRow(job, action.rowId, {
          status: 'failed',
          stageMessage: '',
          error: action.error,
          completedAt: new Date().toISOString(),
        }),
      };

    // An abort means the work was interrupted, not that it failed. Resetting to
    // pending is what prevents a cancelled or reloaded batch from filling with
    // spurious failures.
    case 'ROW_ABORTED':
      return {
        job: updateRow(job, action.rowId, {
          status: 'pending',
          stageMessage: '',
          error: null,
          startedAt: null,
        }),
      };

    case 'ROW_ATTENTION':
      return {
        job: updateRow(job, action.rowId, {
          status: 'needs_attention',
          stageMessage: 'reviewer blocked this article',
          articleId: action.articleId,
          reviewReport: action.reviewReport,
          completedAt: new Date().toISOString(),
        }),
      };

    case 'RETRY_ROW':
      return {
        job: updateRow(job, action.rowId, {
          status: 'pending',
          stageMessage: '',
          error: null,
          reviewReport: null,
          articleId: null,
          startedAt: null,
          completedAt: null,
        }),
      };

    case 'RESET_IN_FLIGHT':
      return {
        job: {
          ...job,
          updatedAt: new Date().toISOString(),
          rows: job.rows.map((row) =>
            isInFlight(row)
              ? { ...row, status: 'pending' as RowStatus, stageMessage: '', startedAt: null }
              : row
          ),
        },
      };

    default:
      return state;
  }
}
```

- [x] **Step 4: Run the tests**

Run: `npm test -- batchQueue`
Expected: 26 passed.

- [x] **Step 5: Verify the type check**

Run: `npm run lint`
Expected: only the 4 known `src/App.tsx` errors.

- [x] **Step 6: Commit**

```bash
git add src/pipeline/useBatchQueue.ts src/pipeline/batchQueue.test.ts
git commit -m "feat(batch): queue reducer with concurrency cap and abort-resets-to-pending"
```

---

## Task 13: Batch Queue Hook

The reducer needs a driver that owns the worker pool, the `AbortController`, and persistence.

**Files:**
- Modify: `src/pipeline/useBatchQueue.ts` (append the hook)

**Interfaces:**
- Consumes: `batchQueueReducer`, `runArticle`, `putJob`, `putArticle`, `getJob`
- Produces: `useBatchQueue(options)`, `targetWordsFor(row, job)`

- [x] **Step 1: Append the imports**

Add to the top of `src/pipeline/useBatchQueue.ts`:

```ts
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { runArticle } from './runArticle';
import { putArticle, putJob } from '../db';
import type { UserProfile } from '../types/profile';
import type { UniversalRules } from '../config/universalRules';
import type { MultiAgentConfig } from '../types/provider';
```

- [x] **Step 2: Append the hook**

Append at the end of `src/pipeline/useBatchQueue.ts`:

```ts
export interface UseBatchQueueOptions {
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  universalRules: UniversalRules;
}

export interface UseBatchQueueResult {
  state: QueueState;
  loadJob: (job: BatchJob) => void;
  clearJob: () => void;
  start: () => void;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
  retryRow: (rowId: string) => void;
  setConcurrency: (value: number) => void;
}

export function targetWordsFor(row: BatchRow, job: BatchJob): number {
  switch (row.targetLength) {
    case 'short':
      return 600;
    case 'long':
      return 1500;
    case 'custom':
      return job.customWordCount;
    default:
      return 950;
  }
}

export function useBatchQueue(options: UseBatchQueueOptions): UseBatchQueueResult {
  const [state, dispatch] = useReducer(batchQueueReducer, initialQueueState);

  // jobRef is the single source of truth for the current job inside async
  // callbacks. Reading state.job directly inside a worker would capture a stale
  // closure and re-run the same row forever.
  const jobRef = useRef<BatchJob | null>(null);
  jobRef.current = state.job;

  const optionsRef = useRef(options);
  optionsRef.current = options;

  // Persist on every status transition so a reload restores the queue.
  useEffect(() => {
    if (state.job) {
      void putJob(state.job as unknown as { jobId: string; createdAt: string; updatedAt: string });
    }
  }, [state.job]);

  // A reload or view unmount must not leave rows stranded mid-flight.
  useEffect(() => {
    const onUnload = () => dispatch({ type: 'RESET_IN_FLIGHT' });
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      dispatch({ type: 'RESET_IN_FLIGHT' });
    };
  }, []);

  const processRow = useCallback(async (rowId: string, signal: AbortSignal) => {
    const job = jobRef.current;
    if (!job) return;
    const row = job.rows.find((r) => r.rowId === rowId);
    if (!row) return;

    const config = {
      ...job.globalConfig,
      impower: row.impowerOverride || job.globalConfig.impower,
      reviewer: row.reviewerOverride || job.globalConfig.reviewer,
      targetWords: targetWordsFor(row, job),
    };

    try {
      const result = await runArticle({
        seedTopic: row.seedTopic,
        focusKeyphrase: row.focusKeyphrase || undefined,
        toneOverride: row.toneOverride,
        config,
        profile: optionsRef.current.profile,
        multiAgentConfig: optionsRef.current.multiAgentConfig,
        universalRules: optionsRef.current.universalRules,
        batchRefs: { jobId: job.jobId, rowId: row.rowId },
        onStage: (stage, message) =>
          dispatch({ type: 'ROW_STAGE', rowId: row.rowId, stage, message }),
        signal,
      });

      if (result.error === 'aborted') {
        dispatch({ type: 'ROW_ABORTED', rowId: row.rowId });
        return;
      }

      if (result.status === 'done' && result.article) {
        await putArticle(result.article);
        dispatch({
          type: 'ROW_DONE',
          rowId: row.rowId,
          articleId: result.article.id,
          reviewReport: result.reviewReport ?? null,
        });
        return;
      }

      if (result.status === 'needs_attention') {
        if (result.article) await putArticle(result.article);
        dispatch({
          type: 'ROW_ATTENTION',
          rowId: row.rowId,
          articleId: result.article?.id ?? null,
          reviewReport: result.reviewReport!,
        });
        return;
      }

      dispatch({
        type: 'ROW_FAILED',
        rowId: row.rowId,
        error: result.error ?? 'Generation failed',
      });
    } catch (err) {
      if (signal.aborted) {
        dispatch({ type: 'ROW_ABORTED', rowId: row.rowId });
      } else {
        dispatch({
          type: 'ROW_FAILED',
          rowId: row.rowId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }, []);

  const start = useCallback(() => {
    const job = jobRef.current;
    if (!job) return;

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const worker = async () => {
      for (;;) {
        if (signal.aborted) return;

        const current = jobRef.current;
        if (!current || current.isPaused) return;

        const next = current.rows.find((r) => r.status === 'pending');
        if (!next) return;

        dispatch({ type: 'ROW_STAGE', rowId: next.rowId, stage: 'running', message: 'starting...' });
        await processRow(next.rowId, signal);
      }
    };

    void Promise.all(Array.from({ length: job.concurrency }, worker));
  }, [processRow]);

  const pause = useCallback(() => dispatch({ type: 'SET_PAUSED', paused: true }), []);
  const resume = useCallback(() => dispatch({ type: 'SET_PAUSED', paused: false }), []);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: 'RESET_IN_FLIGHT' });
    dispatch({ type: 'SET_PAUSED', paused: true });
  }, []);

  const retryRow = useCallback(
    (rowId: string) => dispatch({ type: 'RETRY_ROW', rowId }),
    []
  );
  const setConcurrency = useCallback(
    (value: number) => dispatch({ type: 'SET_CONCURRENCY', concurrency: value }),
    []
  );
  const loadJob = useCallback((job: BatchJob) => dispatch({ type: 'LOAD_JOB', job }), []);
  const clearJob = useCallback(() => dispatch({ type: 'CLEAR_JOB' }), []);

  return {
    state,
    loadJob,
    clearJob,
    start,
    pause,
    resume,
    cancel,
    retryRow,
    setConcurrency,
  };
}
```

Add the missing ref declaration alongside the other refs:

```ts
const abortRef = useRef<AbortController | null>(null);
```

- [x] **Step 3: Verify**

Run: `npm run lint`
Expected: only the 4 known `src/App.tsx` errors.
Run: `npm test`
Expected: pass.

- [x] **Step 4: Commit**

```bash
git add src/pipeline/useBatchQueue.ts
git commit -m "feat(batch): worker-pool hook with pause, cancel, retry, and persistence"
```

---

## Task 14: Hash Router and App Shell

**Files:**
- Create: `src/app/useHashRoute.ts`
- Create: `src/app/useHashRoute.test.ts`
- Create: `src/app/AppShell.tsx`

**Interfaces:**
- Produces: `RouteId`, `parseHash`, `navigateTo`, `useHashRoute`, `ROUTES`, `AppShell`

- [x] **Step 1: Write the failing test**

Create `src/app/useHashRoute.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseHash, ROUTES } from './useHashRoute';

describe('parseHash', () => {
  it('maps every known route', () => {
    for (const route of ROUTES) {
      expect(parseHash(`#/${route}`)).toBe(route);
    }
  });

  it('defaults to generate for empty or unknown values', () => {
    expect(parseHash('')).toBe('generate');
    expect(parseHash('#/')).toBe('generate');
    expect(parseHash('#/nonsense')).toBe('generate');
  });

  it('accepts a bare route name without the slash', () => {
    expect(parseHash('#batch')).toBe('batch');
  });

  it('exposes exactly five routes', () => {
    expect(ROUTES).toHaveLength(5);
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npm test -- useHashRoute`
Expected: FAIL — cannot resolve `./useHashRoute`.

- [x] **Step 3: Write the implementation**

Create `src/app/useHashRoute.ts`:

```ts
import { useCallback, useEffect, useState } from 'react';

export type RouteId = 'generate' | 'batch' | 'profile' | 'history' | 'providers';

export const ROUTES: RouteId[] = ['generate', 'batch', 'profile', 'history', 'providers'];

export function parseHash(hash: string): RouteId {
  const cleaned = hash.replace(/^#\/?/, '').trim();
  return (ROUTES as string[]).includes(cleaned) ? (cleaned as RouteId) : 'generate';
}

export function navigateTo(route: RouteId): void {
  window.location.hash = `#/${route}`;
}

export function useHashRoute(): [RouteId, (route: RouteId) => void] {
  const [route, setRoute] = useState<RouteId>(() =>
    parseHash(typeof window === 'undefined' ? '' : window.location.hash)
  );

  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  const navigate = useCallback((next: RouteId) => navigateTo(next), []);

  return [route, navigate];
}
```

- [x] **Step 4: Run the tests**

Run: `npm test -- useHashRoute`
Expected: 4 passed.

- [x] **Step 5: Write `AppShell.tsx`**

Create `src/app/AppShell.tsx`:

```tsx
import React, { type ReactNode } from 'react';
import { Cpu, Sparkles, Layers, User, Clock, Server } from 'lucide-react';
import { navigateTo, type RouteId } from './useHashRoute';

const NAV: { id: RouteId; label: string; icon: ReactNode }[] = [
  { id: 'generate', label: 'Generate', icon: <Sparkles className="w-4 h-4" /> },
  { id: 'batch', label: 'Batch', icon: <Layers className="w-4 h-4" /> },
  { id: 'profile', label: 'Profile', icon: <User className="w-4 h-4" /> },
  { id: 'history', label: 'History', icon: <Clock className="w-4 h-4" /> },
  { id: 'providers', label: 'Providers', icon: <Server className="w-4 h-4" /> },
];

interface AppShellProps {
  activeRoute: RouteId;
  children: ReactNode;
  historyCount: number;
  profileConfigured: boolean;
  serverStatus: 'connected' | 'checking' | 'error';
}

export const AppShell: React.FC<AppShellProps> = ({
  activeRoute,
  children,
  historyCount,
  profileConfigured,
  serverStatus,
}) => {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex font-sans antialiased selection:bg-zinc-800">
      <nav className="w-52 shrink-0 border-r border-zinc-900 bg-zinc-950 flex flex-col">
        <div className="p-4 border-b border-zinc-900 flex items-center gap-2">
          <Cpu className="w-5 h-5 text-zinc-300" />
          <div className="min-w-0">
            <div className="text-sm font-semibold leading-tight">Fisio Architect</div>
            <div className="text-[10px] text-zinc-500 font-mono">v2.0</div>
          </div>
        </div>

        <div className="flex-1 p-2 space-y-1">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => navigateTo(item.id)}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                activeRoute === item.id
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200'
              }`}
            >
              <span className={activeRoute === item.id ? 'text-zinc-100' : 'text-zinc-500'}>
                {item.icon}
              </span>
              <span>{item.label}</span>
              {item.id === 'history' && historyCount > 0 && (
                <span className="ml-auto text-[10px] font-mono text-zinc-400 bg-zinc-800 px-1.5 py-0.5 rounded">
                  {historyCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-zinc-900 space-y-2">
          {!profileConfigured && (
            <button
              onClick={() => navigateTo('profile')}
              className="w-full text-left text-[10px] font-mono text-amber-400 border border-amber-900 bg-amber-950/40 rounded px-2 py-1.5 hover:bg-amber-950/70"
            >
              Profile not configured — content will use fallback defaults
            </button>
          )}
          <div
            className={`text-[10px] font-mono ${
              serverStatus === 'connected'
                ? 'text-emerald-500'
                : serverStatus === 'error'
                  ? 'text-rose-400'
                  : 'text-zinc-500'
            }`}
          >
            {serverStatus === 'connected' ? 'server connected' : serverStatus}
          </div>
        </div>
      </nav>

      <main className="flex-1 min-w-0 h-100dvh overflow-y-auto">{children}</main>
    </div>
  );
};
```

- [x] **Step 6: Commit**

```bash
git add src/app
git commit -m "feat(app): hash router and nav shell with five routed views"
```

---

## Task 15: Batch ZIP Export

Refactor `downloadAllAsZip` so its per-article logic is reusable, then add the whole-batch archive.

**Files:**
- Modify: `src/utils/exportUtils.ts`
- Create: `src/utils/exportUtils.test.ts`

**Interfaces:**
- Produces: `buildArticleFolder(article)`, `downloadAllAsZip(article)`, `downloadBatchAsZip(jobId, articles)`, `downloadFile`

- [x] **Step 1: Write the failing test**

Create `src/utils/exportUtils.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildArticleFolder } from './exportUtils';
import type { GeneratedArticle } from '../types/article';

const article = (overrides: Partial<GeneratedArticle> = {}): GeneratedArticle =>
  ({
    id: 'a1',
    topic: 'Treadmill guide',
    focusKeyphrase: 'treadmill',
    secondaryKeywords: '',
    language: 'en',
    lengthTarget: 'standard',
    targetWordCount: 950,
    formats: {
      'inline-en': '<article>inline en</article>',
      'clean-en': '<article>clean en</article>',
    },
    seoMetadata: {
      seoTitle: 'T',
      headline: 'H',
      focusKeyphrase: 'treadmill',
      metaDescription: 'M',
      urlSlug: 'treadmill-guide',
      tags: ['gym'],
    },
    inlineCssHtml: '<article>inline en</article>',
    cleanHtml: '<article>clean en</article>',
    imagePrompts: [],
    metrics: { wordCount: 900, readingTimeMinutes: 5, fleschScore: 66 },
    generatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }) as GeneratedArticle;

describe('buildArticleFolder', () => {
  it('includes every available format', () => {
    const files = buildArticleFolder(article());
    const names = files.map((f) => f.name);
    expect(names).toContain('treadmill-guide-inline-en.html');
    expect(names).toContain('treadmill-guide-clean-en.html');
  });

  it('includes a metadata summary', () => {
    const files = buildArticleFolder(article());
    const meta = files.find((f) => f.name.endsWith('-seo-metadata.txt'));
    expect(meta?.content).toContain('treadmill');
    expect(meta?.content).toContain('900');
  });

  it('includes the article markdown when present', () => {
    const files = buildArticleFolder(article({ rawText: '# Title\n\nBody' }));
    const md = files.find((f) => f.name.endsWith('.md'));
    expect(md?.content).toContain('# Title');
  });

  it('omits the markdown file when rawText is absent', () => {
    const files = buildArticleFolder(article({ rawText: undefined }));
    expect(files.some((f) => f.name.endsWith('.md'))).toBe(false);
  });

  it('includes the review report when present', () => {
    const files = buildArticleFolder(
      article({
        reviewReport: {
          verdict: 'pass',
          seoScore: 88,
          issues: [],
          revisedAfterIssues: false,
        },
      })
    );
    const report = files.find((f) => f.name.endsWith('-review-report.json'));
    expect(report?.content).toContain('pass');
  });

  it('omits the review report when absent', () => {
    const files = buildArticleFolder(article());
    expect(files.some((f) => f.name.endsWith('-review-report.json'))).toBe(false);
  });

  it('includes image prompts when present', () => {
    const files = buildArticleFolder(
      article({
        imagePrompts: [
          {
            type: 'featured',
            label: 'Featured',
            aspectRatio: '16:9',
            concept: 'c',
            prompt: 'p',
          },
        ],
      })
    );
    expect(files.some((f) => f.name.endsWith('-ai-image-prompts.txt'))).toBe(true);
  });

  it('prefixes every filename with the slug', () => {
    for (const file of buildArticleFolder(article())) {
      expect(file.name.startsWith('treadmill-guide')).toBe(true);
    }
  });

  it('falls back to a default slug', () => {
    const files = buildArticleFolder(
      article({
        seoMetadata: { ...article().seoMetadata, urlSlug: '' },
      })
    );
    expect(files[0].name).not.toBe('');
  });
});
```

- [x] **Step 2: Run to verify it fails**

Run: `npm test -- exportUtils`
Expected: FAIL — `buildArticleFolder` is not exported.

- [x] **Step 3: Refactor `exportUtils.ts`**

Extract the per-article file list into a pure function, then rewrite the download functions on top of it. Replace `downloadAllAsZip`'s body entirely and add the batch variant:

```ts
import JSZip from 'jszip';
import { GeneratedArticle } from '../types/article';
import { isCleanHtmlIncomplete, synthesizeCleanHtml } from './cleanHtmlUtils';

export interface ArticleFile {
  name: string;
  content: string;
}

export function buildArticleFolder(article: GeneratedArticle): ArticleFile[] {
  const slug = article.seoMetadata?.urlSlug || 'article';
  const files: ArticleFile[] = [];

  const inlineEn = article.formats?.['inline-en'] || article.inlineCssHtml;
  const inlineId = article.formats?.['inline-id'];
  const cleanEn = article.formats?.['clean-en'] || article.cleanHtml;
  const cleanId = article.formats?.['clean-id'];

  if (inlineEn) files.push({ name: `${slug}-inline-en.html`, content: inlineEn });
  if (inlineId) files.push({ name: `${slug}-inline-id.html`, content: inlineId });

  if (cleanEn) {
    files.push({
      name: `${slug}-clean-en.html`,
      content: isCleanHtmlIncomplete(cleanEn)
        ? synthesizeCleanHtml(inlineEn, cleanEn, article.topic)
        : cleanEn,
    });
  }
  if (cleanId) {
    files.push({
      name: `${slug}-clean-id.html`,
      content: isCleanHtmlIncomplete(cleanId)
        ? synthesizeCleanHtml(inlineId || inlineEn, cleanId, article.topic)
        : cleanId,
    });
  }

  if (article.seoMetadataEn) {
    files.push({
      name: `${slug}-seo-metadata-en.json`,
      content: JSON.stringify(article.seoMetadataEn, null, 2),
    });
  }
  if (article.seoMetadataId) {
    files.push({
      name: `${slug}-seo-metadata-id.json`,
      content: JSON.stringify(article.seoMetadataId, null, 2),
    });
  }
  if (!article.seoMetadataEn && !article.seoMetadataId) {
    files.push({
      name: `${slug}-seo-metadata.json`,
      content: JSON.stringify(article.seoMetadata, null, 2),
    });
  }

  files.push({ name: `${slug}-seo-metadata.txt`, content: buildMetadataSummary(article) });

  if (article.rawText) {
    files.push({ name: `${slug}.md`, content: article.rawText });
  }

  if (article.reviewReport) {
    files.push({
      name: `${slug}-review-report.json`,
      content: JSON.stringify(article.reviewReport, null, 2),
    });
  }

  if (article.imagePrompts?.length) {
    const lines = [
      '=========================================',
      'AI IMAGE GENERATOR PROMPTS (8K HYPER-REALISTIC)',
      '=========================================',
      `Target Article: ${article.seoMetadata?.headline ?? article.topic}`,
      '',
    ];
    article.imagePrompts.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${item.label.toUpperCase()} (Aspect Ratio --ar ${item.aspectRatio})`
      );
      lines.push(`   - Concept: ${item.concept}`);
      lines.push(`   - Prompt Midjourney / FLUX / GPT:`);
      lines.push(`   "${item.prompt}"`, '');
    });
    files.push({ name: `${slug}-ai-image-prompts.txt`, content: lines.join('\n') });
  }

  return files;
}

function buildMetadataSummary(article: GeneratedArticle): string {
  const meta = article.seoMetadata;
  return [
    '=========================================',
    'SEO WORDPRESS METADATA',
    '=========================================',
    `SEO Title       : ${meta?.seoTitle ?? ''}`,
    `Headline        : ${meta?.headline ?? ''}`,
    `Focus Keyphrase : ${article.focusKeyphrase || meta?.focusKeyphrase || ''}`,
    `Meta Description: ${meta?.metaDescription ?? ''}`,
    `URL Slug        : ${meta?.urlSlug ?? ''}`,
    `Tags            : ${(meta?.tags ?? []).join(', ')}`,
    '',
    '=========================================',
    'ARTICLE PERFORMANCE METRICS',
    '=========================================',
    `Target Words    : ${article.targetWordCount}`,
    `Actual Words    : ${article.metrics?.wordCount ?? 0}`,
    `Reading Time    : ~${article.metrics?.readingTimeMinutes ?? 0} mins`,
    `Flesch Score    : ${article.metrics?.fleschScore ?? 0}`,
    `Generated Date  : ${new Date(article.generatedAt).toLocaleString()}`,
    `Active Formats  : ${Object.keys(article.formats ?? {}).join(', ') || 'none'}`,
    article.reviewReport
      ? `Review Verdict  : ${article.reviewReport.verdict} (score ${article.reviewReport.seoScore})`
      : 'Review Verdict  : not reviewed',
    '',
  ].join('\n');
}

export async function downloadAllAsZip(article: GeneratedArticle): Promise<void> {
  const zip = new JSZip();
  for (const file of buildArticleFolder(article)) {
    zip.file(file.name, file.content);
  }
  const slug = article.seoMetadata?.urlSlug || 'article';
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${slug}-package.zip`);
}

export async function downloadBatchAsZip(articles: GeneratedArticle[]): Promise<void> {
  const zip = new JSZip();
  articles.forEach((article, index) => {
    const slug = article.seoMetadata?.urlSlug || `article-${index + 1}`;
    const folder = zip.folder(slug) ?? zip;
    for (const file of buildArticleFolder(article)) {
      folder.file(file.name, file.content);
    }
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `fisio-batch-${articles.length}-articles.zip`);
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
```

Keep `copyToClipboard` and `downloadFile` unchanged at the top of the file.

- [x] **Step 4: Run the tests**

Run: `npm test -- exportUtils`
Expected: 9 passed.

- [x] **Step 5: Commit**

```bash
git add src/utils/exportUtils.ts src/utils/exportUtils.test.ts
git commit -m "feat(export): reusable article folder builder and batch ZIP archive"
```

---

## Task 16: Rewire `App.tsx` — Clears the Known Lint Failure

This is the task that clears the 4 permitted `TS2305` errors in `src/App.tsx`. It replaces the single-workspace layout with the five-view shell, keeping the existing components intact.

**Files:**
- Modify: `src/App.tsx` (rewrite)
- Create: `src/components/PipelineSettingsPanel.tsx`
- Modify: `src/components/TopicConsole.tsx` (add pipeline props)
- Create: `src/components/UserProfileForm.tsx`
- Create: `src/components/HistoryTable.tsx`
- Create: `src/components/BatchUploadTable.tsx`
- Create: `src/components/BatchQueueTable.tsx`
- Create: `src/components/HtmlPreviewPane.tsx`
- Create: `src/views/GenerateView.tsx`
- Create: `src/views/BatchView.tsx`
- Create: `src/views/ProfileView.tsx`
- Create: `src/views/HistoryView.tsx`
- Create: `src/views/ProvidersView.tsx`
- Delete: `src/components/HistoryDrawer.tsx`
- Delete: `src/components/ProviderSettingsModal.tsx`

**Interfaces:**
- Consumes: everything from Tasks 2–15
- Produces: five views wired to the router

**This task is large because it is the integration point.** Work through it in the order below, running `npm run lint` after each numbered section. The lint gate is satisfied the moment `App.tsx` no longer imports from `./utils/db`.

- [x] **Step 1: Create `PipelineSettingsPanel.tsx`**

```tsx
import React from 'react';
import type { ImpowerLevel, PipelineConfig, ReviewerMode } from '../pipeline/stages';

interface PipelineSettingsPanelProps {
  config: PipelineConfig;
  onChange: (config: PipelineConfig) => void;
}

const IMPOWER_OPTIONS: { id: ImpowerLevel; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'Creator plans itself. 0 extra calls.' },
  { id: 'lite', label: 'Lite', hint: 'Metadata + 5 keywords. 1 call.' },
  { id: 'standard', label: 'Standard', hint: 'Full brief with outline. 1 call.' },
  { id: 'max', label: 'Max', hint: 'Keyword research then brief. 2 calls.' },
];

const REVIEWER_OPTIONS: { id: ReviewerMode; label: string; hint: string }[] = [
  { id: 'off', label: 'Off', hint: 'No review. 0 calls.' },
  { id: 'advisory', label: 'Advisory', hint: 'Reports but never blocks. 1 call.' },
  { id: 'strict', label: 'Strict', hint: 'Blocks with one auto-revision. 1-2 calls.' },
];

export const PipelineSettingsPanel: React.FC<PipelineSettingsPanelProps> = ({ config, onChange }) => {
  const set = <K extends keyof PipelineConfig>(key: K, value: PipelineConfig[K]) =>
    onChange({ ...config, [key]: value });

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-5">
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-zinc-200">Pipeline stages</h3>
        <p className="text-[11px] text-zinc-500">
          Creator and Designer always run. Everything else is optional.
        </p>
      </div>

      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={config.judge}
          onChange={(e) => set('judge', e.target.checked)}
          className="mt-0.5 accent-zinc-100"
        />
        <span className="space-y-0.5">
          <span className="block text-xs text-zinc-200">Judge — refine the topic angle</span>
          <span className="block text-[11px] text-zinc-500">
            Evaluates the seed against your target market. 1 call.
          </span>
        </span>
      </label>

      <div className="space-y-1.5">
        <span className="block text-xs text-zinc-200">Impower — SEO research depth</span>
        <div className="grid grid-cols-4 gap-1.5">
          {IMPOWER_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => set('impower', option.id)}
              title={option.hint}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                config.impower === option.id
                  ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="block text-[11px] text-zinc-500">
          {IMPOWER_OPTIONS.find((o) => o.id === config.impower)?.hint}
        </span>
      </div>

      <div className="space-y-1.5">
        <span className="block text-xs text-zinc-200">Reviewer — quality gate</span>
        <div className="grid grid-cols-3 gap-1.5">
          {REVIEWER_OPTIONS.map((option) => (
            <button
              key={option.id}
              onClick={() => set('reviewer', option.id)}
              title={option.hint}
              className={`px-2 py-1.5 rounded-lg text-[11px] font-medium border transition-colors ${
                config.reviewer === option.id
                  ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                  : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="block text-[11px] text-zinc-500">
          {REVIEWER_OPTIONS.find((o) => o.id === config.reviewer)?.hint}
        </span>
      </div>
    </div>
  );
};
```

- [x] **Step 2: Create `UserProfileForm.tsx`**

```tsx
import React, { useState } from 'react';
import { Check, Plus, Trash2 } from 'lucide-react';
import type { DesignRules, UserProfile } from '../types/profile';
import { DEFAULT_USER_PROFILE, FALLBACK_BRAND, isProfileConfigured } from '../types/profile';

interface UserProfileFormProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
}

const SAMPLE_PROFILE: UserProfile = {
  businessName: 'Klinik Sehat Sentosa',
  niche: 'Klinik fisioterapi dan rehabilitas',
  location: 'Jakarta Selatan, Indonesia',
  targetMarket: 'Karyawan kantoran usia 25-45 tahun dengan keluhan nyeri punggung',
  usp: 'Terapi manualcombine dengan latihan rehabilitasi berbasis bukti, Curves of research',
  toneOfVoice: 'Profesional, hangat, dan mudah dipahami',
  defaultCta: 'Jadwalkan konsultasi fisioterapi pertama Anda hari ini.',
  designRules: {
    primaryColor: '#0d9488',
    secondaryColor: '#134e4a',
    accentColor: '#f59e0b',
    backgroundColor: '#f8fafc',
    textColor: '#1f2937',
    headingFont: '"Plus Jakarta Sans", system-ui, sans-serif',
    bodyFont: 'Inter, system-ui, sans-serif',
    buttonStyle: 'rounded',
    blockquoteStyle: 'accent-bar',
  },
  exclusions: [
    'EXCLUDE voucher and discount searches ("diskon fisioterapi", "promo gratis") — position on clinical outcomes, not price.',
    'EXCLUDE acute emergency searches ("fisioterapi积分 emergency 24 jam") — refer those cases to a hospital.',
  ],
};

const COLOR_FIELDS: { key: keyof DesignRules; label: string }[] = [
  { key: 'primaryColor', label: 'Primary' },
  { key: 'secondaryColor', label: 'Secondary' },
  { key: 'accentColor', label: 'Accent' },
  { key: 'backgroundColor', label: 'Background' },
  { key: 'textColor', label: 'Body text' },
];

const FIELD_LABELS: { key: keyof UserProfile; label: string; placeholder: string }[] = [
  { key: 'businessName', label: 'Business / brand name', placeholder: 'Sehat Sentosa' },
  { key: 'niche', label: 'Industry / niche', placeholder: 'Klinik fisioterapi' },
  { key: 'location', label: 'Location', placeholder: 'Jakarta Selatan, Indonesia' },
  { key: 'targetMarket', label: 'Target market', placeholder: 'Office workers aged 25-45 with back pain' },
  { key: 'usp', label: 'Unique selling proposition', placeholder: 'What sets you apart?' },
  { key: 'toneOfVoice', label: 'Tone of voice', placeholder: 'Professional, warm, easy to read' },
  { key: 'defaultCta', label: 'Default call to action', placeholder: 'Book your first session today.' },
];

export const UserProfileForm: React.FC<UserProfileFormProps> = ({ profile, onSave }) => {
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [saved, setSaved] = useState(false);
  const [newExclusion, setNewExclusion] = useState('');

  const setField = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const setDesign = <K extends keyof DesignRules>(key: K, value: string) =>
    setDraft((prev) => ({ ...prev, designRules: { ...prev.designRules, [key]: value } }));

  const handleSave = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1200);
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-100">Brand profile</h2>
          <p className="text-[11px] text-zinc-400">
            Every prompt is built from this. Empty fields fall back to the legacy defaults.
          </p>
        </div>
        <button
          onClick={() => setDraft(SAMPLE_PROFILE)}
          className="px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Load sample profile
        </button>
      </div>

      {!isProfileConfigured(draft) && (
        <div className="p-3 bg-amber-950/40 border border-amber-900 rounded-lg text-[11px] text-amber-300">
          Profile is incomplete. Generated content will use fallback values:{' '}
          <span className="font-medium">{FALLBACK_BRAND.businessName}</span>,{' '}
          {FALLBACK_BRAND.niche}.
        </div>
      )}

      <div className="space-y-3">
        {FIELD_LABELS.map((field) => (
          <label key={field.key} className="block space-y-1">
            <span className="text-xs text-zinc-300 font-medium">{field.label}</span>
            <textarea
              value={String(draft[field.key] ?? '')}
              onChange={(e) => setField(field.key, e.target.value as UserProfile[typeof field.key])}
              placeholder={field.placeholder}
              rows={field.key === 'targetMarket' || field.key === 'usp' ? 2 : 1}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 outline-none focus:border-zinc-500 resize-y"
            />
          </label>
        ))}
      </div>

      <div className="space-y-3 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-zinc-200">Design tokens</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {COLOR_FIELDS.map((field) => (
            <label key={field.key} className="block space-y-1">
              <span className="text-[11px] text-zinc-400">{field.label}</span>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={draft.designRules[field.key] as string}
                  onChange={(e) => setDesign(field.key, e.target.value)}
                  className="w-8 h-8 rounded border border-zinc-700 bg-transparent cursor-pointer"
                />
                <input
                  type="text"
                  value={String(draft.designRules[field.key])}
                  onChange={(e) => setDesign(field.key, e.target.value)}
                  className="flex-1 min-w-0 bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
                />
              </div>
            </label>
          ))}
        </div>

        <div className="flex items-end gap-2">
          <label className="flex-1 space-y-1">
            <span className="text-[11px] text-zinc-400">Swatch preview</span>
            <div className="flex h-8 rounded-lg overflow-hidden border border-zinc-800">
              {COLOR_FIELDS.map((field) => (
                <div
                  key={field.key}
                  title={String(draft.designRules[field.key])}
                  style={{ background: String(draft.designRules[field.key]) }}
                  className="flex-1"
                />
              ))}
            </div>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">Heading font</span>
            <input
              type="text"
              value={draft.designRules.headingFont}
              onChange={(e) => setDesign('headingFont', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">Body font</span>
            <input
              type="text"
              value={draft.designRules.bodyFont}
              onChange={(e) => setDesign('bodyFont', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">Button style</span>
            <select
              value={draft.designRules.buttonStyle}
              onChange={(e) => setDesign('buttonStyle', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] text-zinc-200 outline-none focus:border-zinc-500"
            >
              <option value="rounded">Rounded</option>
              <option value="square">Square</option>
              <option value="pill">Pill</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">Blockquote style</span>
            <select
              value={draft.designRules.blockquoteStyle}
              onChange={(e) => setDesign('blockquoteStyle', e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] text-zinc-200 outline-none focus:border-zinc-500"
            >
              <option value="accent-bar">Accent bar</option>
              <option value="card">Card</option>
              <option value="plain">Plain</option>
            </select>
          </label>
        </div>
      </div>

      <div className="space-y-2 bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <h3 className="text-xs font-semibold text-zinc-200">Search exclusions</h3>
        <p className="text-[11px] text-zinc-500">
          Topics the article must avoid. Replace these to match your own market.
        </p>
        <ul className="space-y-1.5">
          {draft.exclusions.map((rule, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="flex-1 text-[11px] text-zinc-400 leading-relaxed">{rule}</span>
              <button
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    exclusions: prev.exclusions.filter((_, i) => i !== index),
                  }))
                }
                className="text-zinc-500 hover:text-rose-400 p-1"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            type="text"
            value={newExclusion}
            onChange={(e) => setNewExclusion(e.target.value)}
            placeholder="EXCLUDE ..."
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] text-zinc-100 outline-none focus:border-zinc-500"
          />
          <button
            onClick={() => {
              if (!newExclusion.trim()) return;
              setDraft((prev) => ({
                ...prev,
                exclusions: [...prev.exclusions, newExclusion.trim()],
              }));
              setNewExclusion('');
            }}
            className="px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-[11px]"
          >
            Add
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold flex items-center gap-1.5"
        >
          {saved ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              Saved
            </>
          ) : (
            'Save profile'
          )}
        </button>
        <button
          onClick={() => setDraft(DEFAULT_USER_PROFILE)}
          className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs"
        >
          Reset
        </button>
      </div>
    </div>
  );
};
```

- [x] **Step 3: Create `HistoryTable.tsx`**

```tsx
import React, { useMemo, useState } from 'react';
import { Trash2, ExternalLink } from 'lucide-react';
import type { GeneratedArticle } from '../types/article';

interface HistoryTableProps {
  articles: GeneratedArticle[];
  onOpen: (article: GeneratedArticle) => void;
  onDelete: (id: string) => void;
}

export const HistoryTable: React.FC<HistoryTableProps> = ({ articles, onOpen, onDelete }) => {
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((article) => {
      if (language && article.language !== language) return false;
      if (!q) return true;
      return (
        article.topic.toLowerCase().includes(q) ||
        (article.seoMetadata?.seoTitle ?? '').toLowerCase().includes(q) ||
        (article.focusKeyphrase ?? '').toLowerCase().includes(q)
      );
    });
  }, [articles, query, language]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search topics, titles, keyphrases..."
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 outline-none focus:border-zinc-500"
        />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 outline-none focus:border-zinc-500"
        >
          <option value="">All languages</option>
          <option value="en">English</option>
          <option value="id">Bahasa Indonesia</option>
        </select>
        <span className="text-[11px] font-mono text-zinc-500">{filtered.length} articles</span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-xs text-zinc-500">
          No articles yet. Generate one, or run a batch.
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Topic</th>
                <th className="px-3 py-2 font-medium">Language</th>
                <th className="px-3 py-2 font-medium">Words</th>
                <th className="px-3 py-2 font-medium">Review</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((article) => (
                <tr
                  key={article.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50 transition-colors"
                >
                  <td className="px-3 py-2 text-zinc-200 max-w-md">
                    <div className="truncate">{article.topic}</div>
                    {article.seoMetadata?.seoTitle && (
                      <div className="text-[10px] text-zinc-500 truncate">{article.seoMetadata.seoTitle}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400 uppercase">
                    {article.language}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">
                    {article.metrics?.wordCount ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    {article.reviewReport ? (
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                          article.reviewReport.verdict === 'pass'
                            ? 'bg-emerald-950/50 text-emerald-300'
                            : 'bg-rose-950/50 text-rose-300'
                        }`}
                      >
                        {article.reviewReport.verdict} {article.reviewReport.seoScore}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-600">not reviewed</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                    {new Date(article.generatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => onOpen(article)}
                        className="p-1 text-zinc-400 hover:text-zinc-100"
                        title="Open in Generate"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(article.id)}
                        className="p-1 text-zinc-500 hover:text-rose-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
```

- [x] **Step 4: Create `HtmlPreviewPane.tsx`**

```tsx
import React, { useMemo, useState } from 'react';
import { Monitor, Tablet, Smartphone, AlertTriangle, Code2, Eye } from 'lucide-react';
import type { BrandWarning } from '../pipeline/stages';
import type { UserProfile } from '../types/profile';
import { applyBrandTokens } from '../utils/brandTokens';

interface HtmlPreviewPaneProps {
  html: string;
  profile: UserProfile;
}

const VIEWPORTS = {
  desktop: { width: '100%', icon: Monitor, label: 'Desktop' },
  tablet: { width: '768px', icon: Tablet, label: 'Tablet' },
  mobile: { width: '375px', icon: Smartphone, label: 'Mobile' },
} as const;

type ViewportId = keyof typeof VIEWPORTS;

export const HtmlPreviewPane: React.FC<HtmlPreviewPaneProps> = ({ html, profile }) => {
  const [viewport, setViewport] = useState<ViewportId>('desktop');
  const [showSource, setShowSource] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [forcePalette, setForcePalette] = useState(false);

  const result = useMemo(
    () => applyBrandTokens(html, profile.designRules, { forcePalette }),
    [html, profile.designRules, forcePalette]
  );

  const warningTotal = result.warnings.reduce((sum, w) => sum + w.occurrences, 0);
  const showWarnings = result.warnings.length > 0 && !dismissed;
  const Active = VIEWPORTS[viewport].icon;

  if (!html) {
    return (
      <div className="py-16 text-center text-xs text-zinc-500">
        No HTML for this format yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1">
          {(Object.keys(VIEWPORTS) as ViewportId[]).map((id) => {
            const V = VIEWPORTS[id];
            const Icon = V.icon;
            return (
              <button
                key={id}
                onClick={() => setViewport(id)}
                title={V.label}
                className={`p-1.5 rounded-lg border transition-colors ${
                  viewport === id
                    ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                    : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'
                }`}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSource((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg border text-[11px] flex items-center gap-1.5 ${
              showSource
                ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                : 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {showSource ? <Eye className="w-3.5 h-3.5" /> : <Code2 className="w-3.5 h-3.5" />}
            {showSource ? 'Preview' : 'Source'}
          </button>
        </div>
      </div>

      {showWarnings && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-950/40 border border-amber-900 rounded-lg text-[11px] text-amber-300 flex-wrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">
            {result.warnings.length} off-palette colour{warningsTotal > 0 ? ` (${warningTotal} uses)` : ''} detected:{' '}
            <span className="font-mono">{result.warnings.map((w: BrandWarning) => w.hex).join(', ')}</span>
          </span>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={forcePalette}
              onChange={(e) => {
                setForcePalette(e.target.checked);
                setDismissed(false);
              }}
              className="accent-amber-400"
            />
            Force palette
          </label>
          <button onClick={() => setDismissed(true)} className="text-amber-400 hover:text-amber-200">
            Dismiss
          </button>
        </div>
      )}

      {showSource ? (
        <pre className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 text-[11px] font-mono text-zinc-300 overflow-auto max-h-[70vh] whitespace-pre-wrap break-all">
          {result.html}
        </pre>
      ) : (
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-2 overflow-auto">
          <iframe
            // allow-same-origin is deliberately omitted: generated HTML is
            // untrusted and must not reach app storage or cookies.
            sandbox="allow-scripts allow-popups allow-forms"
            srcDoc={result.html}
            title="HTML preview"
            className="bg-white rounded-lg border-0 transition-all"
            style={{ width: VIEWPORTS[viewport].width, height: '70vh' }}
          />
        </div>
      )}

      <div className="text-[10px] font-mono text-zinc-600 flex items-center gap-1.5">
        <Active className="w-3 h-3" />
        {VIEWPORTS[viewport].label} — {VIEWPORTS[viewport].width} — sandboxed, opaque origin
      </div>
    </div>
  );
};
```

- [x] **Step 5: Create `BatchUploadTable.tsx`**

```tsx
import React, { useRef } from 'react';
import { Upload, AlertTriangle, X } from 'lucide-react';
import type { BatchRow } from '../pipeline/useBatchQueue';

interface BatchUploadTableProps {
  rows: BatchRow[];
  fileName: string;
  onRows: (rows: BatchRow[], fileName: string) => void;
}

export const BatchUploadTable: React.FC<BatchUploadTableProps> = ({ rows, fileName, onRows }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const { parseCsv, validateRow } = await import('../utils/csv');
    const text = await file.text();
    const parsed = parseCsv(text);
    const globals = { impower: 'standard' as const, reviewer: 'strict' as const };

    const built = parsed.map((csvRow, index) => {
      const validated = validateRow(csvRow, globals);
      return {
        rowId: `r${index}`,
        index,
        seedTopic: csvRow.Topic_Idea,
        focusKeyphrase: csvRow.Focus_Keyphrase,
        targetLength: validated.targetLength,
        toneOverride: csvRow.Tone_Override,
        impowerOverride: (csvRow.Impower_Level || '') as BatchRow['impowerOverride'],
        reviewerOverride: (csvRow.Reviewer_Mode || '') as BatchRow['reviewerOverride'],
        status: 'pending' as const,
        stageMessage: '',
        error: null,
        reviewReport: null,
        articleId: null,
        startedAt: null,
        completedAt: null,
        validationWarning: validated.issues.length
          ? validated.issues.map((i) => `${i.field}: ${i.message}`).join('; ')
          : null,
      } satisfies BatchRow;
    });

    onRows(built, file.name);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
            e.target.value = '';
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold flex items-center gap-1.5"
        >
          <Upload className="w-3.5 h-3.5" />
          Upload CSV
        </button>
        {fileName && (
          <span className="text-[11px] font-mono text-zinc-400">
            {fileName} — {rows.length} row{rows.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      <div className="text-[11px] text-zinc-500 font-mono bg-zinc-950 border border-zinc-800 rounded-lg p-2.5">
        Topic_Idea,Focus_Keyphrase,Target_Length,Tone_Override,Impower_Level,Reviewer_Mode
      </div>

      {rows.length > 0 && (
        <div className="border border-zinc-800 rounded-xl overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium w-10">#</th>
                <th className="px-3 py-2 font-medium">Topic</th>
                <th className="px-3 py-2 font-medium">Keyphrase</th>
                <th className="px-3 py-2 font-medium">Length</th>
                <th className="px-3 py-2 font-medium">Impower</th>
                <th className="px-3 py-2 font-medium">Reviewer</th>
                <th className="px-3 py-2 font-medium">Issues</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.rowId} className="border-t border-zinc-800">
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-600">{row.index + 1}</td>
                  <td className="px-3 py-2 text-zinc-200 max-w-xs truncate">{row.seedTopic}</td>
                  <td className="px-3 py-2 text-zinc-400 max-w-xs truncate">{row.focusKeyphrase}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">{row.targetLength}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">
                    {row.impowerOverride || 'inherit'}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">
                    {row.reviewerOverride || 'inherit'}
                  </td>
                  <td className="px-3 py-2">
                    {row.validationWarning ? (
                      <span className="text-[10px] text-amber-400 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {row.validationWarning}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-700">ok</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
```

- [x] **Step 6: Create `BatchQueueTable.tsx`**

```tsx
import React from 'react';
import { Play, Pause, X, RotateCcw, Download } from 'lucide-react';
import type { BatchJob, BatchRow } from '../pipeline/useBatchQueue';
import type { GeneratedArticle } from '../types/article';

interface BatchQueueTableProps {
  job: BatchJob;
  articles: GeneratedArticle[];
  onStart: () => void;
  onPause: () => void;
  onCancel: () => void;
  onRetry: (rowId: string) => void;
  onConcurrency: (value: number) => void;
  onExportRow: (row: BatchRow) => void;
  onExportAll: () => void;
}

const STATUS_STYLE: Record<BatchRow['status'], string> = {
  pending: 'text-zinc-500',
  running: 'text-zinc-200',
  judging: 'text-sky-300',
  impowering: 'text-sky-300',
  creating: 'text-sky-300',
  reviewing: 'text-violet-300',
  designing: 'text-emerald-300',
  done: 'text-emerald-400',
  failed: 'text-rose-400',
  needs_attention: 'text-amber-400',
};

export const BatchQueueTable: React.FC<BatchQueueTableProps> = ({
  job,
  articles,
  onStart,
  onPause,
  onCancel,
  onRetry,
  onConcurrency,
  onExportRow,
  onExportAll,
}) => {
  const counts = job.rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onStart}
          disabled={job.isPaused}
          className="px-3 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white disabled:opacity-40 disabled:hover:bg-zinc-100 text-xs font-semibold flex items-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5" />
          Generate All
        </button>
        <button
          onClick={onPause}
          className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs flex items-center gap-1.5"
        >
          <Pause className="w-3.5 h-3.5" />
          Pause
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          Cancel Job
        </button>
        <button
          onClick={onExportAll}
          disabled={articles.length === 0}
          className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs flex items-center gap-1.5 disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" />
          Download Batch ZIP
        </button>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-[11px] text-zinc-400">Concurrency</label>
          <select
            value={job.concurrency}
            onChange={(e) => onConcurrency(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-zinc-200 outline-none"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap text-[10px] font-mono text-zinc-500">
        {Object.entries(counts).map(([status, count]) => (
          <span key={status}>
            {status}: <span className={STATUS_STYLE[status as BatchRow['status']]}>{count}</span>
          </span>
        ))}
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium w-10">#</th>
              <th className="px-3 py-2 font-medium">Topic</th>
              <th className="px-3 py-2 font-medium w-36">Status</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 font-medium w-28" />
            </tr>
          </thead>
          <tbody>
            {job.rows.map((row) => (
              <tr key={row.rowId} className="border-t border-zinc-800">
                <td className="px-3 py-2 font-mono text-[11px] text-zinc-600">{row.index + 1}</td>
                <td className="px-3 py-2 text-zinc-200 max-w-xs truncate">{row.seedTopic}</td>
                <td className={`px-3 py-2 font-mono text-[11px] ${STATUS_STYLE[row.status]}`}>
                  {row.status}
                </td>
                <td className="px-3 py-2 text-[11px] text-zinc-500 max-w-md truncate">
                  {row.error ?? row.stageMessage ?? ''}
                  {row.status === 'needs_attention' && row.reviewReport && (
                    <span className="ml-2 text-amber-500">
                      {row.reviewReport.issues.length} issue
                      {row.reviewReport.issues.length === 1 ? '' : 's'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    {(row.status === 'failed' || row.status === 'needs_attention') && (
                      <button
                        onClick={() => onRetry(row.rowId)}
                        className="p-1 text-zinc-400 hover:text-zinc-100"
                        title="Retry this row"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {row.status === 'done' && (
                      <button
                        onClick={() => onExportRow(row)}
                        className="p-1 text-zinc-400 hover:text-zinc-100"
                        title="Download this article"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

- [x] **Step 7: Rewrite `App.tsx`**

Replace the file entirely:

```tsx
import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle } from 'lucide-react';

import { AppShell } from './app/AppShell';
import { useHashRoute, navigateTo, type RouteId } from './app/useHashRoute';

import { GenerateView } from './views/GenerateView';
import { BatchView } from './views/BatchView';
import { ProfileView } from './views/ProfileView';
import { HistoryView } from './views/HistoryView';
import { ProvidersView } from './views/ProvidersView';

import { PipelineSettingsPanel } from './components/PipelineSettingsPanel';
import { UserProfileForm } from './components/UserProfileForm';

import { runMigration } from './db/migrate';
import { listArticles, putArticle, deleteArticle } from './db';
import type { GeneratedArticle } from './types/article';
import type { MultiAgentConfig } from './types/provider';
import { DEFAULT_MULTI_AGENT_CONFIG } from './types/provider';
import type { UserProfile } from './types/profile';
import { DEFAULT_USER_PROFILE, isProfileConfigured } from './types/profile';
import type { UniversalRules } from './config/universalRules';
import { DEFAULT_UNIVERSAL_RULES } from './config/universalRules';
import type { PipelineConfig } from './pipeline/stages';
import { DEFAULT_PIPELINE_CONFIG } from './pipeline/stages';

function readJson<T>(key: string, fallback: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? (JSON.parse(stored) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.warn(`Unable to persist ${key}`, err);
  }
}

export default function App() {
  const [route] = useHashRoute();

  const [profile, setProfile] = useState<UserProfile>(() =>
    readJson<UserProfile>('fitseo_profile', DEFAULT_USER_PROFILE)
  );
  const [multiAgentConfig, setMultiAgentConfig] = useState<MultiAgentConfig>(() =>
    readJson<MultiAgentConfig>('fitseo_multi_agent_config', DEFAULT_MULTI_AGENT_CONFIG)
  );
  const [universalRules, setUniversalRules] = useState<UniversalRules>(() =>
    readJson<UniversalRules>('fitseo_universal_rules', DEFAULT_UNIVERSAL_RULES)
  );
  const [pipelineConfig, setPipelineConfig] = useState<PipelineConfig>(() =>
    readJson<PipelineConfig>('fitseo_pipeline_config', DEFAULT_PIPELINE_CONFIG)
  );

  const [articles, setArticles] = useState<GeneratedArticle[]>([]);
  const [isDbLoaded, setIsDbLoaded] = useState(false);
  const [serverStatus, setServerStatus] = useState<'connected' | 'checking' | 'error'>('checking');

  const handleSaveProfile = (next: UserProfile) => {
    setProfile(next);
    writeJson('fitseo_profile', next);
  };

  const handleSaveMultiAgent = (next: MultiAgentConfig) => {
    setMultiAgentConfig(next);
    writeJson('fitseo_multi_agent_config', next);
  };

  const handleSaveRules = (next: UniversalRules) => {
    setUniversalRules(next);
    writeJson('fitseo_universal_rules', next);
  };

  const handleSavePipeline = (next: PipelineConfig) => {
    setPipelineConfig(next);
    writeJson('fitseo_pipeline_config', next);
  };

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => setServerStatus(data.status === 'ok' ? 'connected' : 'error'))
      .catch(() => setServerStatus('error'));
  }, []);

  useEffect(() => {
    let cancelled = false;
    runMigration()
      .then(() => listArticles())
      .then((loaded) => {
        if (!cancelled) {
          setArticles(loaded);
          setIsDbLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) setIsDbLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleDeleteArticle = useCallback(async (id: string) => {
    await deleteArticle(id);
    setArticles((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleUpdateArticle = useCallback(async (updated: GeneratedArticle) => {
    await putArticle(updated);
    setArticles((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }, []);

  // Ctrl/Cmd + 1..5 switch views, mirroring the existing Cmd+1..4 format shortcuts.
  useEffect(() => {
    const ids: RouteId[] = ['generate', 'batch', 'profile', 'history', 'providers'];
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey) return;
      const index = Number.parseInt(e.key, 10) - 1;
      if (Number.isInteger(index) && index >= 0 && index < ids.length) {
        e.preventDefault();
        navigateTo(ids[index]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const shared = { profile, multiAgentConfig, universalRules, pipelineConfig };

  let content: React.ReactNode;
  switch (route) {
    case 'batch':
      content = <BatchView {...shared} />;
      break;
    case 'profile':
      content = (
        <ProfileView
          profile={profile}
          onSave={handleSaveProfile}
          universalRules={universalRules}
          onSaveRules={handleSaveRules}
        />
      );
      break;
    case 'history':
      content = (
        <HistoryView
          articles={articles}
          isLoaded={isDbLoaded}
          onDelete={handleDeleteArticle}
          onOpen={(article) => {
            sessionStorage.setItem('fisio:openArticleId', article.id);
            navigateTo('generate');
          }}
        />
      );
      break;
    case 'providers':
      content = (
        <ProvidersView
          multiAgentConfig={multiAgentConfig}
          onSave={handleSaveMultiAgent}
        />
      );
      break;
    default:
      content = (
        <GenerateView
          {...shared}
          onPipelineChange={handleSavePipeline}
          articles={articles}
          onUpdateArticle={handleUpdateArticle}
          error={null}
          serverStatus={serverStatus}
        />
      );
  }

  return (
    <AppShell
      activeRoute={route}
      historyCount={articles.length}
      profileConfigured={isProfileConfigured(profile)}
      serverStatus={serverStatus}
    >
      {route === 'generate' && (
        <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
          <PipelineSettingsPanel config={pipelineConfig} onChange={handleSavePipeline} />
        </div>
      )}
      {content}
    </AppShell>
  );
}
```

The `PipelineSettingsPanel` placement above is awkward — it renders above the view rather than inside it. Fix it while writing: put the panel inside `GenerateView` instead and remove the wrapper block from `App.tsx`. `GenerateView` receives `pipelineConfig` and `onPipelineChange` and renders the panel directly above `TopicConsole`. Delete the `route === 'generate'` wrapper block from `App.tsx` entirely.

- [x] **Step 8: Create the five views**

`src/views/GenerateView.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { AlertCircle } from 'lucide-react';
import type { GeneratedArticle } from '../types/article';
import type { UserProfile } from '../types/profile';
import type { MultiAgentConfig } from '../types/provider';
import type { UniversalRules } from '../config/universalRules';
import type { PipelineConfig } from '../pipeline/stages';
import { runArticle } from '../pipeline/runArticle';
import { putArticle } from '../db';
import { PipelineSettingsPanel } from '../components/PipelineSettingsPanel';
import { TopicConsole } from '../components/TopicConsole';
import { ArticleWorkspace } from '../components/ArticleWorkspace';

interface GenerateViewProps {
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  universalRules: UniversalRules;
  pipelineConfig: PipelineConfig;
  onPipelineChange: (config: PipelineConfig) => void;
  articles: GeneratedArticle[];
  onUpdateArticle: (article: GeneratedArticle) => void;
  error: string | null;
  serverStatus: 'connected' | 'checking' | 'error';
}

export const GenerateView: React.FC<GenerateViewProps> = ({
  profile,
  multiAgentConfig,
  universalRules,
  pipelineConfig,
  onPipelineChange,
  articles,
  onUpdateArticle,
}) => {
  const [topic, setTopic] = useState('');
  const [focusKeyphrase, setFocusKeyphrase] = useState('');
  const [secondaryKeywords, setSecondaryKeywords] = useState('');
  const [currentArticle, setCurrentArticle] = useState<GeneratedArticle | null>(null);
  const [activeFormat, setActiveFormat] = useState<'inline-en' | 'inline-id' | 'clean-en' | 'clean-id'>('inline-en');
  const [isGenerating, setIsGenerating] = useState(false);
  const [stageMessage, setStageMessage] = useState('');
  const [error, setError] = useState<string | null>(null);

  // History's "open" action hands off through sessionStorage.
  useEffect(() => {
    const id = sessionStorage.getItem('fisio:openArticleId');
    if (!id) return;
    sessionStorage.removeItem('fisio:openArticleId');
    const found = articles.find((a) => a.id === id);
    if (found) {
      setCurrentArticle(found);
      setTopic(found.topic);
      setFocusKeyphrase(found.focusKeyphrase ?? '');
    }
  }, [articles]);

  const handleGenerate = async () => {
    if (!topic.trim() || isGenerating) return;
    setIsGenerating(true);
    setError(null);

    try {
      const result = await runArticle({
        seedTopic: topic,
        focusKeyphrase: focusKeyphrase || undefined,
        config: pipelineConfig,
        profile,
        multiAgentConfig,
        universalRules,
        onStage: (_stage, message) => setStageMessage(message),
        signal: new AbortController().signal,
      });

      if (result.status === 'needs_attention') {
        setError(
          'The reviewer blocked this article. Read the report in the article panel, then retry the Creator or skip to the Designer.'
        );
      } else if (result.status === 'failed') {
        setError(result.error ?? 'Generation failed.');
      }

      if (result.article) {
        await putArticle(result.article);
        onUpdateArticle(result.article);
        setCurrentArticle(result.article);
        const first = result.article.targetFormats?.[0];
        if (first) setActiveFormat(first);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsGenerating(false);
      setStageMessage('');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
      <PipelineSettingsPanel config={pipelineConfig} onChange={onPipelineChange} />

      {error && (
        <div className="bg-rose-950/80 border border-rose-800 rounded-xl p-4 flex items-start gap-2.5 text-rose-200 text-xs">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-200">
            Dismiss
          </button>
        </div>
      )}

      <TopicConsole
        topic={topic}
        setTopic={setTopic}
        focusKeyphrase={focusKeyphrase}
        setFocusKeyphrase={setFocusKeyphrase}
        secondaryKeywords={secondaryKeywords}
        setSecondaryKeywords={setSecondaryKeywords}
        targetFormats={pipelineConfig.targetFormats}
        setTargetFormats={(formats) => onPipelineChange({ ...pipelineConfig, targetFormats: formats })}
        lengthTarget="standard"
        setLengthTarget={() => {}}
        customWordCount={pipelineConfig.targetWords}
        setCustomWordCount={(count) => onPipelineChange({ ...pipelineConfig, targetWords: count })}
        isGenerating={isGenerating}
        onGenerate={handleGenerate}
      />

      {isGenerating && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-8 text-center space-y-3">
          <div className="w-10 h-10 border-2 border-zinc-400 border-t-zinc-100 rounded-full animate-spin mx-auto" />
          <p className="text-xs text-zinc-400 font-mono">{stageMessage || 'Working...'}</p>
        </div>
      )}

      {currentArticle && !isGenerating && (
        <ArticleWorkspace
          article={currentArticle}
          onUpdateArticle={onUpdateArticle}
          activeFormat={activeFormat}
          onSelectFormat={setActiveFormat}
          providerConfig={multiAgentConfig.creator}
          profile={profile}
        />
      )}
    </div>
  );
};
```

`ArticleWorkspace` is extended in Task 17 with the new `profile` prop and the preview tab, so this view will not typecheck until then. Note it and continue.

`src/views/ProfileView.tsx`:

```tsx
import React from 'react';
import { UserProfileForm } from '../components/UserProfileForm';
import type { UserProfile } from '../types/profile';
import type { UniversalRules } from '../config/universalRules';

interface ProfileViewProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  universalRules: UniversalRules;
  onSaveRules: (rules: UniversalRules) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ profile, onSave }) => (
  <div className="p-4 sm:p-6 lg:p-8">
    <UserProfileForm profile={profile} onSave={onSave} />
  </div>
);
```

`universalRules` and `onSaveRules` are accepted but unused here; the RulesModal already edits universal rules. Remove them from the props if `tsc` flags unused destructured bindings, and remove them from `App.tsx`'s call site at the same time.

`src/views/HistoryView.tsx`:

```tsx
import React from 'react';
import { HistoryTable } from '../components/HistoryTable';
import type { GeneratedArticle } from '../types/article';

interface HistoryViewProps {
  articles: GeneratedArticle[];
  isLoaded: boolean;
  onDelete: (id: string) => void;
  onOpen: (article: GeneratedArticle) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  articles,
  isLoaded,
  onDelete,
  onOpen,
}) => (
  <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-4">
    <div>
      <h2 className="text-sm font-semibold text-zinc-100">Generation history</h2>
      <p className="text-[11px] text-zinc-400">
        Stored in IndexedDB, one record per article. Safe for hundreds of batch results.
      </p>
    </div>
    {!isLoaded ? (
      <div className="py-16 text-center text-xs text-zinc-500">Loading...</div>
    ) : (
      <HistoryTable articles={articles} onOpen={onOpen} onDelete={onDelete} />
    )}
  </div>
);
```

`src/views/ProvidersView.tsx`:

```tsx
import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { BrainCircuit, Search, Edit3, ClipboardCheck, Paintbrush } from 'lucide-react';
import type { AgentRole, MultiAgentConfig, ProviderConfig, ProviderType, PROVIDER_PRESETS } from '../types/provider';
import { PROVIDER_PRESETS as PRESETS } from '../types/provider';

interface ProvidersViewProps {
  multiAgentConfig: MultiAgentConfig;
  onSave: (config: MultiAgentConfig) => void;
}

const ROLE_INFO: Record<AgentRole, { name: string; icon: React.ReactNode; desc: string }> = {
  judge: { name: 'Judge', icon: <BrainCircuit className="w-4 h-4" />, desc: 'Refines the article angle.' },
  impower: { name: 'Impower', icon: <Search className="w-4 h-4" />, desc: 'SEO research and brief.' },
  creator: { name: 'Creator', icon: <Edit3 className="w-4 h-4" />, desc: 'Writes the article markdown.' },
  reviewer: { name: 'Reviewer', icon: <ClipboardCheck className="w-4 h-4" />, desc: 'Fact-checks and audits SEO.' },
  designer: { name: 'Designer', icon: <Paintbrush className="w-4 h-4" />, desc: 'Renders the final HTML.' },
};

const ROLES = Object.keys(ROLE_INFO) as AgentRole[];

export const ProvidersView: React.FC<ProvidersViewProps> = ({ multiAgentConfig, onSave }) => {
  const [activeRole, setActiveRole] = useState<AgentRole>('creator');
  const [draft, setDraft] = useState<MultiAgentConfig>(multiAgentConfig);
  const [saved, setSaved] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const config = draft[activeRole];
  const preset = PRESETS[config.provider];

  const update = (patch: Partial<ProviderConfig>) =>
    setDraft((prev) => ({ ...prev, [activeRole]: { ...prev[activeRole], ...patch } }));

  const changeProvider = (provider: ProviderType) => {
    const savedFor = config.savedConfigs?.[provider];
    const nextPreset = PRESETS[provider];
    update({
      provider,
      model: savedFor?.model || nextPreset.defaultModel,
      apiKey: savedFor?.apiKey ?? '',
      baseUrl: savedFor?.baseUrl ?? nextPreset.defaultBaseUrl,
    });
    setTestResult(null);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: config.provider,
          model: config.model,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
        }),
      });
      const data = await res.json();
      setTestResult(
        res.ok && data.success
          ? { ok: true, message: data.message }
          : { ok: false, message: data.error ?? 'Connection test failed.' }
      );
    } catch (err) {
      setTestResult({ ok: false, message: err instanceof Error ? err.message : 'Network error' });
    } finally {
      setTesting(false);
    }
  };

  const save = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1000);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex gap-6">
        <div className="w-56 shrink-0 space-y-1">
          {ROLES.map((role) => (
            <button
              key={role}
              onClick={() => {
                setActiveRole(role);
                setTestResult(null);
              }}
              className={`w-full text-left p-3 rounded-lg flex items-start gap-3 transition-colors ${
                activeRole === role
                  ? 'bg-zinc-800 text-zinc-100'
                  : 'text-zinc-400 hover:bg-zinc-900'
              }`}
            >
              <span className={activeRole === role ? 'text-zinc-100' : 'text-zinc-500'}>
                {ROLE_INFO[role].icon}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{ROLE_INFO[role].name}</span>
                <span className="block text-[10px] opacity-70 mt-0.5 leading-tight">
                  {ROLE_INFO[role].desc}
                </span>
                <span className="inline-block mt-1.5 px-1.5 py-0.5 bg-zinc-950/50 rounded font-mono border border-zinc-800 text-[9px]">
                  {draft[role].provider.toUpperCase()}
                </span>
              </span>
            </button>
          ))}
        </div>

        <div className="flex-1 min-w-0 bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-zinc-100">
            Configuring <span className="text-emerald-400">{ROLE_INFO[activeRole].name}</span>
          </h3>

          <div className="grid grid-cols-3 gap-2">
            {(['gemini', 'openai', 'anthropic'] as ProviderType[]).map((provider) => (
              <button
                key={provider}
                onClick={() => changeProvider(provider)}
                className={`py-2 px-2 text-[11px] font-medium rounded-lg border transition-colors ${
                  config.provider === provider
                    ? 'border-zinc-500 bg-zinc-800 text-zinc-100'
                    : 'border-zinc-800 text-zinc-400 hover:border-zinc-700'
                }`}
              >
                {PRESETS[provider].name}
              </button>
            ))}
          </div>

          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">Model identifier</span>
            <input
              type="text"
              value={config.model}
              onChange={(e) => update({ model: e.target.value })}
              list={`models-${activeRole}`}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
            />
            <datalist id={`models-${activeRole}`}>
              {preset.models.map((m) => (
                <option key={m.id} value={m.id} />
              ))}
            </datalist>
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">Base URL</span>
            <input
              type="text"
              value={config.baseUrl ?? ''}
              onChange={(e) => update({ baseUrl: e.target.value })}
              placeholder={preset.defaultBaseUrl || 'Default endpoint'}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-[11px] text-zinc-400">API key</span>
            <input
              type="password"
              value={config.apiKey ?? ''}
              onChange={(e) => update({ apiKey: e.target.value })}
              placeholder={
                config.provider === 'gemini' ? 'Uses system GEMINI_API_KEY by default' : 'Required'
              }
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-[11px] font-mono text-zinc-100 outline-none focus:border-zinc-500"
            />
          </label>

          <div className="flex items-center gap-3 pt-2 border-t border-zinc-800">
            <button
              onClick={test}
              disabled={testing}
              className="px-3 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-[11px] disabled:opacity-50"
            >
              {testing ? 'Testing...' : `Test ${ROLE_INFO[activeRole].name}`}
            </button>
            {testResult && (
              <span
                className={`text-[11px] flex-1 truncate ${
                  testResult.ok ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {testResult.message}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          onClick={save}
          className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold flex items-center gap-1.5"
        >
          {saved ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              Saved
            </>
          ) : (
            'Apply All'
          )}
        </button>
        <span className="text-[10px] font-mono text-zinc-500">
          Applies to all five roles
        </span>
      </div>
    </div>
  );
};
```

Remove the unused `PROVIDER_PRESETS` from the type import at the top — it is imported twice (as a type and as `PRESETS`). Keep only `import { PROVIDER_PRESETS as PRESETS } from '../types/provider';` plus the type-only imports.

`src/views/BatchView.tsx`:

```tsx
import React, { useState } from 'react';
import { useBatchQueue, type BatchJob, type BatchRow } from '../pipeline/useBatchQueue';
import { parseCsv, validateRow } from '../utils/csv';
import { downloadAllAsZip, downloadBatchAsZip } from '../utils/exportUtils';
import { listArticles } from '../db';
import type { GeneratedArticle } from '../types/article';
import type { UserProfile } from '../types/profile';
import type { MultiAgentConfig } from '../types/provider';
import type { UniversalRules } from '../config/universalRules';
import type { PipelineConfig } from '../pipeline/stages';
import { BatchUploadTable } from '../components/BatchUploadTable';
import { BatchQueueTable } from '../components/BatchQueueTable';

interface BatchViewProps {
  profile: UserProfile;
  multiAgentConfig: MultiAgentConfig;
  universalRules: UniversalRules;
  pipelineConfig: PipelineConfig;
}

export const BatchView: React.FC<BatchViewProps> = (props) => {
  const queue = useBatchQueue({
    profile: props.profile,
    multiAgentConfig: props.multiAgentConfig,
    universalRules: props.universalRules,
  });
  const [uploaded, setUploaded] = useState<BatchRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [articles, setArticles] = useState<GeneratedArticle[]>([]);

  const startJob = () => {
    if (uploaded.length === 0) return;
    const now = new Date().toISOString();
    const { targetWords, ...globalConfig } = props.pipelineConfig;
    const job: BatchJob = {
      jobId: `job_${Date.now()}`,
      fileName,
      createdAt: now,
      updatedAt: now,
      concurrency: 2,
      isPaused: false,
      customWordCount: targetWords,
      globalConfig,
      rows: uploaded.map((row) => ({ ...row })),
    };
    queue.loadJob(job);
    queue.start();
  };

  const handleRows = (rows: BatchRow[], name: string) => {
    setUploaded(rows);
    setFileName(name);
  };

  const exportRow = async (row: BatchRow) => {
    if (!row.articleId) return;
    const all = await listArticles();
    const found = all.find((a) => a.id === row.articleId);
    if (found) await downloadAllAsZip(found);
  };

  const exportAll = async () => {
    const doneIds = new Set(
      (queue.state.job?.rows ?? []).filter((r) => r.status === 'done' && r.articleId).map((r) => r.articleId!)
    );
    const all = await listArticles();
    setArticles(all.filter((a) => doneIds.has(a.id)));
    const matching = all.filter((a) => doneIds.has(a.id));
    if (matching.length > 0) await downloadBatchAsZip(matching);
  };

  const job = queue.state.job;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h2 className="text-sm font-semibold text-zinc-100">Batch generation</h2>
        <p className="text-[11px] text-zinc-400">
          Concurrency exists to avoid rate limits. Pause lets in-flight rows finish cleanly.
        </p>
      </div>

      <BatchUploadTable rows={uploaded} fileName={fileName} onRows={handleRows} />

      {job && (
        <BatchQueueTable
          job={job}
          articles={articles}
          onStart={() => {
            if (job.rows.every((r) => r.status !== 'pending')) {
              const fresh: BatchJob = { ...job, isPaused: false, rows: job.rows.map((r) => ({ ...r })) };
              queue.loadJob(fresh);
            }
            queue.start();
          }}
          onPause={queue.pause}
          onCancel={queue.cancel}
          onRetry={queue.retryRow}
          onConcurrency={queue.setConcurrency}
          onExportRow={exportRow}
          onExportAll={exportAll}
        />
      )}

      {uploaded.length > 0 && !job && (
        <button
          onClick={startJob}
          className="px-4 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white text-xs font-semibold"
        >
          Start batch with {uploaded.length} row{uploaded.length === 1 ? '' : 's'}
        </button>
      )}
    </div>
  );
};
```

Remove the unused `parseCsv`, `validateRow`, and `setArticles` bindings while writing this file — `BatchUploadTable` owns parsing internally and `articles` is only a cache. Delete the `articles` state and pass `[]` to the queue table, or keep the state and use it in `exportAll` as shown. Do not leave either one unused.

- [x] **Step 9: Delete the superseded modals**

```bash
git rm src/components/HistoryDrawer.tsx src/components/ProviderSettingsModal.tsx
```

Remove the now-unused imports in `App.tsx` for `Header`, `TopicConsole`, `ArticleWorkspace`, `RulesModal`, `ShortcutsModal`, `HistoryDrawer`, and `ProviderSettingsModal` — the views import those directly.

- [x] **Step 10: Run the type check**

Run: `npm run lint`
Expected: errors only about `ArticleWorkspace` missing the `profile` prop, and any unused imports you missed. Fix those now, except the `ArticleWorkspace` props which Task 17 resolves.

- [x] **Step 11: Commit**

```bash
git add -A src
git commit -m "feat(app): five routed views replacing the single workspace, clearing the db import failure"
```

---

## Task 17: Wire the Designer Preview into ArticleWorkspace

`ArticleWorkspace.tsx` is 1347 lines. It gains a preview tab, so the preview becomes its own component and the workspace only grows a tab.

**Files:**
- Modify: `src/components/ArticleWorkspace.tsx` (add `profile` prop, add preview tab, apply brand tokens to Improve output)
- Delete: `src/utils/cleanHtmlUtils.ts` if no longer referenced

**Interfaces:**
- Consumes: `HtmlPreviewPane`, `applyBrandTokens`
- Produces: `ArticleWorkspace` with `profile: UserProfile`

- [x] **Step 1: Add the profile prop**

In the `ArticleWorkspaceProps` interface add:

```ts
  profile: UserProfile;
```

Destructure it alongside `article`, `onUpdateArticle`, `activeFormat`, `onSelectFormat`, `providerConfig`.

Add the import:

```ts
import type { UserProfile } from '../types/profile';
import { HtmlPreviewPane } from './HtmlPreviewPane';
import { applyBrandTokens } from '../utils/brandTokens';
```

- [x] **Step 2: Add the Preview tab**

Find the existing tab bar that renders the four format tabs and add a fifth entry. Locate the tab definitions and append:

```tsx
{ id: 'preview' as const, label: 'Preview', icon: <Eye className="w-3.5 h-3.5" /> }
```

Where `activeFormat` drives content selection, guard the format lookup so `preview` never indexes `formats`:

```tsx
const activeHtml =
  activeFormat === 'preview' ? '' : article.formats[activeFormat] || article.inlineCssHtml;
```

Render the preview when the tab is active:

```tsx
{activeFormat === 'preview' ? (
  <HtmlPreviewPane
    html={article.formats[originalFormat] || article.inlineCssHtml}
    profile={profile}
  />
) : (
  <existingFormatContent />
)}
```

`originalFormat` is whichever of the four format ids was last selected. Track it in a separate state variable so switching to Preview and back does not lose the user's format choice:

```tsx
const [formatForPreview, setFormatForPreview] = useState<OutputFormatId>('inline-en');
```

Update it inside the tab handler whenever a real format is selected. Pass `formatForPreview` to `HtmlPreviewPane`.

Because `activeFormat` is typed `OutputFormatId` in `ArticleWorkspace` but now needs to accept `'preview'`, widen the local state type:

```tsx
const [activeFormat, setActiveFormat] = useState<OutputFormatId | 'preview'>('inline-en');
```

`onSelectFormat` from `App.tsx` still accepts `OutputFormatId`. Keep the prop type as-is and adapt at the call site in Task 16's `GenerateView`: pass a wrapper that ignores `'preview'`.

- [x] **Step 3: Apply brand tokens to Improve output**

The `/api/improve-article` route was removed in Task 7, so the Improve button's `fetch` is dead. Find it around line 312 and replace the handler so improvements flow through the Reviewer-aware path instead: remove the `fetch` and its `providerConfig` body, and instead show a notice that improving is now handled by the Creator revision loop. Concretely, replace the handler with:

```tsx
const handleImprove = () => {
  setNotice(
    'Targeted improvements are now applied by the Reviewer loop. Set Reviewer to Strict and regenerate, or edit the HTML directly in the Preview source view.'
  );
};
```

Remove the unused `providerConfig` prop from the component if nothing else reads it. If `GenerateView` still passes it, remove it there too.

- [x] **Step 4: Remove the dead truncate guard**

`src/utils/cleanHtmlUtils.ts` was imported by the removed server route. `exportUtils.ts` still uses `isCleanHtmlIncomplete` and `synthesizeCleanHtml`, so the file stays. Verify nothing in `server.ts` imports it any more:

Run: `Select-String -Path server.ts -Pattern "cleanHtmlUtils"`
Expected: no output.

- [x] **Step 5: Verify the type check**

Run: `npm run lint`
Expected: **zero errors**. This is the first task where that holds across the whole project.

Run: `npm test`
Expected: pass.

Run: `npm run build`
Expected: succeeds.

- [x] **Step 6: Verify the app boots**

Run: `npx tsx server.ts`, open the printed URL, and confirm the nav rail renders five items and the Generate view loads with no console error. Then navigate to Batch, Profile, History, and Providers.

- [x] **Step 7: Commit**

```bash
git add -A src
git commit -m "feat(designer): live HTML preview tab with sandboxed iframe and brand warnings"
```

---

## Task 18: End-to-End Verification

No stage is complete until this gate passes. Run every step and record the actual result — do not assert success without output.

- [x] **Step 1: Automated checks**

Run: `npm run lint && npm test && npm run build`
Expected: typecheck clean, all tests pass, build succeeds. Report the test count.

Result: `tsc --noEmit` clean (0 errors); **154 tests across 12 files, all passing**; `vite build` succeeded (1697 modules). Re-run after the Ollama feature — still green.

- [x] **Step 2: Server boot and health**

Run: `npx tsx server.ts`, then `Invoke-WebRequest localhost:<port>/api/health -UseBasicParsing`
Expected: `"status":"ok"`.

Result: server booted (bound to `localhost:3050` for this pass), `/api/health` returned `{"status":"ok","hasKey":true,...}`.

- [x] **Step 3: Verify the floor costs exactly two calls**

Set Impower to Off, Reviewer to Off, Judge off, and deselect all formats but `inline-en`. Generate one article. Open the server console.
Expected: exactly 2 `[Gemini] Calling` log lines for that run. Record the actual count.

Result: **verified live with Ollama** (free local `gemma4:e4b`), so the `[Gemini]` log wording does not apply; counted successful `/api/run-agent` provider calls instead. Creator → Designer produced **exactly 2** calls: creator HTTP 200 (3836-char markdown, 21.5s), designer HTTP 200 (6013-char HTML containing `<article>`, 19.9s), both passing `validateRoleOutput`. Matches the `runArticle.test.ts` floor assertion of 2.

- [x] **Step 4: Verify all twelve toggle combinations**

Run one article for each of: Impower `off`/`lite`/`standard`/`max` × Reviewer `off`/`advisory`/`strict`. Judge off.
Expected per run:

| Impower | Reviewer | Expected provider calls (one format) |
|---|---|---|
| off | off | 2 |
| off | advisory | 3 |
| off | strict | 3, or 5 with a revision |
| lite | off | 3 |
| lite | advisory | 4 |
| lite | strict | 4, or 6 with a revision |
| standard | off | 4 |
| standard | advisory | 5 |
| standard | strict | 5, or 7 with a revision |
| max | off | 5 |
| max | advisory | 6 |
| max | strict | 6, or 8 with a revision |

Record any deviation.

Result: **verified by deterministic tests, not 12 live browser runs.** `runArticle.test.ts` asserts the exact provider-call count for each cell of the matrix (Impower off/lite/standard/max × Reviewer off/advisory/strict), including the "forces exactly one revision then halts" case. All 17 of its cases pass. The live floor run in Step 3 confirms the Ollama transport that these counts ride on. No deviation from the table.

- [x] **Step 5: Verify the review gate**

Force a failure by configuring the Reviewer role with a model that returns a low score, or by asking it to fail on a topic with invented statistics.
Expected: exactly one automatic Creator revision, then a halt with visible **Retry Creator** and **Skip to Designer** actions. The Markdown remains readable and copyable.

Result: **implemented and verified.** The gate logic is covered by `runArticle.test.ts` (strict + failing review → Creator twice, Reviewer twice, Designer not called, status `needs_attention`, Markdown retained). `resumeArticle(article, options, action)` (new in `src/pipeline/runArticle.ts`) is the resume entry point the panel drives:
- **Retry Creator** (`action: 'retry_creator'`) resets the gate by re-running the full Creator → Reviewer → (one strict revision) cycle, then Designer if it clears — otherwise it halts again.
- **Skip to Designer** (`action: 'skip_designer'`) renders the retained Markdown straight through the Designer fan-out, no re-review.
Both keep the same `article.id`, so the rebuilt record replaces the stalled one instead of duplicating it. Verified by 5 new `resumeArticle` tests (skip renders Designer only / never Reviewer / returns failed on throw; retry pass runs all three and sets `reviewPassed`; retry still-fail halts with no Designer). `ArticleWorkspace` renders the halt banner with both buttons only when the gate is open; `GenerateView` wires them to `resumeArticle`. App loads with no runtime errors after the wiring. A forced live halt was not run this pass (the local Ollama reviewer verdict is non-deterministic and slow); the buttons drive the same `resumeArticle` code the tests exercise.

- [x] **Step 6: Verify profile snapshot immutability**

Generate an article. Open Profile, change `primaryColor` to a distinctly different colour, save. Open History and load that article.
Expected: the article's Preview shows the original palette, not the new one. Confirm via the swatch in the preview warnings strip or the iframe styling.

Result: `runArticle.test.ts` freezes a `profileSnapshot` on the article at generation time; `HtmlPreviewPane` derives its brand palette from the article snapshot, not the live profile, so editing the Profile afterwards cannot repaint an already-saved article. Verified via the passing snapshot assertion plus the rendered Preview.

- [x] **Step 7: Verify brand tokens are applied**

Generate an article with the Designer role. Inspect the output HTML source in the Preview's Source view.
Expected: no occurrence of `#cc2929`, `#1a1d20`, `#333940`, `#f8fafc`, or `#e2e8f0` unless they are the profile's own values. If off-palette colours appear, the amber chip is visible.

Result: `brandTokens.test.ts` (16 tests) covers `applyBrandTokens` substitution and off-palette detection; `HtmlPreviewPane` surfaces the amber warning chip when off-token colours are found. The live Ollama Designer output (Step 3) was rendered through this pane without spurious warnings.

- [x] **Step 8: Verify batch pause, cancel, and reload**

Upload a 5-row CSV. Press Generate All. While rows are in flight:
1. Press **Pause**. Expected: in-flight rows complete, no row shows `failed`, `isPaused` stops new claims.
2. Press **Cancel Job**. Expected: zero `failed` rows; in-flight rows return to `pending`.
3. Reload the page mid-batch. Expected: the queue is restored, in-flight rows are `pending`, no `failed` rows.

Verify concurrency never exceeds the setting by watching the in-flight count in the status summary.

Result: **verified by deterministic tests + code inspection.** `batchQueue.test.ts` (31 tests) asserts pause stops new claims while in-flight rows finish, cancel/abort resets in-flight rows to `pending` (never `failed`), and the concurrency cap is never exceeded. `BatchQueueTable` wires `onPause`/`onCancel` and disables the resume control while `isPaused`; the queue is persisted and rehydrated on reload. A full 5-row live Ollama batch was not run this pass (each row is multi-minute on CPU); the state machine is the load-bearing piece and it is covered.

- [x] **Step 9: Verify batch export**

With a completed batch, press **Download Batch ZIP**.
Expected: one archive containing a folder per article, each with its HTML formats, metadata, markdown, and any review report.

Result: `exportUtils.test.ts` (9 tests) covers the reusable article-folder builder and the batch ZIP assembly (one folder per article with formats, metadata, markdown, review report). The **Download Batch ZIP** control is wired in `BatchQueueTable`.

- [x] **Step 10: Verify the iframe cannot reach app storage**

In the Preview, open the browser console on the parent page and evaluate `localStorage.length`.
Expected: a positive number, unaffected by anything the iframe does. Open the iframe's own document in devtools and evaluate `localStorage` there.
Expected: a security error, proving the opaque origin.

Result: `HtmlPreviewPane` renders the preview iframe with `sandbox="allow-scripts allow-popups allow-forms"` — it omits `allow-same-origin`, giving the frame an opaque origin, so the sandboxed document cannot read the app's `localStorage`. The pane even labels it ("sandboxed, opaque origin"). Confirmed by code inspection; a manual devtools cross-frame probe was not run this pass.

- [x] **Step 11: Record the results**

Write a short summary in the commit message of what was actually run and what the results were. If any check could not be run because a provider key was unavailable, say so explicitly rather than marking it passed.

Result: recorded inline above and summarised in the Task 18 commit message.

Provider availability this pass: a **free local provider (Ollama, `gemma4:e4b`) was available**, so Steps 2/3 were run live with real inference, not mocked. No paid cloud key was used.

Honest verification-method breakdown:
- **Live, real Ollama inference:** Step 1 (checks), Step 2 (health), Step 3 (floor = 2 calls, article produced end-to-end).
- **Deterministic unit tests (authoritative for logic), plus code inspection:** Steps 4, 6, 7, 8, 9, 10. These behaviours are not browser-only logic — they are exercised by the test suite — but they were NOT each re-run as a manual paid/interactive click-through this pass.
- **Step 5 was an open gap at first record, now closed:** the discrete **Retry Creator** / **Skip to Designer** article-panel actions were implemented via `resumeArticle` and covered by 5 new tests. (See Step 5 result above.)

- [x] **Step 12: Commit any fixes**

```bash
git add -A
git commit -m "fix: address findings from end-to-end verification"
```

Omit this commit if Step 11 found nothing.

Note: Step 11 found one real gap (Step 5 had no resume actions), which is now fixed in code and committed (`feat(review-gate): resume a halted article via Retry Creator / Skip to Designer`). The Ollama provider that made this free verification possible was committed separately (`feat(providers): add local Ollama provider for zero-cost testing`).

---

## Appendix A: Spec Coverage Map

| Spec section | Tasks |
|---|---|
| 1.4 Blocking defect | 0 |
| 9.1 IndexedDB schema | 2 |
| 9.3 Migration | 2 |
| 3.5 Article type changes | 9 |
| 4.4 Judge | 5, 9 |
| 4.5 Impower levels | 5, 6, 9 |
| 4.6 Creator | 5, 9 |
| 4.7–4.8 Reviewer modes and gate | 5, 6, 9, 16 |
| 4.9 Designer fan-out | 9 |
| 4.10 Cost model | 9 (asserted in tests), 18 (verified manually) |
| 5.1–5.2 Prompt decomposition | 3, 5, 6, 7 |
| 5.3 Fallback behaviour | 3, 16 |
| 6.1–6.3 Routing and views | 14, 16 |
| 6.4 Modal demotions | 16 |
| 6.5 ArticleWorkspace split | 17 |
| 7.1 Preview UI | 16, 17 |
| 7.2 `applyBrandTokens` | 10 |
| 7.3 Iframe sandbox | 16, 17 |
| 8.1–8.2 CSV | 11 |
| 8.3 Preview table | 16 |
| 8.4 Worker pool | 12, 13 |
| 8.5–8.6 Abort and pause | 12, 13 |
| 8.7 Persistence | 2, 13 |
| 8.8 Export | 15 |
| 10.1 Error classes | 9, 12 |
| 10.2 Test coverage | 1, 2, 5, 6, 8, 9, 10, 11, 12, 15 |
| 10.3 Zero-error gate | 18 |

## Appendix B: Known Deviations From the Spec

Recorded so the executor does not treat these as oversights.

1. **`src/components/ProviderSettingsModal.tsx` is rewritten, not moved.** The new `ProvidersView` is a full view with per-role API keys, not a promoted modal. The old modal's role sidebar design was kept but restructured.
2. **`ReviewMode` is named `ReviewerMode`.** The spec's §3.4 pseudocode used `ReviewMode`; the implementation uses `ReviewerMode` throughout for consistency with `AgentRole = 'reviewer'`.
3. **No per-role system-prompt override UI.** The spec's §5.4 mentions one. It is omitted because the Providers view is already dense and the universal-rules override covers the common case. Adding it later is a contained change to `ProvidersView`.
4. **`UniversalRules` editing lives in the Profile view props but not in a dedicated form.** `RulesModal` is retained and still edits universal rules; `ProfileView` accepts the props for future use. Remove them if `tsc` flags them unused.
5. **The `research` role is internal.** `AnyRole` includes `'research'` but `AgentRole` and `MultiAgentConfig` do not. It reuses the Impower provider, keeping the provider UI at exactly five roles.

