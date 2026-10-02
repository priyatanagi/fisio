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