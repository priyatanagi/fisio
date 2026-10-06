import { describe, it, expect } from 'vitest';
import {
  stripRootBackground,
  stripRootWidth,
  alignHeaderWithReference,
  normalizeRenderedHtml,
  structuralGaps,
  structureSignature,
} from './articleShell';

/** The real shape from a bad run: a grey page painted onto the article root. */
const greyArticle =
  '<article style="font-family: system-ui; color: #333940; background-color: #f8fafc; max-width: 1000px; margin: 0 auto; padding: 20px;">' +
  '<header style="text-align: center; padding-bottom: 30px; border-bottom: 1px solid #ccc;">' +
  '<h1 style="font-size: 2em;">Title</h1></header>' +
  '<aside class="data-callout" style="background: #f8fafc;"><strong>Note:</strong> text</aside>' +
  '</article>';

const cleanDoc =
  '<style>:root{--bg:#f8fafc;} .post{background:#f8fafc;max-width:840px;} .post h2{color:#111;}</style>' +
  '<article class="post"><header><h1>Judul</h1></header><p>Isi artikel.</p></article>';

describe('stripRootBackground', () => {
  it('removes the page background from the article root', () => {
    expect(stripRootBackground(greyArticle)).not.toContain('background-color');
  });

  it('keeps every non-background declaration on the root', () => {
    const root = stripRootBackground(greyArticle).match(/<article[^>]*>/)?.[0] ?? '';
    expect(root).toContain('font-family: system-ui');
    expect(root).toContain('color: #333940');
    expect(root).toContain('padding: 20px');
    expect(root).not.toContain('background');
  });

  it('removes the page background from the article root', () => {
    const root = stripRootBackground(greyArticle).match(/<article[^>]*>/)?.[0] ?? '';
    expect(root).not.toContain('background');
  });

  it('leaves a component background alone, because a callout is not the page', () => {
    const out = stripRootBackground(greyArticle);
    const aside = out.match(/<aside[^>]*>/)?.[0] ?? '';
    expect(aside).toContain('background: #f8fafc');
  });

  it('keeps the border and alignment on the header', () => {
    expect(stripRootBackground(greyArticle)).toContain('border-bottom: 1px solid #ccc');
  });

  it('strips the background from a page-level stylesheet rule', () => {
    expect(stripRootBackground(cleanDoc)).not.toMatch(/\.post\{[^}]*background/);
  });

  it('keeps background on a component rule in the stylesheet', () => {
    const withCallout = cleanDoc.replace(
      '.post h2{color:#111;}',
      '.post h2{color:#111;} .post .faq{background:#f8fafc;}'
    );
    expect(stripRootBackground(withCallout)).toContain('.post .faq{background:#f8fafc}');
  });

  it('keeps other declarations of the rule it rewrites', () => {
    expect(stripRootBackground(cleanDoc)).toContain('color:#111');
  });

  it('leaves the custom property definition in place', () => {
    expect(stripRootBackground(cleanDoc)).toContain('--bg:#f8fafc');
  });

  it('returns an empty document unchanged', () => {
    expect(stripRootBackground('')).toBe('');
  });
});

describe('stripRootWidth', () => {
  it('releases the article to the full container width', () => {
    const out = stripRootWidth(greyArticle);
    expect(out).not.toContain('max-width: 1000px');
    expect(out).not.toContain('margin: 0 auto');
  });

  it('keeps the padding that positions the text', () => {
    expect(stripRootWidth(greyArticle)).toContain('padding: 20px');
  });

  it('keeps the measure on the paragraphs, where it belongs', () => {
    const measured = '<article style="max-width: 1000px;"><p style="max-width: 68ch;">Text</p></article>';
    expect(stripRootWidth(measured)).toContain('<p style="max-width: 68ch;">');
  });

  it('splits a grouped rule so the page loses the cap and the paragraph keeps it', () => {
    const grouped = '<style>body, article, p{color:#333;max-width:68ch;}</style><article><p>Text</p></article>';
    const out = stripRootWidth(grouped);
    // The page selectors keep the colour but not the width cap...
    expect(out).toMatch(/body,\s*article\s*\{\s*color:\s*#333;?\s*\}/);
    expect(out).not.toMatch(/body,\s*article\s*\{[^}]*max-width/);
    // ...and the paragraph keeps both, which is where the measure belongs.
    expect(out).toMatch(/p\s*\{[^}]*max-width:\s*68ch/);
  });

  it('returns an empty document unchanged', () => {
    expect(stripRootWidth('')).toBe('');
  });
});

describe('alignHeaderWithReference', () => {
  const english =
    '<article><header style="text-align: center; border-bottom: 1px solid #ccc;"><h1>Title</h1></header><p>Body</p></article>';
  const indonesian = '<article><h1>Judul</h1><p>Isi</p></article>';

  it('gives a language that dropped the header the reference styling', () => {
    const out = alignHeaderWithReference(indonesian, english);
    expect(out).toContain('<header style="text-align: center; border-bottom: 1px solid #ccc;">');
    expect(out).toContain('</header>');
  });

  it('keeps the language own text inside the borrowed header', () => {
    expect(alignHeaderWithReference(indonesian, english)).toContain('<h1>Judul</h1>');
  });

  it('restyles a header that exists with a different one', () => {
    const drifted = '<article><header style="padding: 4px;"><h1>Judul</h1></header></article>';
    expect(alignHeaderWithReference(drifted, english)).toContain('border-bottom: 1px solid #ccc');
  });

  it('closes the header it opens', () => {
    const opens = (alignHeaderWithReference(indonesian, english).match(/<header/g) ?? []).length;
    const closes = (alignHeaderWithReference(indonesian, english).match(/<\/header>/g) ?? []).length;
    expect(opens).toBe(closes);
  });

  it('does nothing when there is no reference to copy', () => {
    expect(alignHeaderWithReference(indonesian, '')).toBe(indonesian);
    expect(alignHeaderWithReference(indonesian)).toBe(indonesian);
  });

  it('leaves a document with no h1 alone', () => {
    const noH1 = '<article><p>Body only</p></article>';
    expect(alignHeaderWithReference(noH1, english)).toBe(noH1);
  });
});

describe('structuralGaps', () => {
  it('names the elements the second language dropped', () => {
    const gaps = structuralGaps(
      '<article><header><h1>T</h1></header><p>a</p></article>',
      '<article><h1>T</h1><p>a</p></article>'
    );
    expect(gaps).toContain('header');
  });

  it('reports nothing when the two languages agree', () => {
    const html = '<article><header><h1>T</h1></header><p>a</p></article>';
    expect(structuralGaps(html, html)).toEqual([]);
  });

  it('ignores scripts and styles, which are not structure', () => {
    const html = '<article><style>p{color:red}</style><script>var a=1</script><p>a</p></article>';
    expect(structureSignature(html)).toEqual(['article', 'p']);
  });
});

describe('normalizeRenderedHtml', () => {
  it('clears the background and the width cap in one pass', () => {
    const out = normalizeRenderedHtml(greyArticle);
    expect(out).not.toContain('#f8fafc; max-width');
    expect(out).not.toMatch(/background-color: #f8fafc/);
    expect(out).not.toContain('max-width: 1000px');
  });

  it('keeps the article content intact', () => {
    expect(normalizeRenderedHtml(greyArticle)).toContain('<strong>Note:</strong>');
  });
});