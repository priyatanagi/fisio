import { describe, it, expect } from 'vitest';
import { containsStrongFigure, extractDocument, markdownToPlainText } from './document';

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

  it('removes a four-backtick fence without leaking the code inside it', () => {
    const source = '````\n```\nbaris dalam kode\n```\n````\n\nParagraf.';
    expect(markdownToPlainText(source)).toBe('Paragraf.');
  });

  it('removes an unclosed final fence', () => {
    expect(markdownToPlainText('Paragraf.\n\n```\nkode yang bocor')).toBe('Paragraf.');
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

  it('measures the same corpus from a markdown draft and its rendered html', () => {
    const draft = '# Judul Utama\n\nParagraf pertama.\n\n## Sub Judul\n\nParagraf kedua.';
    const rendered =
      '<h1>Judul Utama</h1><p>Paragraf pertama.</p><h2>Sub Judul</h2><p>Paragraf kedua.</p>';
    const fromMarkdown = extractDocument(draft, 'markdown');
    const fromHtml = extractDocument(rendered, 'html');

    for (const text of [fromMarkdown.text, fromHtml.text]) {
      expect(text).toContain('Judul Utama');
      expect(text).toContain('Sub Judul');
      expect(text).toContain('Paragraf pertama');
      expect(text).toContain('Paragraf kedua.');
    }
    expect(fromMarkdown.text).toBe(fromHtml.text);
    expect(fromMarkdown.paragraphs).toEqual(['Paragraf pertama.', 'Paragraf kedua.']);
    expect(fromHtml.paragraphs).toEqual(['Paragraf pertama.', 'Paragraf kedua.']);
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

  it('returns plain prose for markdown headings, matching the html path', () => {
    const draft = '## **Judul** dan [tautan](https://example.com)\n\nParagraf.';
    const rendered =
      '<h2><strong>Judul</strong> dan <a href="https://example.com">tautan</a></h2><p>Paragraf.</p>';
    const fromMarkdown = extractDocument(draft, 'markdown');
    const fromHtml = extractDocument(rendered, 'html');
    expect(fromMarkdown.headings).toEqual([{ level: 2, text: 'Judul dan tautan' }]);
    expect(fromMarkdown.headings).toEqual(fromHtml.headings);
  });

  it('keeps a heading that is immediately followed by prose', () => {
    const doc = extractDocument('# Judul\nTeks langsung.\n\n## Sub\nParagraf kedua.', 'markdown');
    expect(doc.headings).toEqual([
      { level: 1, text: 'Judul' },
      { level: 2, text: 'Sub' },
    ]);
    expect(doc.paragraphs).toEqual(['Teks langsung.', 'Paragraf kedua.']);
    expect(doc.text).toBe('Judul Teks langsung. Sub Paragraf kedua.');
  });

  it('treats a list block as one paragraph and not as headings', () => {
    const doc = extractDocument('- satu\n- dua\n- tiga', 'markdown');
    expect(doc.headings).toEqual([]);
    expect(doc.paragraphs).toEqual(['satu dua tiga']);
    expect(doc.text).toBe('satu dua tiga');
  });

  it('drops a horizontal rule and an image-only block instead of counting them as paragraphs', () => {
    const doc = extractDocument('Paragraf satu.\n\n---\n\nParagraf dua.', 'markdown');
    expect(doc.paragraphs).toEqual(['Paragraf satu.', 'Paragraf dua.']);
    expect(doc.text).toBe('Paragraf satu. Paragraf dua.');

    const withImage = extractDocument(
      'Paragraf satu.\n\n![Gambar satu](https://example.com/a.jpg)',
      'markdown'
    );
    expect(withImage.paragraphs).toEqual(['Paragraf satu.']);
  });

  it('gives a draft the same faq and strong-figure verdict as its render', () => {
    const draft = '## Pertanyaan Umum\n\nHasilnya **40%** lebih baik.';
    const rendered =
      '<h2>Pertanyaan Umum</h2><p>Hasilnya <strong>40%</strong> lebih baik.</p>';
    const fromMarkdown = extractDocument(draft, 'markdown');
    const fromHtml = extractDocument(rendered, 'html');
    expect(fromMarkdown.hasFaqSignal).toBe(true);
    expect(fromMarkdown.hasStrongFigure).toBe(true);
    expect(fromMarkdown.hasFaqSignal).toBe(fromHtml.hasFaqSignal);
    expect(fromMarkdown.hasStrongFigure).toBe(fromHtml.hasStrongFigure);
  });

  it('reads a strong figure out of inline html inside a draft', () => {
    const draft = extractDocument('Hasilnya <strong>40%</strong> lebih baik.', 'markdown');
    const rendered = extractDocument('<p>Hasilnya <strong>40%</strong> lebih baik.</p>', 'html');
    expect(draft.hasStrongFigure).toBe(true);
    expect(draft.hasStrongFigure).toBe(rendered.hasStrongFigure);
  });

  it('reports no faq or strong figure for a draft that has neither', () => {
    const doc = extractDocument('# Judul\n\nParagraf biasa tanpa angka.', 'markdown');
    expect(doc.hasFaqSignal).toBe(false);
    expect(doc.hasStrongFigure).toBe(false);
  });

  it('shares one strong-figure rule between drafts and rendered html', () => {
    expect(containsStrongFigure('<strong>40%</strong>')).toBe(true);
    expect(containsStrongFigure('**40%**')).toBe(true);
    expect(containsStrongFigure('<b>40%</b>')).toBe(true);
    expect(containsStrongFigure('<aside>Catatan</aside>')).toBe(true);
    expect(containsStrongFigure('<strong>\n40%\n</strong>')).toBe(true);
    expect(containsStrongFigure('<strong>tebal</strong>')).toBe(false);
    expect(containsStrongFigure('**tebal**')).toBe(false);
    expect(containsStrongFigure('Teks biasa.')).toBe(false);
  });
});