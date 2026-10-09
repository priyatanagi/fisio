import { describe, it, expect } from 'vitest';
import {
  buildArticleJson,
  extractJsonBody,
  jsonExportName,
  serializeArticleJson,
  type ArticleJsonPackage,
} from './articleJson';
import type { SeoMetadata } from '../types/article';

/** What `cms-extension/lib.js` fills the English form from. */
const FIELD_KEYS = ['title', 'slug', 'category', 'date', 'excerpt', 'tags', 'keywords', 'meta', 'body'];
/** What its Indonesian form has fields for — nothing else can be filled. */
const ID_SECTION_KEYS = ['title', 'excerpt', 'tags', 'meta', 'body'];

const metadata: SeoMetadata = {
  seoTitle: 'Buying Guide for Commercial Gym Equipment',
  headline: 'Complete Buying Guide for Heavy-Duty Commercial Gym Equipment in 2026',
  focusKeyphrase: 'commercial gym equipment',
  metaDescription: 'Discover key factors when investing in heavy-duty commercial machinery.',
  urlSlug: 'complete-buying-guide-heavy-duty-commercial-gym-equipment-2026',
  tags: ['Commercial Gym', 'Buying Guide'],
  category: 'Gym Planning',
  excerpt: 'Learn how to select durable, commercial-grade fitness equipment.',
  keywords: ['heavy duty gym equipment', 'fitness machinery supplier'],
};

const GENERATED_AT = '2026-10-07T09:30:00Z';

describe('extractJsonBody', () => {
  const rendered = [
    '<style>:root{--primary:#cc2929}</style>',
    '<article class="post">',
    '  <header>',
    '    <h1 style="color:#cc2929">Complete Buying Guide</h1>',
    '    <p class="dek">A short standfirst.</p>',
    '  </header>',
    '  <h2>Key Equipment Types</h2>',
    '  <p>Investing in <strong>commercial</strong> equipment needs planning.</p>',
    '  <script>{"@type":"FAQPage"}</script>',
    '</article>',
    '<script>document.querySelectorAll("details");</script>',
  ].join('\n');

  it('keeps the running markup and drops everything the package already carries', () => {
    expect(extractJsonBody(rendered)).toBe(
      '<p class="dek">A short standfirst.</p><h2>Key Equipment Types</h2>' +
        '<p>Investing in <strong>commercial</strong> equipment needs planning.</p>'
    );
  });

  it('passes through markup that has no wrapper to remove', () => {
    expect(extractJsonBody('<h2>A</h2>\n<p>B</p>')).toBe('<h2>A</h2><p>B</p>');
  });
});

describe('buildArticleJson', () => {
  it('produces the English package in the order the extension reads it', () => {
    const pkg = buildArticleJson({
      language: 'en',
      metadata,
      generatedAt: GENERATED_AT,
      bodyHtml: '<p>Body</p>',
    });
    expect(Object.keys(pkg)).toEqual(FIELD_KEYS);
    expect(pkg).toEqual({
      title: metadata.headline,
      slug: metadata.urlSlug,
      category: 'Gym Planning',
      date: '2026-10-07',
      excerpt: 'Learn how to select durable, commercial-grade fitness equipment.',
      tags: ['Commercial Gym', 'Buying Guide'],
      keywords: ['commercial gym equipment', 'heavy duty gym equipment', 'fitness machinery supplier'],
      meta: metadata.metaDescription,
      body: '<p>Body</p>',
    });
  });

  it('produces only the five fields the Indonesian form can receive', () => {
    const pkg = buildArticleJson({
      language: 'id',
      metadata,
      generatedAt: GENERATED_AT,
      bodyHtml: '<article><p>Isi</p></article>',
    });
    // Slug, category, date and keywords belong to the English side of the CMS.
    expect(Object.keys(pkg)).toEqual(ID_SECTION_KEYS);
    expect(pkg).toEqual({
      title: metadata.headline,
      excerpt: 'Learn how to select durable, commercial-grade fitness equipment.',
      tags: ['Commercial Gym', 'Buying Guide'],
      meta: metadata.metaDescription,
      body: '<p>Isi</p>',
    });
  });

  it('fills English gaps from the article around them', () => {
    const bare: SeoMetadata = {
      seoTitle: 'Bare title',
      headline: '',
      focusKeyphrase: 'treadmill',
      metaDescription: 'The description.',
      urlSlug: 'bare',
      tags: [],
    };
    const pkg = buildArticleJson({
      language: 'en',
      metadata: bare,
      generatedAt: GENERATED_AT,
      bodyHtml: '<p>Body</p>',
      categoryFallback: 'Commercial fitness supplier and facility planning',
      keywordFallback: ['treadmill price', 'commercial treadmill'],
    }) as ArticleJsonPackage;
    expect(pkg.title).toBe('Bare title');
    expect(pkg.category).toBe('Commercial fitness supplier and facility planning');
    expect(pkg.excerpt).toBe('The description.');
    // The focus keyphrase leads, and a fallback list that repeats it adds no duplicate.
    expect(pkg.keywords).toEqual(['treadmill', 'treadmill price', 'commercial treadmill']);
  });

  it('serialises with the body as one JSON string', () => {
    const raw = serializeArticleJson({
      language: 'en',
      metadata,
      generatedAt: GENERATED_AT,
      bodyHtml: '<p>Body</p>',
    });
    expect(JSON.parse(raw)).toMatchObject({ title: metadata.headline });
    expect(raw).toContain('"body": "<p>Body</p>"');
  });
});

describe('jsonExportName', () => {
  it('names the file so the extension can read the language off it', () => {
    expect(jsonExportName('treadmill-guide', 'en')).toBe('treadmill-guide-json-en.json');
    expect(jsonExportName('treadmill-guide', 'id')).toBe('treadmill-guide-json-id.json');
  });

  it('names an article without a slug after itself', () => {
    expect(jsonExportName('   ', 'id')).toBe('article-json-id.json');
  });
});
