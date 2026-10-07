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

  it('includes a JSON package as a .json file', () => {
    const files = buildArticleFolder(
      article({
        formats: {
          ...article().formats,
          'json-en': JSON.stringify({ title: 'Treadmill guide', body: '<p>Body</p>' }),
        },
      })
    );
    const pkg = files.find((f) => f.name === 'treadmill-guide-json-en.json');
    expect(JSON.parse(pkg!.content)).toHaveProperty('title', 'Treadmill guide');
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
