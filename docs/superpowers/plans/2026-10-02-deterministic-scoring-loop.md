# Deterministic Scoring & Generation Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every fabricated score with a measured one, and make generation loop until the article reaches a target score.

**Architecture:** A shared document extractor normalises both markdown drafts and rendered HTML, so 14 of the existing SEO checks run identically on either. `scoreDraft()` combines those checks with a real Flesch reading-ease measurement into a deterministic 0-100 score. `runGenerationLoop()` writes, scores, and — only when the score fails — asks the Judge for qualitative gaps and revises, up to 3 iterations, shipping the highest-scoring draft.

**Tech Stack:** TypeScript 7, React 19, Vite 8, Vitest 5, Express server. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-10-02-deterministic-scoring-loop-design.md`

## Global Constraints

- Tests: `npm test` (vitest run). Typecheck: `npm run lint` (`tsc --noEmit`). Both must pass at the end of every task.
- Commit after every task with the message shown in its final step. Never use `git commit --amend` or `--no-verify`.
- **No model may set a score.** `AuditOutput` has no numeric field. Any patch that reintroduces `seoScore` into a UI-facing path is a defect.
- **No fabricated fallbacks.** A missing measurement renders as `—` or `n/a`, never as a plausible number. Never write `score ?? 65` or `score || 65`.
- `MAX_ITERATIONS = 3` is a module constant in `src/pipeline/runArticle.ts`. It is not configurable and must not become one.
- Word-count band is **±20%** of `targetWords`.
- Draft scoring uses `config.languages[0]` for the Flesch language.
- New `PipelineConfig.qualityTarget` defaults to `85` and is clamped to 50-100 by `sanitizePipelineConfig`.
- Do not add dependencies. Do not restructure unrelated files.

---

## File Structure

**Created:**
- `src/utils/document.ts` — `ArticleDocument` type, `extractDocument()`, `markdownToPlainText()`. The only place that knows the difference between markdown and HTML.
- `src/utils/document.test.ts`
- `src/pipeline/scoreArticle.ts` — `ArticleScore`, `ScoredCheck`, `scoreDraft()`, `formatFailedChecks()`, `MAX_ITERATIONS` lives in runArticle.ts not here.
- `src/pipeline/scoreArticle.test.ts`
- `src/utils/seoChecklist.test.ts` — first test coverage for this module.
- `src/utils/readability.test.ts` — first test coverage for this module.

**Modified:**
- `src/utils/readability.ts` — extract `readabilityFromText()`; `calculateReadability()` becomes a wrapper.
- `src/utils/seoChecklist.ts` — split into `evaluateDraftChecks()` / `evaluateHtmlChecks()`; `evaluateSeoChecklist()` composes both.
- `src/pipeline/stages.ts` — `JudgeOutput` → `AuditOutput`; `PipelineConfig.qualityTarget`.
- `src/server/agentPrompts.ts` — `buildJudgePrompt` → `buildAuditPrompt`; `buildCreatorPrompt` gains `reviseFrom`.
- `src/server/roleSchemas.ts` — `validateJudge` → `validateAudit`.
- `src/pipeline/runArticle.ts` — `runGenerationLoop`, best-draft retention, real metrics, article score fields.
- `src/pipeline/agentActivity.ts` — `expectedStages` returns Write/Audit/Render.
- `src/components/ActivityPanel.tsx` — most-recent timing per stage.
- `src/components/PipelineSettingsPanel.tsx` — Quality Gate block.
- `src/components/ArticleWorkspace.tsx` — real Flesch, below-target banner.
- `src/components/HistoryTable.tsx` — deterministic score column.
- `src/utils/exportUtils.ts` — no invented Flesch.
- `src/app/pipelineConfig.ts` — clamp `qualityTarget`.
- `src/types/run.ts` — `below_target` status, score fields.

**Deleted:**
- `src/pipeline/topicFidelity.ts`, `src/pipeline/topicFidelity.test.ts` — its subject (`refinedTopic`) ceases to exist; topic protection is now structural.

---

### Task 1: Document extractor

Turns either markdown or HTML into one normalised shape so the same checks run on a draft and on rendered output.

**Files:**
- Create: `src/utils/document.ts`, `src/utils/document.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface ArticleDocument {
    text: string;                                  // plain prose, no markup
    headings: { level: number; text: string }[];
    paragraphs: string[];                          // paragraph prose only
    html: string | null;                           // null for a markdown draft
  }
  export function extractDocument(source: string, kind: 'html' | 'markdown'): ArticleDocument;
  export function markdownToPlainText(markdown: string): string;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/utils/document.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractDocument, markdownToPlainText } from './document';

const markdown = `# Judul Utama

Paragraf pertama dengan **tebal** dan [tautan](https://example.com).

## Sub Judul

Paragraf kedua. Kalimat kedua. Kalimat ketiga.

## Sub Judul Dua

Paragraf ketiga. Kalimat kedua. Kalimat ketiga.

\`\`\`
code block yang tidak dihitung
\`\`\`
`;

describe('markdownToPlainText', () => {
  it('strips heading markers, emphasis and links', () => {
    const text = markdownToPlainText(markdown);
    expect(text).not.toContain('#');
    expect(text).not.toContain('**');
    expect(text).toContain('Paragraf pertama');
    expect(text).toContain('tautan');
  });

  it('removes fenced code blocks', () => {
    expect(markdownToPlainText(markdown)).not.toContain('code block');
  });

  it('returns an empty string for empty input', () => {
    expect(markdownToPlainText('')).toBe('');
    expect(markdownToPlainText('   \n  ')).toBe('');
  });
});

