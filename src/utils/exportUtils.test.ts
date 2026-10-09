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

  it('derives a JSON package per language from the markup it exports', () => {
    const files = buildArticleFolder(
      article({
        formats: {
          'inline-en': '<article><h1>EN</h1><p>English body</p></article>',
          'inline-id': '<article><h1>ID</h1><p>Body Indonesia</p></article>',
        },
        // No clean render, so each package is built on the inline markup.
        cleanHtml: '',
        secondaryKeywords: 'treadmill price, gym equipment',
        profileSnapshot: { niche: 'Gym Planning' } as GeneratedArticle['profileSnapshot'],
      })
    );
    const en = JSON.parse(files.find((f) => f.name === 'treadmill-guide-json-en.json')!.content);
    const id = JSON.parse(files.find((f) => f.name === 'treadmill-guide-json-id.json')!.content);

    expect(en.body).toBe('<p>English body</p>');
    expect(id.body).toBe('<p>Body Indonesia</p>');
    expect(en.category).toBe('Gym Planning');
    // The Indonesian form has no field for slug, category, date or keywords, so
    // a package naming them would have the CMS drop them.
    expect(Object.keys(id)).toEqual(['title', 'excerpt', 'tags', 'meta', 'body']);
    expect(Object.keys(en)).toEqual([
      'title',
      'slug',
      'category',
      'date',
      'excerpt',
      'tags',
      'keywords',
      'meta',
      'body',
    ]);
  });

  it('packages the clean render and ships none for a language without HTML', () => {
    // Long enough that the clean render counts as complete and ships as it is.
    const cleanEn =
      '<article><p>Commercial treadmills are built around a welded steel frame, a serviceable ' +
      'motor and a belt wide enough for a natural stride, which is what keeps a busy facility ' +
      'running.</p></article>';
    const files = buildArticleFolder(
      article({
        formats: {
          'inline-en': '<article><p>Inline body the package should not use</p></article>',
          'clean-en': cleanEn,
        },
      })
    );
    const en = JSON.parse(files.find((f) => f.name === 'treadmill-guide-json-en.json')!.content);
    expect(en.body).toContain('welded steel frame');
    expect(files.some((f) => f.name === 'treadmill-guide-json-id.json')).toBe(false);
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
