import { describe, it, expect } from 'vitest';
import {
  buildArticleJson,
  extractJsonBody,
  isJsonFormat,
  jsonPackageBody,
  serializeArticleJson,
  syncJsonFormats,
} from './articleJson';
import type { SeoMetadata } from '../types/article';

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
  it('produces the package in publishing order', () => {
    expect(buildArticleJson({ metadata, generatedAt: GENERATED_AT, bodyHtml: '<p>Body</p>' })).toEqual({
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

  it('fills gaps from the article around them', () => {
    const bare: SeoMetadata = {
      seoTitle: 'Bare title',
      headline: '',
      focusKeyphrase: 'treadmill',
      metaDescription: 'The description.',
      urlSlug: 'bare',
      tags: [],
    };
    const pkg = buildArticleJson({
      metadata: bare,
      generatedAt: GENERATED_AT,
      bodyHtml: '<p>Body</p>',
      categoryFallback: 'Commercial fitness supplier and facility planning',
      keywordFallback: ['treadmill price', 'commercial treadmill'],
    });
    expect(pkg.title).toBe('Bare title');
    expect(pkg.category).toBe('Commercial fitness supplier and facility planning');
    expect(pkg.excerpt).toBe('The description.');
    // The focus keyphrase leads, and a fallback list that repeats it adds no duplicate.
    expect(pkg.keywords).toEqual(['treadmill', 'treadmill price', 'commercial treadmill']);
  });

  it('serialises with the body as one JSON string', () => {
    const raw = serializeArticleJson({ metadata, generatedAt: GENERATED_AT, bodyHtml: '<p>Body</p>' });
    expect(JSON.parse(raw)).toMatchObject({ title: metadata.headline });
    expect(raw).toContain('"body": "<p>Body</p>"');
  });
});

describe('syncJsonFormats', () => {
  const formats = {
    'inline-en': '<article><p>English</p></article>',
    'clean-en': '<style>:root{}</style><article><p>English clean</p></article>',
    'inline-id': '<article><p>Indonesia</p></article>',
    'json-en': '{"stale":true}',
    'json-id': '',
  };

  it('recognises only the package formats', () => {
    expect(isJsonFormat('json-id')).toBe(true);
    expect(isJsonFormat('clean-id')).toBe(false);
  });

  it('rebuilds every package from the clean body of its own language', () => {
    const next = syncJsonFormats(formats, metadata, GENERATED_AT);
    expect(JSON.parse(next['json-en']!).body).toBe('<p>English clean</p>');
    expect(JSON.parse(next['json-id']!).body).toBe('<p>Indonesia</p>');
  });

  it('leaves the HTML formats untouched', () => {
    const next = syncJsonFormats(formats, metadata, GENERATED_AT);
    expect(next['clean-en']).toBe(formats['clean-en']);
  });

  it('drops a package whose language has no rendered HTML', () => {
    const next = syncJsonFormats(
      { 'inline-en': '<p>x</p>', 'json-en': '', 'json-id': '' },
      metadata,
      GENERATED_AT
    );
    expect(next['json-id']).toBeUndefined();
    expect(next['json-en']).toBeDefined();
  });

  it('takes a body rendered for the package alone out of the extras', () => {
    const next = syncJsonFormats(
      { 'json-en': '' },
      metadata,
      GENERATED_AT,
      { bodyHtml: { en: '<article><p>Body only</p></article>' } }
    );
    expect(Object.keys(next)).toEqual(['json-en']);
    expect(JSON.parse(next['json-en']!).body).toBe('<p>Body only</p>');
  });

  it('keeps the body of a package no HTML format was checked for', () => {
    const stored = serializeArticleJson({
      metadata,
      generatedAt: GENERATED_AT,
      bodyHtml: '<p>Body</p>',
    });
    const next = syncJsonFormats(
      { 'json-en': stored },
      { ...metadata, headline: 'A new headline' },
      GENERATED_AT
    );
    const parsed = JSON.parse(next['json-en']!);
    expect(parsed.title).toBe('A new headline');
    expect(parsed.body).toBe('<p>Body</p>');
  });

  it('still drops a blank package whose language has no HTML format', () => {
    expect(syncJsonFormats({ 'json-en': '' }, metadata, GENERATED_AT)['json-en']).toBeUndefined();
  });

  it('drops a package whose HTML format was emptied', () => {
    const stored = serializeArticleJson({
      metadata,
      generatedAt: GENERATED_AT,
      bodyHtml: '<p>Body</p>',
    });
    const next = syncJsonFormats({ 'inline-en': '', 'json-en': stored }, metadata, GENERATED_AT);
    expect(next['json-en']).toBeUndefined();
  });

  it('does not touch formats that hold no package', () => {
    const html = { 'inline-en': '<p>x</p>' };
    expect(syncJsonFormats(html, metadata, GENERATED_AT)).toEqual(html);
  });
});

describe('jsonPackageBody', () => {
  it('reads the body back out of a package', () => {
    const raw = serializeArticleJson({ metadata, generatedAt: GENERATED_AT, bodyHtml: '<p>Body</p>' });
    expect(jsonPackageBody(raw)).toBe('<p>Body</p>');
  });

  it('returns nothing for text that is not a package', () => {
    expect(jsonPackageBody('<article><p>HTML</p></article>')).toBe('');
    expect(jsonPackageBody('{"body":123}')).toBe('');
  });
});