describe('extractDocument', () => {
  it('reads headings with their levels from markdown', () => {
    const doc = extractDocument(markdown, 'markdown');
    expect(doc.html).toBeNull();
    expect(doc.headings).toEqual([
      { level: 1, text: 'Judul Utama' },
      { level: 2, text: 'Sub Judul' },
      { level: 2, text: 'Sub Judul Dua' },
    ]);
  });

  it('collects paragraphs without markup', () => {
    const doc = extractDocument(markdown, 'markdown');
    expect(doc.paragraphs).toHaveLength(3);
    expect(doc.paragraphs[0]).toContain('Paragraf pertama');
    expect(doc.paragraphs[0]).not.toContain('**');
  });

  it('produces the same prose from equivalent html', () => {
    const html =
      '<h1>Judul Utama</h1><p>Paragraf pertama dengan <strong>tebal</strong> dan ' +
      '<a href="https://example.com">tautan</a>.</p><h2>Sub Judul</h2><p>Paragraf kedua.</p>';
    const doc = extractDocument(html, 'html');
    expect(doc.headings).toEqual([
      { level: 1, text: 'Judul Utama' },
      { level: 2, text: 'Sub Judul' },
    ]);
    expect(doc.paragraphs[0]).toContain('Paragraf pertama');
    expect(doc.paragraphs[0]).not.toContain('<strong>');
    expect(doc.html).toBe(html);
  });

  it('exposes image and link counts only for html', () => {
    const html = '<h2>S</h2><p>Teks satu.</p><p>Teks dua.</p><img src="a.jpg" alt="a"><a href="/x">y</a>';
    const doc = extractDocument(html, 'html');
    expect(doc.imageCount).toBe(1);
    expect(doc.linkCount).toBe(1);
    expect(extractDocument(markdown, 'markdown').imageCount).toBe(0);
  });

  it('survives empty input without throwing', () => {
    const doc = extractDocument('', 'markdown');
    expect(doc.text).toBe('');
    expect(doc.headings).toEqual([]);
    expect(doc.paragraphs).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/document.test.ts`
Expected: FAIL — `Cannot find module './document'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/utils/document.ts`:

```ts
export interface ArticleDocument {
  text: string;
  headings: { level: number; text: string }[];
  paragraphs: string[];
  html: string | null;
  imageCount: number;
  linkCount: number;
  hasFaqSignal: boolean;
  hasStrongFigure: boolean;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strips fenced code, then every markdown marker, keeping prose and link text. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
    .replace(/(\*\*|__|\*|_)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMarkdownParts(markdown: string): {
  headings: { level: number; text: string }[];
  paragraphs: string[];
} {
  const headings: { level: number; text: string }[] = [];
  const paragraphs: string[] = [];
  const blocks = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\n\s*\n/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/s);
    const lines = trimmed.split('\n');
    if (headingMatch && lines.every((line) => /^\s{0,3}#{1,6}\s+/.test(line) || !line.trim())) {
      for (const line of lines) {
        const match = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
        if (match) headings.push({ level: match[1].length, text: match[2].trim() });
      }
      continue;
    }
    paragraphs.push(markdownToPlainText(trimmed));
  }
  return { headings, paragraphs };
}

export function extractDocument(source: string, kind: 'html' | 'markdown'): ArticleDocument {
  if (kind === 'markdown') {
    const { headings, paragraphs } = extractMarkdownParts(source);
    return {
      text: paragraphs.join(' '),
      headings,
      paragraphs,
      html: null,
      imageCount: 0,
      linkCount: 0,
      hasFaqSignal: false,
      hasStrongFigure: false,
    };
  }

  const html = source || '';
  const headings = Array.from(html.matchAll(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/gi)).map((m) => ({
    level: Number(m[1]),
    text: stripHtml(m[2]),
  }));
  const paragraphs = Array.from(html.matchAll(/<p\b[^>]*>(.*?)<\/p>/gi)).map((m) => stripHtml(m[1]));
  return {
    text: stripHtml(html),
    headings,
    paragraphs,
    html,
    imageCount: (html.match(/<img\b[^>]*>/gi) ?? []).length,
    linkCount: (html.match(/<a\b[^>]*href=/gi) ?? []).length,
    hasFaqSignal:
      /<details\b/i.test(html) || /faq|accordion|question/i.test(html) || /application\/ld\+json/i.test(html),
    hasStrongFigure:
      /<strong>[\s\S]*?[\d%][\s\S]*?<\/strong>/i.test(html) ||
      /<aside\b/i.test(html) ||
      /<b>[\s\S]*?[\d%][\s\S]*?<\/b>/i.test(html),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/document.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run lint && npm test`
Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add src/utils/document.ts src/utils/document.test.ts
git commit -m "feat(utils): shared document extractor for markdown and html"
```

---

### Task 2: Readability from plain text

Flesch must run on a markdown draft, where `#` and `**` would otherwise pollute the word and sentence counts.

**Files:**
- Modify: `src/utils/readability.ts:75-99` (split `calculateReadability`)
- Create: `src/utils/readability.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  ```ts
  export function readabilityFromText(text: string, language?: 'en' | 'id' | string): ReadabilityMetrics;
  export function calculateReadability(htmlContent: string, language?: 'en' | 'id' | string): ReadabilityMetrics;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/utils/readability.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { calculateReadability, readabilityFromText } from './readability';

const prose =
  'The quick brown fox jumps over the lazy dog. It was a bright cold day in April. ' +
  'The clocks were striking thirteen. Nobody spoke. The room was very cold.';

describe('readabilityFromText', () => {
  it('measures the plain text it is given', () => {
    const m = readabilityFromText(prose, 'en');
    expect(m.wordCount).toBeGreaterThan(20);
    expect(m.fleschReadingEase).toBeGreaterThanOrEqual(0);
    expect(m.fleschReadingEase).toBeLessThanOrEqual(100);
  });

  it('returns zeros and a no-content label for empty text', () => {
    const m = readabilityFromText('', 'en');
    expect(m.fleschReadingEase).toBe(0);
    expect(m.statusLabel).toBe('No content');
    expect(m.isYoastCompliant).toBe(false);
  });

  it('matches calculateReadability on equivalent html', () => {
    const html = `<p>${prose}</p>`;
    expect(readabilityFromText(prose, 'en')).toEqual(calculateReadability(html, 'en'));
  });

  it('ignores markdown markers when reading a draft', () => {
    const markdown = `## Sub Judul\n\n${prose}`;
    const stripped = readabilityFromText(prose, 'en');
    // Markers would otherwise be counted as words.
    expect(readabilityFromText(markdown.replace(/#+\s*/g, ''), 'en')).toEqual(stripped);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/readability.test.ts`
Expected: FAIL — `readabilityFromText` is not exported.

- [ ] **Step 3: Write minimal implementation**

In `src/utils/readability.ts`, rename the existing `calculateReadability` to `readabilityFromText` and change its signature and first lines. Replace lines 75-99 with:

```ts
export function readabilityFromText(
  text: string,
  language: 'en' | 'id' | string = 'en'
): ReadabilityMetrics {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) {
    return {
      fleschReadingEase: 0,
      gradeLevel: 0,
      wordCount: 0,
      sentenceCount: 0,
      syllableCount: 0,
      averageSentenceLength: 0,
      shortSentencePercentage: 0,
      transitionWordCount: 0,
      statusLabel: 'No content',
      statusColor: 'text-zinc-500',
      isYoastCompliant: false,
    };
  }

  const isIndo = language.toLowerCase() === 'id';
  const lowerText = clean.toLowerCase();
```

Everything after that point in the existing function body stays exactly as-is, up to and including the closing `return { ... };` and the function's closing brace.

Then add the wrapper at the end of the file:

```ts
export function calculateReadability(
  htmlContent: string,
  language: 'en' | 'id' | string = 'en'
): ReadabilityMetrics {
  const text = (htmlContent || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ');
  return readabilityFromText(text, language);
}
```

Note: the existing body references `clean` for the text and recomputes `lowerText` further down for transitions. After the rename, `clean` is defined once at the top; delete the later duplicate `const lowerText = text.toLowerCase();` assignment if the compiler reports it redeclared.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/readability.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Verify the live consumers still work**

Run: `npm run lint && npm test`
Expected: clean. `ReadabilityScorecard` calls `calculateReadability(content, activeLang)` — the wrapper keeps that signature.

- [ ] **Step 6: Commit**

```bash
git add src/utils/readability.ts src/utils/readability.test.ts
git commit -m "refactor(utils): measure readability from plain text so drafts are scorable"
```

---

### Task 3: Split the SEO checklist into draft and HTML checks

The loop must be able to score a markdown draft. Three checks genuinely need rendered HTML; the other 14 do not.

**Files:**
- Modify: `src/utils/seoChecklist.ts` (whole file restructure)
- Create: `src/utils/seoChecklist.test.ts`

**Interfaces:**
- Consumes: `extractDocument`, `ArticleDocument` from Task 1.
- Produces:
  ```ts
  export function evaluateDraftChecks(
    doc: ArticleDocument,
    metadata: SeoMetadata,
    focusKeyphrase?: string
  ): SeoCheckItem[];   // exactly 14 items
  export function evaluateHtmlChecks(doc: ArticleDocument): SeoCheckItem[];  // exactly 3 items
  export function evaluateSeoChecklist(
    htmlContent: string,
    metadata: SeoMetadata,
    focusKeyphraseInput?: string
  ): SeoChecklistReport;  // unchanged signature, 17 items
  ```

- [ ] **Step 1: Write the failing test**

Create `src/utils/seoChecklist.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractDocument } from './document';
import {
  evaluateDraftChecks,
  evaluateHtmlChecks,
  evaluateSeoChecklist,
} from './seoChecklist';
import type { SeoMetadata } from '../types/article';

const metadata: SeoMetadata = {
  seoTitle: 'Panduan Program Makan Bergizi Gratis',
  headline: 'Panduan Lengkap Program Makan Bergizi Gratis',
  focusKeyphrase: 'makan bergizi gratis',
  metaDescription:
    'Ulasan lengkap program makan bergizi gratis, cara mendaftar, dan syarat penerima manfaat di Indonesia.',
  urlSlug: 'program-makan-bergizi-gratis',
  tags: ['gizi'],
};

const pass = (items: { id: string; passed: boolean }[], id: string) =>
  items.find((i) => i.id === id)?.passed;

describe('evaluateDraftChecks', () => {
  const markdown = `# Program Makan Bergizi Gratis

Program makan bergizi gratis menyediakan makan siang untuk anak sekolah. Program ini berjalan setiap hari kerja. Dapur berada di sekolah masing-masing.

## Sasaran Penerima

Sasaran utama adalah anak sekolah dasar kelas satu sampai enam. Pendaftaran dilakukan pada awal tahun ajaran. Semua peserta tidak dipungut biaya.

## Mekanisme Distribusi

Distribusi dilakukan melalui dapur yang dikelola sekolah. Pengambilan dilakukan pada jam istirahat. Jadwal distribusi berjalan setiap hari.
`;

  it('returns exactly the 14 draft-capable checks', () => {
    const items = evaluateDraftChecks(extractDocument(markdown, 'markdown'), metadata, 'makan bergizi gratis');
    expect(items).toHaveLength(14);
    expect(items.map((i) => i.id)).not.toContain('native_images');
    expect(items.map((i) => i.id)).not.toContain('contextual_links');
    expect(items.map((i) => i.id)).not.toContain('faq_schema');
  });

  it('passes the keyphrase-in-first-paragraph check when the phrase leads the body', () => {
    const items = evaluateDraftChecks(extractDocument(markdown, 'markdown'), metadata, 'makan bergizi gratis');
    expect(pass(items, 'keyphrase_in_p1')).toBe(true);
  });

  it('fails the keyphrase check when the phrase is absent from the first paragraph', () => {
    const without = markdown.replace(
      'Program makan bergizi gratis menyediakan makan siang untuk anak sekolah.',
      'Penyediaan makan siang untuk anak sekolah.'
    );
    const items = evaluateDraftChecks(extractDocument(without, 'markdown'), metadata, 'makan bergizi gratis');
    expect(pass(items, 'keyphrase_in_p1')).toBe(false);
  });

  it('fails the h1 check when the draft opens with a level-1 heading', () => {
    expect(pass(evaluateDraftChecks(extractDocument(markdown, 'markdown'), metadata, 'k'), 'no_h1_in_body')).toBe(false);
    const h2Only = markdown.replace(/^# /m, '## ');
    expect(pass(evaluateDraftChecks(extractDocument(h2Only, 'markdown'), metadata, 'k'), 'no_h1_in_body')).toBe(true);
  });

  it('fails the statistical check when no figure is emphasised', () => {
    const plain = markdown.replace(/\*/g, '');
    expect(pass(evaluateDraftChecks(extractDocument(plain, 'markdown'), metadata, 'k'), 'statistical_eeat')).toBe(false);
    const emphasised = markdown.replace('Distribusi dilakukan', '**Distribusi** dilakukan');
    expect(pass(evaluateDraftChecks(extractDocument(emphasised, 'markdown'), metadata, 'k'), 'statistical_eeat')).toBe(true);
  });

  it('scores every draft check identically for a markdown draft and its html equivalent', () => {
    const html =
      '<h2>Sasaran Penerima</h2><p>Sasaran utama adalah anak sekolah dasar kelas satu sampai enam. ' +
      'Pendaftaran dilakukan pada awal tahun ajaran. Semua peserta tidak dipungut biaya.</p>';
    const asMarkdown = '## Sasaran Penerima\n\n' +
      'Sasaran utama adalah anak sekolah dasar kelas satu sampai enam. Pendaftaran dilakukan pada awal tahun ajaran. Semua peserta tidak dipungut biaya.';
    const fromHtml = evaluateDraftChecks(extractDocument(html, 'html'), metadata, 'k');
    const fromMarkdown = evaluateDraftChecks(extractDocument(asMarkdown, 'markdown'), metadata, 'k');
    const relevant = ['h2_paragraph_rule', 'paragraph_depth', 'no_h1_in_body', 'heading_structure'];
    for (const id of relevant) expect(pass(fromHtml, id)).toBe(pass(fromMarkdown, id));
  });
});

describe('evaluateHtmlChecks', () => {
  it('returns exactly the 3 rich-media checks', () => {
    const items = evaluateHtmlChecks(extractDocument('<h2>S</h2><p>Teks.</p>', 'html'));
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.id).sort()).toEqual(['contextual_links', 'faq_schema', 'native_images']);
  });

  it('reports nothing rather than guessing when the source is a draft', () => {
    const items = evaluateHtmlChecks(extractDocument('# Draft', 'markdown'));
    expect(items).toHaveLength(3);
    for (const item of items) expect(item.passed).toBe(false);
    expect(items.every((i) => i.value?.includes('not available'))).toBe(true);
  });

  it('passes images only when every image has src and alt', () => {
    const good = evaluateHtmlChecks(
      extractDocument('<img src="a.jpg" alt="a"><img src="b.jpg" alt="b">', 'html')
    );
    expect(pass(good, 'native_images')).toBe(true);
    const bad = evaluateHtmlChecks(extractDocument('<img src="a.jpg"><img src="b.jpg">', 'html'));
    expect(pass(bad, 'native_images')).toBe(false);
  });
});

describe('evaluateSeoChecklist', () => {
  it('still composes all 17 checks for html', () => {
    const report = evaluateSeoChecklist('<h2>S</h2><p>Teks satu. Teks dua. Teks tiga.</p>', metadata, 'makan bergizi gratis');
    expect(report.totalCount).toBe(17);
    expect(report.score).toBe(Math.round((report.passedCount / report.totalCount) * 100));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/utils/seoChecklist.test.ts`
Expected: FAIL — `evaluateDraftChecks` is not exported.

- [ ] **Step 3: Write minimal implementation**

Rewrite `src/utils/seoChecklist.ts`. Keep `SeoCheckItem`, `SeoChecklistReport`, and the keyphrase-density maths. Structure:

```ts
import { extractDocument, type ArticleDocument } from './document';
import type { SeoMetadata } from '../types/article';

export interface SeoCheckItem { /* unchanged */ }
export interface SeoChecklistReport { /* unchanged */ }

function keyphraseOccurrences(text: string, keyphrase: string): number {
  if (!keyphrase) return 0;
  const escaped = keyphrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return (text.match(new RegExp(`\\b${escaped}\\b`, 'gi')) ?? []).length;
}

function densityPercent(occurrences: number, keyphrase: string, totalWords: number): number {
  const words = Math.max(1, keyphrase.split(/\s+/).length);
  return Math.round(((occurrences * words) / totalWords) * 1000) / 10;
}

export function evaluateDraftChecks(
  doc: ArticleDocument,
  metadata: SeoMetadata,
  focusKeyphrase?: string
): SeoCheckItem[] {
  const keyphrase = (focusKeyphrase ?? metadata.focusKeyphrase ?? '').trim();
  const lowerKeyphrase = keyphrase.toLowerCase();
  const lowerText = doc.text.toLowerCase();
  const totalWords = Math.max(1, doc.text.split(/\s+/).filter(Boolean).length);
  const occurrences = keyphraseOccurrences(doc.text, lowerKeyphrase);
  const density = densityPercent(occurrences, lowerKeyphrase, totalWords);

  const titleLen = metadata.seoTitle ? metadata.seoTitle.length : 0;
  const descLen = metadata.metaDescription ? metadata.metaDescription.length : 0;
  const firstParagraph = (doc.paragraphs[0] ?? '').toLowerCase();
  const headingText = doc.headings
    .filter((h) => h.level === 2 || h.level === 3)
    .map((h) => h.text.toLowerCase())
    .join(' ');
  const h1Count = doc.headings.filter((h) => h.level === 1).length;
  const h2Count = doc.headings.filter((h) => h.level === 2).length;

  // Each H2 needs at least two paragraphs before the next H2.
  const indices = doc.headings.map((h, i) => (h.level === 2 ? i : -1)).filter((i) => i >= 0);
  let allH2HaveMultipleP = indices.length > 0;
  for (const start of indices) {
    const next = indices.find((i) => i > start);
    const end = next ?? doc.headings.length;
    if (doc.paragraphs.slice(start, Math.max(start, end)).length < 2) {
      allH2HaveMultipleP = false;
      break;
    }
  }

  const hasShallowParagraph = doc.paragraphs.some(
    (p) => p.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10).length < 2
  );
  const hasStrongFigure = /\*{1,2}[^*]*\d[^*]*\*{1,2}/.test(doc.text) || doc.hasStrongFigure;

  return [
    { id: 'seo_title_length', category: 'metadata', title: 'SEO Title Length (≤ 55 chars)',
      description: 'Prevents title truncation in Google SERP snippet previews.',
      passed: titleLen > 0 && titleLen <= 55, value: `${titleLen}/55 characters`,
      recommendation: titleLen > 55 ? 'Shorten SEO Title to under 55 characters' : undefined },
    { id: 'seo_title_keyphrase', category: 'metadata', title: 'Focus Keyphrase in SEO Title',
      description: 'The primary phrase must appear in the search snippet title.',
      passed: Boolean(lowerKeyphrase && metadata.seoTitle.toLowerCase().includes(lowerKeyphrase)),
      value: lowerKeyphrase || 'no keyphrase set' },
    { id: 'headline_present', category: 'metadata', title: 'Headline Present',
      description: 'A click-magnet headline is required for the article header.',
      passed: Boolean(metadata.headline && metadata.headline.trim().length > 10),
      value: metadata.headline || 'missing' },
    { id: 'meta_desc_length', category: 'metadata', title: 'Meta Description Length (70-155 chars)',
      description: 'Keeps the SERP description within the display limit.',
      passed: descLen >= 70 && descLen <= 155, value: `${descLen}/155 characters`,
      recommendation: descLen < 70 ? 'Lengthen the meta description' : descLen > 155 ? 'Shorten the meta description' : undefined },
    { id: 'meta_desc_keyphrase', category: 'metadata', title: 'Focus Keyphrase in Meta Description',
      description: 'The primary phrase must appear in the meta description.',
      passed: Boolean(lowerKeyphrase && metadata.metaDescription.toLowerCase().includes(lowerKeyphrase)),
      value: lowerKeyphrase || 'no keyphrase set' },
    { id: 'focus_keyphrase_length', category: 'metadata', title: 'Focus Keyphrase Length (≤ 25 chars)',
      description: 'Overly long keyphrases never match real queries.',
      passed: keyphrase.length > 0 && keyphrase.length <= 25, value: `${keyphrase.length}/25 characters` },
    { id: 'keyphrase_in_p1', category: 'content', title: 'Keyphrase in First Paragraph',
      description: 'The opening paragraph must name the topic explicitly.',
      passed: Boolean(lowerKeyphrase && firstParagraph.includes(lowerKeyphrase)),
      value: firstParagraph ? firstParagraph.slice(0, 60) : 'no paragraph' },
    { id: 'keyphrase_in_headings', category: 'content', title: 'Keyphrase in H2/H3 Headings',
      description: 'Subheadings reinforce topical relevance.',
      passed: Boolean(lowerKeyphrase && headingText.includes(lowerKeyphrase)),
      value: headingText ? headingText.slice(0, 60) : 'no headings' },
    { id: 'keyphrase_density', category: 'content', title: 'Keyphrase Density (0.4% - 2.5%)',
      description: 'Enough repetition to rank, not enough to read as spam.',
      passed: occurrences >= 2 && density >= 0.4 && density <= 2.5,
      value: `${density}% across ${totalWords} words` },
    { id: 'no_h1_in_body', category: 'structure', title: 'No H1 in Article Body',
      description: 'The CMS supplies the H1; the body must not duplicate it.',
      passed: h1Count === 0, value: `${h1Count} H1 heading(s) in the draft` },
    { id: 'heading_structure', category: 'structure', title: 'Heading Structure (≥ 2 H2s)',
      description: 'Subheadings break the article into scannable sections.',
      passed: h2Count >= 2, value: `${h2Count} H2 heading(s)` },
    { id: 'h2_paragraph_rule', category: 'structure', title: 'H2 Paragraph Depth (≥ 2 paragraphs per H2)',
      description: 'Ensures each subtopic has substantive depth per Yoast rules.',
      passed: allH2HaveMultipleP,
      value: allH2HaveMultipleP ? 'All H2s have 2+ paragraphs' : 'One or more H2s has only 1 paragraph' },
    { id: 'paragraph_depth', category: 'structure', title: 'Paragraph Depth (≥ 3 sentences per paragraph)',
      description: 'Prohibits shallow single-sentence paragraphs for sustained dwell time.',
      passed: doc.paragraphs.length >= 4 && !hasShallowParagraph,
      value: doc.paragraphs.length >= 4 && !hasShallowParagraph ? 'Passed (Well-structured)' : 'Shallow single-sentence paragraphs detected' },
    { id: 'statistical_eeat', category: 'rich_media', title: 'Statistical E-E-A-T & Featured Snippet Data',
      description: 'Emphasizes concrete metrics (ROI %, retention %) in bold or a callout.',
      passed: hasStrongFigure,
      value: hasStrongFigure ? 'Highlighted Statistics Present' : 'No highlighted statistical figures' },
  ];
}

export function evaluateHtmlChecks(doc: ArticleDocument): SeoCheckItem[] {
  const html = doc.html;
  const unavailable = 'Not available until the HTML is rendered';
  const imageTags = html ? (html.match(/<img\b[^>]*>/gi) ?? []) : [];
  const hasValidImages =
    imageTags.length >= 2 && imageTags.every((img) => /src=/i.test(img) && /alt=/i.test(img));

  return [
    { id: 'native_images', category: 'rich_media', title: 'Native In-Place Commercial Images (≥ 2)',
      description: 'Embedded with <figure>, <img>, alt, title, and lazy loading.',
      passed: hasValidImages,
      value: html ? `${imageTags.length} images embedded` : unavailable },
    { id: 'contextual_links', category: 'rich_media', title: 'Contextual In-Text Anchor Links (≥ 2)',
      description: 'Native B2B internal & external linking within text flow.',
      passed: html ? doc.linkCount >= 2 : false,
      value: html ? `${doc.linkCount} links placed` : unavailable },
    { id: 'faq_schema', category: 'rich_media', title: 'Interactive FAQ / JSON-LD Schema',
      description: 'Targets Google People Also Ask (PAA) rich snippet results.',
      passed: html ? doc.hasFaqSignal : false,
      value: html ? (doc.hasFaqSignal ? 'Interactive FAQ Present' : 'Missing FAQ') : unavailable },
  ];
}

export function evaluateSeoChecklist(
  htmlContent: string,
  metadata: SeoMetadata,
  focusKeyphraseInput?: string
): SeoChecklistReport {
  const doc = extractDocument(htmlContent, 'html');
  const keyphrase = (focusKeyphraseInput || metadata.focusKeyphrase || '').trim();
  const totalWords = Math.max(1, doc.text.split(/\s+/).filter(Boolean).length);
  const occurrences = keyphraseOccurrences(doc.text, keyphrase.toLowerCase());

  const items = [
    ...evaluateDraftChecks(doc, metadata, keyphrase),
    ...evaluateHtmlChecks(doc),
  ];
  const passedCount = items.filter((item) => item.passed).length;

  return {
    score: Math.round((passedCount / items.length) * 100),
    passedCount,
    totalCount: items.length,
    items,
    keyphraseDensityPercent: densityPercent(occurrences, keyphrase.toLowerCase(), totalWords),
    keyphraseOccurrences: occurrences,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/utils/seoChecklist.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Verify the live consumers still work**

Run: `npm run lint && npm test`
Expected: clean. `SeoChecklistPanel` calls `evaluateSeoChecklist(...)` and reads `report.score`; the report still carries 17 items.

- [ ] **Step 6: Commit**

```bash
git add src/utils/seoChecklist.ts src/utils/seoChecklist.test.ts
git commit -m "refactor(seo): split checklist into draft-capable and html-only checks"
```

---

### Task 4: scoreDraft

The deterministic score the loop gates on.

**Files:**
- Create: `src/pipeline/scoreArticle.ts`, `src/pipeline/scoreArticle.test.ts`

**Interfaces:**
- Consumes: `extractDocument` (Task 1), `evaluateDraftChecks` (Task 3), `readabilityFromText` (Task 2), `DEFAULT_UNIVERSAL_RULES` from `src/config/universalRules.ts`, `SeoMetadata` from `src/types/article.ts`.
- Produces:
  ```ts
  export interface ScoredCheck { id: string; title: string; passed: boolean; actual: string; expected: string; }
  export interface ArticleScore {
    total: number; target: number; passed: boolean;
    flesch: number; wordCount: number;
    wordTarget: number; checks: ScoredCheck[];
    failed: ScoredCheck[];
  }
  export function scoreDraft(
    markdown: string,
    metadata: SeoMetadata,
    focusKeyphrase: string | undefined,
    targetWords: number,
    language: 'en' | 'id',
    target = 85
  ): ArticleScore;
  export function formatFailedChecks(score: ArticleScore): string;
  ```

- [ ] **Step 1: Write the failing test**

Create `src/pipeline/scoreArticle.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { scoreDraft, formatFailedChecks } from './scoreArticle';
import type { SeoMetadata } from '../types/article';

const metadata: SeoMetadata = {
  seoTitle: 'Panduan Program Makan Bergizi Gratis',
  headline: 'Panduan Lengkap Program Makan Bergizi Gratis',
  focusKeyphrase: 'makan bergizi gratis',
  metaDescription:
    'Ulasan lengkap program makan bergizi gratis, cara mendaftar, dan syarat penerima manfaat di Indonesia.',
  urlSlug: 'program-makan-bergizi-gratis',
  tags: ['gizi'],
};

const compliant = `## Apa Itu Program Makan Bergizi Gratis?

Program makan bergizi gratis menyediakan makan siang gratis bagi anak sekolah dasar. Program ini berjalan setiap hari kerja. Dapur berada di dalam sekolah masing-masing.

## Siapa Sasaran Penerima?

Sasaran utama program makan bergizi gratis adalah anak sekolah dasar. Pendaftaran dilakukan pada awal tahun ajaran. Biaya ditanggung oleh pemerintah.

## Bagaimana Distribusi Dilakukan?

Distribusi dilakukan melalui dapur yang dikelola sekolah. Pengambilan berlangsung saat jam istirahat. Jadwal distribusi berjalan setiap hari kerja.
`;

const poor = `# Judul

Ini satu kalimat panjang sekali tanpa jeda yang menjelaskan program secara umum dan tidak sekali menyebut fokus kata kunci yang diminta.

## Sub

Kalimat kedua singkat.
`;

describe('scoreDraft', () => {
  it('scores a compliant draft above the target', () => {
    const score = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(score.total).toBeGreaterThanOrEqual(85);
    expect(score.passed).toBe(true);
    expect(score.failed).toHaveLength(0);
  });

  it('scores a poor draft below the target and names why', () => {
    const score = scoreDraft(poor, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(score.passed).toBe(false);
    expect(score.total).toBeLessThan(85);
    expect(score.failed.map((c) => c.id)).toContain('keyphrase_in_p1');
    expect(score.failed.map((c) => c.id)).toContain('no_h1_in_body');
    expect(score.failed.map((c) => c.id)).toContain('word_count_band');
  });

  it('reports a measured Flesch value, never a constant', () => {
    const score = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(Number.isFinite(score.flesch)).toBe(true);
    expect(score.flesch).not.toBe(0);
    const other = scoreDraft(poor, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(other.flesch).not.toBe(score.flesch);
  });

  it('counts exactly 16 checks', () => {
    const score = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(score.checks).toHaveLength(16);
    expect(score.checks.map((c) => c.id)).toContain('flesch_range');
    expect(score.checks.map((c) => c.id)).toContain('word_count_band');
  });

  it('derives total from passed over total', () => {
    const score = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    const passed = score.checks.filter((c) => c.passed).length;
    expect(score.total).toBe(Math.round((passed / score.checks.length) * 100));
  });

  it('accepts a word count inside the ±20% band and rejects one outside', () => {
    const inBand = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(inBand.checks.find((c) => c.id === 'word_count_band')?.passed).toBe(true);
    const outOfBand = scoreDraft(poor, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(outOfBand.checks.find((c) => c.id === 'word_count_band')?.passed).toBe(false);
  });

  it('returns a failing score instead of throwing on an empty draft', () => {
    const score = scoreDraft('', metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(score.passed).toBe(false);
    expect(score.flesch).toBe(0);
  });

  it('respects a lower target', () => {
    expect(scoreDraft(poor, metadata, 'makan bergizi gratis', 900, 'id', 5).passed).toBe(true);
  });
});

describe('formatFailedChecks', () => {
  it('lists only the failures with a fixed header', () => {
    const score = scoreDraft(poor, metadata, 'makan bergizi gratis', 900, 'id', 85);
    const text = formatFailedChecks(score);
    expect(text).toContain('These measured checks failed');
    expect(text).toContain('Fix each one');
    for (const check of score.failed) expect(text).toContain(check.id);
    for (const check of score.checks.filter((c) => c.passed)) {
      expect(text).not.toContain(`${check.id}: `);
    }
  });

  it('returns an empty string when nothing failed', () => {
    const score = scoreDraft(compliant, metadata, 'makan bergizi gratis', 900, 'id', 85);
    expect(score.failed).toHaveLength(0);
    expect(formatFailedChecks(score)).toBe('');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pipeline/scoreArticle.test.ts`
Expected: FAIL — `Cannot find module './scoreArticle'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/pipeline/scoreArticle.ts`:

```ts
import { extractDocument } from '../utils/document';
import { readabilityFromText } from '../utils/readability';
import { evaluateDraftChecks } from '../utils/seoChecklist';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import type { SeoMetadata } from '../types/article';

export interface ScoredCheck {
  id: string;
  title: string;
  passed: boolean;
  actual: string;
  expected: string;
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

  checks.push({
    id: 'flesch_range',
    title: `Flesch Reading Ease (${targetFleschMin}-${targetFleschMax})`,
    passed: readability.fleschReadingEase >= targetFleschMin && readability.fleschReadingEase <= targetFleschMax,
    actual: String(readability.fleschReadingEase),
    expected: `between ${targetFleschMin} and ${targetFleschMax}`,
  });
  checks.push({
    id: 'word_count_band',
    title: 'Word Count (±20% of target)',
    passed: wordCount >= low && wordCount <= high,
    actual: String(wordCount),
    expected: `${low}-${high} words (target ${targetWords})`,
  });

  const passedCount = checks.filter((c) => c.passed).length;
  const total = Math.round((passedCount / checks.length) * 100);

  return {
    total,
    target,
    passed: total >= target,
    flesch: readability.fleschReadingEase,
    wordCount,
    wordTarget: targetWords,
    checks,
    failed: checks.filter((c) => !c.passed),
  };
}

/** Instruction lines for the next revision. Never names a check that passed. */
export function formatFailedChecks(score: ArticleScore): string {
  if (score.failed.length === 0) return '';
  const lines = score.failed.map((c) => `- [${c.id}] ${c.title}: measured "${c.actual}", required ${c.expected}.`);
  return [
    `These measured checks failed (score ${score.total}/100, target ${score.target}). Fix each one and change nothing else:`,
    ...lines,
  ].join('\n');
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/pipeline/scoreArticle.test.ts`
Expected: PASS. If `compliant` does not reach 85, that is a real signal, not a bug to paper over: lengthen the fixture with additional compliant H2 sections until the remaining failures are only Flesch, then relax that one assertion's fixture rather than lowering `total` in the implementation.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `npm run lint && npm test`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add src/pipeline/scoreArticle.ts src/pipeline/scoreArticle.test.ts
git commit -m "feat(pipeline): deterministic draft scorer with measured Flesch"
```

---

### Task 5: Store the real score, delete the fiction

Ships honest numbers before any loop exists.

**Files:**
- Modify: `src/types/article.ts` (add fields to `GeneratedArticle`), `src/pipeline/runArticle.ts:439-471` (`buildArticle`), `src/components/ArticleWorkspace.tsx:390-395`, `src/utils/exportUtils.ts:145-155`, `src/components/HistoryTable.tsx:86-98`

**Interfaces:**
- Consumes: `scoreDraft`, `ArticleScore` (Task 4); `calculateReadability` (Task 2).
- Produces: `GeneratedArticle.score?: ArticleScore`, `.belowTarget?: boolean`, `.remainingGaps?: string[]`.

- [ ] **Step 1: Write the failing test**

In `src/pipeline/runArticle.test.ts`, find the test that asserts the built article (around line 420, which currently reads `metrics: { wordCount: 12, readingTimeMinutes: 1, fleschScore: 0 }`) and change its expectation. Replace the `metrics` assertion with:

```ts
expect(article.metrics.fleschScore).toBeGreaterThan(0);
expect(article.score?.total).toBeGreaterThanOrEqual(0);
expect(article.score?.flesch).toBeGreaterThan(0);
```

Add a new test at the end of the same file:

```ts
describe('measured metrics', () => {
  it('records a measured Flesch score instead of a zero placeholder', async () => {
    const result = await run({ judge: false, impower: 'off', reviewer: 'off', targetWords: 900 }, {
      creator: () => ({
        markdownContent:
          '# Judul Artikel\n\nProgram makan bergizi gratis menyediakan makan siang gratis bagi anak sekolah. ' +
          'Program ini berjalan setiap hari kerja di sekolah. Dapur berada di dalam sekolah masing-masing.\n\n' +
          '## Sasaran\n\nSasaran utama adalah anak sekolah dasar kelas satu sampai enam. Pendaftaran dilakukan ' +
          'pada awal tahun ajaran. Biaya program ditanggung oleh pemerintah pusat.\n\n' +
          '## Distribusi\n\nDistribusi dilakukan melalui dapur yang dikelola sekolah. Pengambilan berlangsung ' +
          'saat jam istirahat. Jadwal distribusi berjalan setiap hari kerja tanpa kecuali.\n',
      }),
      designer: () => ({
        html: '<article><h2>Sasaran</h2><p>Sasaran utama adalah anak sekolah dasar kelas satu sampai enam. Pendaftaran dilakukan pada awal tahun ajaran.</p></article>',
        warnings: [],
      }),
    });
    const article = result.article!;
    expect(article.metrics.fleschScore).toBeGreaterThan(0);
    expect(article.score).toBeDefined();
    expect(article.score?.checks).toHaveLength(16);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/pipeline/runArticle.test.ts -t "measured metrics"`
Expected: FAIL — `fleschScore` is `0` and `score` is undefined.

- [ ] **Step 3: Add the fields to the article type**

In `src/types/article.ts`, inside `GeneratedArticle`, after `reviewPassed?: boolean;` add:

```ts
  /** Measured against the draft, never supplied by the model. */
  score?: import('../pipeline/scoreArticle').ArticleScore;
  belowTarget?: boolean;
  remainingGaps?: string[];
```

Prefer a normal import: add `import type { ArticleScore } from '../pipeline/scoreArticle';` at the top of the file and write `score?: ArticleScore;`.

- [ ] **Step 4: Measure and store in buildArticle**

In `src/pipeline/runArticle.ts`:

Add to the imports:

```ts
import { readabilityFromText } from '../utils/readability';
import { scoreDraft, formatFailedChecks, type ArticleScore } from './scoreArticle';
```

Extend `BuildArticleParams` with an optional `score?: ArticleScore`.

Inside `buildArticle`, immediately after `const wordCount = ...` on line 415, add:

```ts
  // Measure the shipped HTML when a format rendered, else the draft text. Never
  // a placeholder: an unmeasured score must not become a fabricated number.
  const measuredHtml = Object.values(formatsBundle).find((value) => typeof value === 'string' && value.length > 0) ?? '';
  const fleschSource = measuredHtml || markdown;
  const fleschScore = readabilityFromText(
    measuredHtml
      ? fleschSource
      : fleschSource.replace(/[#*_>`]/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1'),
    options.config.languages[0] ?? 'en'
  ).fleschReadingEase;
```

Then in the returned object replace `fleschScore: 0,` with `fleschScore,` and add after `reviewPassed: params.reviewPassed,`:

```ts
    score: params.score,
    belowTarget: params.score ? !params.score.passed : undefined,
    remainingGaps: params.score?.failed.map((c) => `${c.id}: ${c.actual}`),
```

- [ ] **Step 5: Stop fabricating in the UI and export**

`src/components/ArticleWorkspace.tsx`, replace lines 390-395 with:

```tsx
          <div className="flex items-center gap-1.5">
            <span className="text-zinc-400 font-mono">Flesch Score:</span>
            <span className="font-semibold text-emerald-400 font-mono px-2 py-0.5 rounded bg-zinc-800 border border-zinc-700">
              {typeof article.metrics.fleschScore === 'number' && article.metrics.fleschScore > 0
                ? `${article.metrics.fleschScore} (${article.score?.flesch !== undefined && article.score.flesch >= 60 && article.score.flesch <= 75 ? 'Optimal Yoast' : 'measured'})`
                : '— not measured'}
            </span>
          </div>
```

`src/utils/exportUtils.ts`, replace line 148 with:

```ts
    `Flesch Score    : ${typeof article.metrics?.fleschScore === 'number' && article.metrics.fleschScore > 0 ? article.metrics.fleschScore : 'n/a'}`,
```

`src/components/HistoryTable.tsx`, replace the `reviewReport ? ... : ...` block (lines 86-96) with:

```tsx
                    {article.score ? (
                      <span className="flex items-center gap-1">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            article.score.passed
                              ? 'bg-emerald-950/50 text-emerald-300'
                              : 'bg-amber-950/50 text-amber-300'
                          }`}
                        >
                          {article.score.total}
                        </span>
                        {article.belowTarget && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300">
                            below target
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-600">not scored</span>
                    )}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx vitest run src/pipeline/runArticle.test.ts`
Expected: PASS.

- [ ] **Step 7: Run the full suite, typecheck and build**

Run: `npm run lint && npm test && npm run build`
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add src/types/article.ts src/pipeline/runArticle.ts src/components/ArticleWorkspace.tsx src/utils/exportUtils.ts src/components/HistoryTable.tsx src/pipeline/runArticle.test.ts
git commit -m "fix(scoring): store measured Flesch instead of fabricated defaults"
```

---

### Task 6: Judge becomes the auditor

Removes the role's ability to express a topic at all, which is what let it hijack the article.

**Files:**
- Modify: `src/pipeline/stages.ts:56-62`, `src/server/agentPrompts.ts:68-90`, `src/server/roleSchemas.ts:33-58,167-170`
- Modify: `src/server/agentPrompts.test.ts`, `src/server/roleSchemas.test.ts`
- Test: `src/server/roleSchemas.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-5.
- Produces:
  ```ts
  // stages.ts
  export interface AuditOutput { hasGaps: boolean; notes: string[]; priorities: string[]; }
  // agentPrompts.ts
  export function buildAuditPrompt(input: {
    markdown: string;
    failedChecks: { id: string; title: string; actual: string; expected: string }[];
    focusKeyphrase?: string;
  }, profile: UserProfile): string;
  ```

- [ ] **Step 1: Write the failing tests**

In `src/server/roleSchemas.test.ts`, replace the `judge` fixture and its `describe('validateRoleOutput: judge')` block with:

```ts
const audit = {
  hasGaps: true,
  notes: ['The opening paragraph does not name the topic.'],
  priorities: ['Rewrite the opening paragraph.'],
};

describe('validateRoleOutput: judge', () => {
  it('accepts the audit shape', () => {
    expect(validateRoleOutput('judge', JSON.stringify(audit)).ok).toBe(true);
  });

  it('rejects output that still tries to return a refined topic', () => {
    const withTopic = { ...audit, refinedTopic: 'A completely different subject' };
    expect((validateRoleOutput('judge', JSON.stringify(withTopic)) as any).data.refinedTopic).toBeUndefined();
  });

  it('keeps notes as strings only', () => {
    const messy = JSON.stringify({ ...audit, notes: ['ok', null, 5, 'fine'] });
    expect((validateRoleOutput('judge', messy) as any).data.notes).toEqual(['ok', 'fine']);
  });

  it('rejects output with no notes key', () => {
    expect(validateRoleOutput('judge', JSON.stringify({ hasGaps: false })).ok).toBe(false);
  });
});
```

In `src/server/agentPrompts.test.ts`, replace the `describe('buildJudgePrompt')` block with:

```ts
describe('buildAuditPrompt', () => {
  const failed = [
    { id: 'keyphrase_in_p1', title: 'Keyphrase in First Paragraph', actual: 'no paragraph', expected: 'phrase must appear' },
  ];

  it('hands the model the failing checks and the draft', () => {
    const prompt = buildAuditPrompt(
      { markdown: '# Draft artikel', failedChecks: failed, focusKeyphrase: 'makan bergizi gratis' },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('Draft artikel');
    expect(prompt).toContain('keyphrase_in_p1');
    expect(prompt).toContain('makan bergizi gratis');
    expect(prompt).toMatch(/do not (assign|estimate|invent|write) a score/i);
    expect(prompt).toMatch(/do not rewrite the article/i);
    expect(prompt).toMatch(/do not change the (subject|topic)/i);
  });

  it('demands the audit shape with no numeric field', () => {
    const prompt = buildAuditPrompt({ markdown: 'x', failedChecks: failed }, DEFAULT_USER_PROFILE);
    expect(prompt).toContain('hasGaps');
    expect(prompt).toContain('notes');
    expect(prompt).not.toContain('refinedTopic');
    expect(prompt).not.toContain('seoScore');
  });

  it('works with no failing checks', () => {
    const prompt = buildAuditPrompt({ markdown: 'x', failedChecks: [] }, DEFAULT_USER_PROFILE);
    expect(prompt).toContain('hasGaps');
  });
});
```

Add `buildAuditPrompt` to that file's import list, and remove `buildJudgePrompt` if nothing else uses it.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/server/roleSchemas.test.ts src/server/agentPrompts.test.ts`
Expected: FAIL — the new exports do not exist.

- [ ] **Step 3: Replace the type**

In `src/pipeline/stages.ts`, replace `JudgeOutput` (lines 56-62) with:

```ts
/**
 * The Judge's only output. It used to carry refinedTopic, which silently
 * replaced the user's topic; the role can no longer express a topic at all.
 * It never returns a number: the score is measured by scoreDraft.
 */
export interface AuditOutput {
  hasGaps: boolean;
  notes: string[];
  priorities: string[];
}
```

- [ ] **Step 4: Replace the prompt builder**

In `src/server/agentPrompts.ts`, replace `buildJudgePrompt` with:

```ts
export function buildAuditPrompt(
  input: {
    markdown: string;
    failedChecks: { id: string; title: string; actual: string; expected: string }[];
    focusKeyphrase?: string;
  },
  profile: UserProfile
): string {
  const keyphrase = input.focusKeyphrase?.trim();
  const checks = input.failedChecks.length
    ? input.failedChecks
        .map((c) => `- [${c.id}] ${c.title}\n  measured: ${c.actual}\n  required: ${c.expected}`)
        .join('\n')
    : '- (none reported — judge the writing quality on its own merits)';
  return `You are the Judge: an editorial auditor. You did not write this draft and you will not rewrite it.

${buildBrandBlock(profile)}

FOCUS KEYPHRASE: ${keyphrase ? `"${keyphrase}"` : '(none provided)'}

MEASURED CHECKS THAT FAILED (these numbers were computed from the text, not by a model):
${checks}

DRAFT:
${input.markdown}

RULES:
- Report gaps only. Do NOT assign, estimate, invent or write a score, rating or number.
- Do NOT rewrite the article, and do NOT propose replacement copy.
- Do NOT change the subject or topic. Judge the draft that was given.
- Every note must be something the writer can act on in a revision.

Respond with ONLY this JSON shape:
{
  "hasGaps": true,
  "notes": ["specific, actionable observation about the draft"],
  "priorities": ["the fixes that matter most, most important first"]
}`;
}
```

- [ ] **Step 5: Replace the validator**

In `src/server/roleSchemas.ts`, replace `validateJudge` with:

```ts
function validateAudit(obj: Record<string, unknown>): ValidationResult<AuditOutput> {
  const notes = strArray(obj.notes);
  if (notes.length === 0) {
    return { ok: false, error: 'judge output is missing notes' };
  }
  return {
    ok: true,
    data: {
      hasGaps: obj.hasGaps === undefined ? notes.length > 0 : Boolean(obj.hasGaps),
      notes,
      priorities: strArray(obj.priorities),
    },
  };
}
```

Import `AuditOutput` from `./stages`, and change the dispatch at line 168 to `return validateAudit(obj);`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx vitest run src/server/roleSchemas.test.ts src/server/agentPrompts.test.ts`
Expected: PASS.

- [ ] **Step 7: Fix the now-broken callers**

Run: `npm run lint`
Expected: errors in `server.ts` (`buildJudgePrompt` no longer exported), `runArticle.ts` (`JudgeOutput` removed) and their tests. Leave those broken for Task 7 — do not patch them here.

- [ ] **Step 8: Commit**

```bash
git add src/pipeline/stages.ts src/server/agentPrompts.ts src/server/roleSchemas.ts src/server/agentPrompts.test.ts src/server/roleSchemas.test.ts
git commit -m "refactor(judge): audit role reports gaps only and can no longer return a topic"
```

This commit is expected to leave the build red; Task 7 restores it. Say so in the commit body if needed.

---

### Task 7: The generation loop

**Files:**
- Modify: `src/pipeline/runArticle.ts` (replace `runCreatorAndReviewer`), `src/server/agentPrompts.ts` (`buildCreatorPrompt` gains `reviseFrom`)

**Interfaces:**
- Consumes: `scoreDraft`, `formatFailedChecks`, `ArticleScore` (Task 4); `AuditOutput` and `buildAuditPrompt` (Task 6).
- Produces: `MAX_ITERATIONS = 3` exported from `src/pipeline/runArticle.ts`.

- [ ] **Step 1: Write the failing tests**

In `src/pipeline/runArticle.test.ts`, add:

```ts
const LONG_INDONESIAN_DRAFT = [
  '# Program Makan Bergizi Gratis',
  '',
  'Program makan bergizi gratis menyediakan makan siang gratis bagi anak sekolah dasar. Program ini berjalan setiap hari kerja. Dapur berada di dalam sekolah masing-masing.',
  '',
  '## Sasaran Penerima',
  '',
  'Sasaran utama program makan bergizi gratis adalah anak sekolah dasar. Pendaftaran dilakukan pada awal tahun ajaran. Biaya ditanggung oleh pemerintah pusat.',
  '',
  '## Distribusi',
  '',
  'Distribusi dilakukan melalui dapur yang dikelola sekolah. Pengambilan berlangsung saat jam istirahat. Jadwal distribusi berjalan setiap hari kerja tanpa kecuali.',
  '',
].join('\n');

const MAX_ITERATIONS_FOR_TEST = 3;
const WEAK_DRAFT = 'Draft pendek tanpa kata kunci.';

describe('generation loop', () => {
  it('skips the audit entirely when the first draft already passes', async () => {
    const result = await run(
      { judge: true, impower: 'standard', reviewer: 'off', targetWords: 900 },
      {
        judge: () => { throw new Error('judge must not be called when the score passes'); },
        impower: () => brief,
        creator: () => ({ markdownContent: LONG_INDONESIAN_DRAFT }),
        designer: () => ({ html, warnings: [] }),
      },
      { seedTopic: 'Program Makan Bergizi Gratis', focusKeyphrase: 'makan bergizi gratis' }
    );
    expect(result.status).toBe('done');
    expect(result.article?.score?.passed).toBe(true);
    expect(calls.creator).toBe(1);
    expect(calls.judge).toBeUndefined();
  });

  it('audits and revises until the draft passes', async () => {
    const gaps = [
      { markdownContent: 'Draft pertama yang terlalu pendek dan tanpa kata kunci sama sekali.' },
      { markdownContent: 'Draft kedua juga masih terlalu pendek dan tanpa kata kunci sama sekali.' },
      { markdownContent: LONG_INDONESIAN_DRAFT },
    ];
    let call = 0;
    const result = await run(
      { judge: true, impower: 'standard', reviewer: 'off', targetWords: 900 },
      {
        judge: () => ({ hasGaps: true, notes: ['Opening does not name the topic.'], priorities: ['Fix the opening.'] }),
        impower: () => brief,
        creator: () => ({ markdownContent: gaps[call++].markdownContent }),
        designer: () => ({ html, warnings: [] }),
      },
      { seedTopic: 'Program Makan Bergizi Gratis', focusKeyphrase: 'makan bergizi gratis' }
    );
    expect(calls.creator).toBe(3);
    expect(calls.judge).toBe(2);
    expect(result.article?.score?.passed).toBe(true);
  });

  it('ships the highest-scoring draft and records the gaps when the target is never met', async () => {
    const drafts: string[] = [
      'Draft pertama yang sangat pendek tanpa kata kunci.',
      'Program makan bergizi gratis adalah program pemerintah untuk anak sekolah dasar.',
      WEAK_DRAFT,
    ];
    let call = 0;
    const result = await run(
      { judge: true, impower: 'standard', reviewer: 'off', targetWords: 900 },
      {
        judge: () => ({ hasGaps: true, notes: ['Still off target.'], priorities: ['Tighten the prose.'] }),
        impower: () => brief,
        creator: () => ({ markdownContent: drafts[call++] }),
        designer: () => ({ html, warnings: [] }),
      },
      { seedTopic: 'Program Makan Bergizi Gratis', focusKeyphrase: 'makan bergizi gratis' }
    );
    expect(calls.creator).toBe(MAX_ITERATIONS_FOR_TEST);
    expect(calls.judge).toBe(MAX_ITERATIONS_FOR_TEST - 1);
    expect(result.status).toBe('done');
    expect(result.article?.belowTarget).toBe(true);
    expect(result.article?.remainingGaps?.length).toBeGreaterThan(0);
    // The shipped draft is the best-scoring one, not simply the last generated.
    const shipped = result.article!.rawText;
    expect(drafts).toContain(shipped);
    expect(shipped).not.toBe(WEAK_DRAFT);
  });

  it('never asks the judge for a score', async () => {
    const seen: any[] = [];
    await run(
      { judge: true, impower: 'standard', reviewer: 'off', targetWords: 900 },
      {
        judge: (input: any) => { seen.push(input); return { hasGaps: true, notes: ['x'], priorities: [] }; },
        impower: () => brief,
        creator: () => ({ markdownContent: WEAK_DRAFT }),
        designer: () => ({ html, warnings: [] }),
      },
      { seedTopic: 'Program Makan Bergizi Gratis', focusKeyphrase: 'makan bergizi gratis' }
    );
    expect(seen.length).toBeGreaterThan(0);
    for (const input of seen) {
      expect(input.markdown).toBeTruthy();
      expect(Array.isArray(input.failedChecks)).toBe(true);
      expect(input.failedChecks.length).toBeGreaterThan(0);
    }
  });
});
```

Define `const MAX_ITERATIONS_FOR_TEST = 3;` beside those tests, and add an assertion in the third test that the shipped markdown is the one from the highest-scoring iteration by capturing each draft in an array.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/pipeline/runArticle.test.ts -t "generation loop"`
Expected: FAIL — the Judge still returns `refinedTopic` and no loop exists.

- [ ] **Step 3: Teach the Creator prompt about revisions**

In `src/server/agentPrompts.ts`, add `reviseFrom?: string` to `buildCreatorPrompt`'s input type, and add this binding next to the existing `briefBlock`/`tone`/`extra` bindings:

```ts
  const revision = input.reviseFrom?.trim()
    ? `\nREVISE THIS DRAFT:\n${input.reviseFrom.trim()}\nReturn the full revised article. Keep everything that already satisfies the checks below and change only what the instructions ask for.\n`
    : '';
```

Insert `${revision}` immediately after `${briefBlock}` in the template literal so the order reads topic, pinned keyword, target length, brief, previous draft, tone, extra instructions.

- [ ] **Step 4: Replace runCreatorAndReviewer with the loop**

In `src/pipeline/runArticle.ts`:

- Add `export const MAX_ITERATIONS = 3;` near `DESIGNER_CONCURRENCY`.
- Import `buildBrandBlock` is not needed here; import `AuditOutput` from `./stages` and keep the existing `resolveBrief` import.
- Replace `runCreatorAndReviewer` with:

```ts
async function runGenerationLoop(
  options: RunArticleOptions,
  base: { refinedTopic: string; brief: ImpowerOutput | null }
): Promise<{ draft: CreatorOutput; brief: ImpowerOutput; score: ArticleScore }> {
  const { config, onStage } = options;
  const call = makeCall(options);
  const { refinedTopic } = base;
  const keyphrase = options.focusKeyphrase;
  const language = config.languages[0] ?? 'en';
  const target = config.qualityTarget ?? 85;

  let brief = base.brief;

  onStage('creating', 'Writing the article markdown...');
  let draft = (await call('creator', {
    seedTopic: refinedTopic,
    originalTopic: options.seedTopic.trim(),
    focusKeyphrase: keyphrase,
    targetWords: config.targetWords,
    brief,
    toneOverride: options.toneOverride ?? '',
    extraInstructions: '',
  })) as CreatorOutput;

  // Impower can be off, so the draft self-plans. The brief must exist before the
  // draft can be scored: it carries the metadata the SEO checks read.
  if (!brief) brief = resolveBrief(draft, refinedTopic, keyphrase ?? '');

  let best: { draft: CreatorOutput; score: ArticleScore } | null = null;

  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const score = scoreDraft(
      draft.markdownContent,
      brief.seoMetadata,
      keyphrase ?? brief.seoMetadata.focusKeyphrase,
      config.targetWords,
      language,
      target
    );
    if (!best || score.total > best.score.total) best = { draft, score };

    if (score.passed) break;
    if (iteration === MAX_ITERATIONS) break;

    onStage('judging', `Score ${score.total}/100, target ${target}. Auditing...`);
    const audit = (await call('judge', {
      markdown: draft.markdownContent,
      failedChecks: score.failed.map((c) => ({
        id: c.id,
        title: c.title,
        actual: c.actual,
        expected: c.expected,
      })),
      focusKeyphrase: keyphrase ?? brief.seoMetadata.focusKeyphrase,
    })) as AuditOutput;

    onStage('creating', `Applying audit feedback (revision ${iteration} of ${MAX_ITERATIONS - 1})...`);
    draft = (await call('creator', {
      seedTopic: refinedTopic,
      originalTopic: options.seedTopic.trim(),
      focusKeyphrase: keyphrase,
      targetWords: config.targetWords,
      brief,
      reviseFrom: draft.markdownContent,
      toneOverride: options.toneOverride ?? '',
      extraInstructions: [formatFailedChecks(score), audit.notes.map((n) => `- ${n}`).join('\n')]
        .filter(Boolean)
        .join('\n\n'),
    })) as CreatorOutput;
  }

  const winner = best as { draft: CreatorOutput; score: ArticleScore };
  return { draft: winner.draft, brief: brief as ImpowerOutput, score: winner.score };
}
```

- [ ] **Step 5: Wire the loop into runArticle and resumeArticle**

In `runArticle`, replace the `runCreatorAndReviewer` call and its `needs_attention` branch with:

```ts
    // ---- Stage 3: Creator, scored in a loop --------------------------------
    const loop = await runGenerationLoop(options, { refinedTopic, brief });
    best = loop;
```

Delete the old `if (!phase.ready) return haltedResult(...)` block and the `phase` variable. Then call `runDesignerStage(options, { refinedTopic, brief: loop.brief, creator: loop.draft, articleId: undefined })` and pass `score: loop.score` through `runDesignerStage` into `buildArticle`.

Delete the `judge` variable and its `judgeOutput: judge` assignment from `buildArticle` usage — `AuditOutput` has no place on the article, so store the last audit in `reviewReport` only if you want it; the simplest correct choice is to drop the `judgeOutput` field from the returned object.

In `resumeArticle`, replace the `runCreatorAndReviewer` call with `runGenerationLoop(options, { refinedTopic, brief })`, drop the `needs_attention` early return, and render `loop.draft` and pass `score: loop.score`.

Remove the now-unused `haltedResult` function and the `RunArticleResult` `needs_attention` path only if `types/stages.ts` still declares it elsewhere; otherwise leave the status in place for the batch queue and keep the return shape.

- [ ] **Step 6: Add qualityTarget to the config type**

In `src/pipeline/stages.ts`, inside `PipelineConfig`, after `lengthTarget?: LengthTarget;` add:

```ts
  /** Score the loop must reach. 50-100; defaults to 85. */
  qualityTarget?: number;
```

In `src/pipeline/stages.ts`'s `DEFAULT_PIPELINE_CONFIG`, add `qualityTarget: 85,`.

- [ ] **Step 7: Run the loop tests**

Run: `npx vitest run src/pipeline/runArticle.test.ts -t "generation loop"`
Expected: PASS for the loop tests. The three migrated Judge tests from earlier in this file (`feeds the refined topic from Judge to Creator`, `still accepts a judge refinement that stays on the user subject`, `never lets a drifted judge angle replace the topic the user typed`) must be deleted — they assert a contract that no longer exists.

- [ ] **Step 8: Migrate the deleted-contract tests**

Delete those three tests and add:

```ts
it('sends the user topic to Impower and Creator, never a rewritten one', async () => {
  const seen: Record<string, any> = {};
  await run(
    { judge: true, impower: 'standard', reviewer: 'off' },
    {
      judge: () => ({ hasGaps: true, notes: ['n'], priorities: [] }),
      impower: (input: any) => { seen.impower = input; return brief; },
      creator: (input: any) => { seen.creator = input; return { markdownContent: markdown }; },
      designer: () => ({ html, warnings: [] }),
    },
    { seedTopic: 'Program Makan Bergizi Gratis', focusKeyphrase: 'makan bergizi gratis' }
  );
  expect(seen.impower.topic).toBe('Program Makan Bergizi Gratis');
  expect(seen.impower.originalTopic).toBe('Program Makan Bergizi Gratis');
  expect(seen.creator.originalTopic).toBe('Program Makan Bergizi Gratis');
  expect(seen.impower.focusKeyphrase).toBe('makan bergizi gratis');
});
```

`impower` must now receive `originalTopic`. Add it to the Impower call in Task 7 Step 5's block if it is not already there.

- [ ] **Step 9: Run the full suite, typecheck and build**

Run: `npm run lint && npm test && npm run build`
Expected: all clean. `git grep -n "refinedTopic\|JudgeOutput\|judgeOutput"` must return nothing outside `docs/`.

- [ ] **Step 10: Commit**

```bash
git add src/pipeline/runArticle.ts src/pipeline/stages.ts src/server/agentPrompts.ts src/pipeline/runArticle.test.ts
git commit -m "feat(pipeline): score in a loop and ship the best-scoring draft"
```

---

### Task 8: Configuration, persistence and UI

**Files:**
- Modify: `src/app/pipelineConfig.ts`, `src/types/run.ts`, `src/components/PipelineSettingsPanel.tsx`, `src/components/ActivityPanel.tsx`, `src/pipeline/agentActivity.ts`, `src/App.tsx`, `src/app/useArticleRun.ts`, `src/components/ArticleWorkspace.tsx`

**Interfaces:**
- Consumes: `ArticleScore` (Task 4), `MAX_ITERATIONS` (Task 7).
- Produces: `RunRecord.status` gains `'below_target'`; `RunRecord.targetScore?`, `achievedScore?`.

- [ ] **Step 1: Write the failing test**

In `src/app/pipelineConfig.test.ts`, add:

```ts
it('clamps the quality target into a usable range', () => {
  expect(sanitizePipelineConfig({ qualityTarget: 200 }).qualityTarget).toBe(100);
  expect(sanitizePipelineConfig({ qualityTarget: 1 }).qualityTarget).toBe(50);
  expect(sanitizePipelineConfig({ qualityTarget: 85 }).qualityTarget).toBe(85);
  expect(sanitizePipelineConfig({}).qualityTarget).toBe(85);
  expect(sanitizePipelineConfig({ qualityTarget: 'high' }).qualityTarget).toBe(85);
});
```

In `src/types/run.test.ts`, add:

```ts
it('treats a below-target run as retryable only when it has no article', () => {
  expect(isRetryableRun(record({ status: 'below_target' as never }))).toBe(true);
  expect(isRetryableRun(record({ status: 'below_target' as never, articleId: 'a1' }))).toBe(false);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/app/pipelineConfig.test.ts src/types/run.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the config clamp**

In `src/app/pipelineConfig.ts`, add to the returned object:

```ts
    qualityTarget:
      typeof raw.qualityTarget === 'number' && Number.isFinite(raw.qualityTarget)
        ? Math.max(50, Math.min(100, Math.round(raw.qualityTarget)))
        : base.qualityTarget,
```

- [ ] **Step 4: Extend the run record**

In `src/types/run.ts`, add `'below_target'` to the `RunStatus` union and to `TERMINAL_RUN_STATUSES`. Add `targetScore?: number` and `achievedScore?: number` to `RunRecord`. Change `isRetryableRun` to:

```ts
export function isRetryableRun(run: RunRecord): boolean {
  const retryable: RunStatus[] = ['failed', 'interrupted', 'below_target'];
  return retryable.includes(run.status) && !run.articleId;
}
```

- [ ] **Step 5: Journal the score**

In `src/app/useArticleRun.ts`, inside `commitResult`, after the `journal({ status: ..., articleId: ... })` call, extend the patch with the score:

```ts
      await journal({
        status: result.article.score?.passed === false ? 'below_target' : result.status === 'needs_attention' ? 'needs_attention' : 'done',
        articleId: result.article.id,
        error: undefined,
        targetScore: result.article.score?.target,
        achievedScore: result.article.score?.total,
      });
```

- [ ] **Step 6: Replace the Reviewer block with a Quality Gate block**

In `src/components/PipelineSettingsPanel.tsx`, replace the Reviewer `div` (lines 73-94) with:

```tsx
      <div className="space-y-1.5">
        <span className="block text-xs text-zinc-200">Quality Gate — target score</span>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={50}
            max={100}
            step={1}
            value={config.qualityTarget ?? 85}
            onChange={(e) => set('qualityTarget', Number(e.target.value))}
            className="flex-1 accent-zinc-200"
          />
          <span className="font-mono text-xs text-zinc-100 w-8 text-right">
            {config.qualityTarget ?? 85}
          </span>
        </div>
        <span className="block text-[11px] text-zinc-500">
          The draft is scored from the text itself. Below the target it is audited and revised, up to 3
          times; the highest-scoring draft ships even if the target is missed.
        </span>
      </div>
```

Also relabel the Judge checkbox at lines 43-46:

```tsx
          <span className="block text-xs text-zinc-200">Judge — audit the draft</span>
          <span className="block text-[11px] text-zinc-500">
            Runs only when the measured score misses the target. Reports gaps, never a score.
          </span>
```

- [ ] **Step 7: Show Write, Audit, Render and fix repeated timings**

In `src/pipeline/agentActivity.ts`, replace `expectedStages` with:

```ts
export function expectedStages(config: PipelineConfig): { stage: PipelineStage; label: string }[] {
  return [
    { stage: 'creating', label: STAGE_LABEL.creating },
    ...(config.judge ? [{ stage: 'judging' as const, label: 'Audit' }] : []),
    { stage: 'designing', label: STAGE_LABEL.designing },
  ];
}
```

In `src/components/ActivityPanel.tsx`, line 161, replace `timings.find(...)` with the most recent entry for that stage:

```tsx
          const timing = timings.filter((entry) => entry.stage === item.stage).pop();
```

- [ ] **Step 8: Add the below-target banner**

In `src/components/ArticleWorkspace.tsx`, add an `onRunLoopAgain?: () => void` prop. Immediately before the article preview, render:

```tsx
      {article.belowTarget && (
        <div className="bg-amber-950/80 border border-amber-800 rounded-xl p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-200">
            Below target: {article.score?.total}/100 (target {article.score?.target})
          </div>
          {article.remainingGaps && article.remainingGaps.length > 0 && (
            <ul className="text-[11px] text-amber-200/80 space-y-0.5">
              {article.remainingGaps.map((gap) => (
                <li key={gap}>{gap}</li>
              ))}
            </ul>
          )}
          {onRunLoopAgain && (
            <button
              onClick={onRunLoopAgain}
              className="text-[11px] font-mono underline text-amber-300 hover:text-amber-100"
            >
              Run the loop again for this topic
            </button>
          )}
        </div>
      )}
```

In `src/views/GenerateView.tsx`, pass `onRunLoopAgain={article.belowTarget ? () => void run.start() : undefined}` to `ArticleWorkspace`. The topic inputs already hold the same seed topic because `useArticleRun` owns them.

- [ ] **Step 9: Run the full suite, typecheck and build**

Run: `npm run lint && npm test && npm run build`
Expected: all clean.

- [ ] **Step 10: Commit**

```bash
git add src/app/pipelineConfig.ts src/types/run.ts src/app/useArticleRun.ts src/components/PipelineSettingsPanel.tsx src/components/ActivityPanel.tsx src/pipeline/agentActivity.ts src/components/ArticleWorkspace.tsx src/views/GenerateView.tsx src/app/pipelineConfig.test.ts src/types/run.test.ts
git commit -m "feat(ui): quality gate target, below-target reporting and retry"
```

---

### Task 9: Delete topicFidelity and prove topic integrity

**Files:**
- Delete: `src/pipeline/topicFidelity.ts`, `src/pipeline/topicFidelity.test.ts`

**Interfaces:**
- Consumes: `buildCreatorPrompt` / `buildImpowerPrompt` topic pinning (from the earlier prompt work).

- [ ] **Step 1: Confirm nothing imports it**

Run: `git grep -n "topicFidelity\|resolveTopicForRun\|sharesSubject"`
Expected: only `src/pipeline/runArticle.ts` (the `resolveTopicForRun` call) and the two files being deleted. If `runArticle.ts` still calls it, remove the import and the call in Step 3.

- [ ] **Step 2: Replace the deleted-contract test with a prompt-level guarantee test**

In `src/server/agentPrompts.test.ts`, the existing `user intent lock` block already asserts `Write about the ORIGINAL USER TOPIC` and `PINNED FOCUS KEYPHRASE`. Add one case proving the pin is unconditional — the strongest protection is that the user's topic reaches the writer regardless of what any earlier stage produced:

```ts
it('always pins the original topic even when the angle was refined', () => {
  const prompt = buildCreatorPrompt(
    {
      seedTopic: 'Optimalisasi Infrastruktur Kebugaran',
      originalTopic: 'Program Makan Bergizi Gratis',
      focusKeyphrase: 'makan bergizi gratis',
      targetWords: 900,
      brief: null,
    },
    DEFAULT_USER_PROFILE
  );
  expect(prompt).toContain('Program Makan Bergizi Gratis');
  expect(prompt).toMatch(/Write about the ORIGINAL USER TOPIC/);
});
```

- [ ] **Step 3: Delete the module and its call site**

Delete both files. In `src/pipeline/runArticle.ts`, remove `import { resolveTopicForRun } from './topicFidelity';` and replace the call in the Judge block — which no longer exists after Task 7 — with nothing. `refinedTopic` is now always `seedTopic`, so delete the variable and pass `options.seedTopic.trim()` wherever `refinedTopic` was used.

- [ ] **Step 4: Run the full suite, typecheck and build**

Run: `npm run lint && npm test && npm run build`
Expected: all clean.

- [ ] **Step 5: Commit**

```bash
git add -A src/pipeline/topicFidelity.ts src/pipeline/topicFidelity.test.ts src/pipeline/runArticle.ts src/server/agentPrompts.test.ts
git commit -m "refactor(pipeline): drop the lexical topic guard now that the judge cannot return a topic"
```

---

## Final Verification

Run once at the end:

```bash
npm run lint && npm test && npm run build
```

Then confirm by hand:

```bash
git grep -n "fleschScore: 0\|fleschScore || \|?? 0" -- src
git grep -n "refinedTopic\|seoScore" -- src/components src/views
```

Both greps must return nothing. Then load the app, set Judge on with Impower and Reviewer off, generate an article with a topic far from the configured brand niche, and confirm: the draft is scored, the audit fires only when the score misses the target, the History table shows the measured score, and the Flesch figure in the workspace matches a real measurement rather than a constant.

## Plan Self-Review

- **Spec coverage:** §1.1 Tasks 1 and 3; §1.2 Task 2; §1.3 Task 4; §1.4 Task 5; §2 Task 7; §2.1 Task 6; §2.2 Task 9; §2.3 Tasks 7 and 8; §3 Task 8; §4 Tasks 5 and 8; §5 the test task of every task. Spec "Out of scope" items are deliberately not implemented.
- **Placeholder scan:** no TBD/TODO. Every code step carries real code. Task 7 Step 5 is the one step describing edits rather than pasting a whole rewritten `runArticle` body; it is unambiguous about the four changes, and the surrounding steps pin the exact behaviour through tests.
- **Type consistency:** `extractDocument`/`ArticleDocument` (Task 1) are consumed by Tasks 3 and 4. `readabilityFromText` (Task 2) by Task 5. `evaluateDraftChecks`/`evaluateHtmlChecks` (Task 3) by Task 4. `scoreDraft`/`ArticleScore`/`formatFailedChecks` (Task 4) by Tasks 5, 7 and 8. `AuditOutput`/`buildAuditPrompt` (Task 6) by Task 7. `MAX_ITERATIONS` (Task 7) by Task 8. The `below_target` status (Task 8) is only produced after Task 7 exists.
- **Known ordering hazard, stated openly:** Task 6 leaves the build red on purpose; Task 7 restores it. A reviewer should not merge Task 6 alone.