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
    expect(pass(evaluateDraftChecks(extractDocument(markdown, 'markdown'), metadata, 'k'), 'statistical_eeat')).toBe(false);
    const wordOnly = markdown.replace('Distribusi dilakukan', '**Distribusi** dilakukan');
    expect(pass(evaluateDraftChecks(extractDocument(wordOnly, 'markdown'), metadata, 'k'), 'statistical_eeat')).toBe(false);
  });

  it('passes the statistical check when a figure is emphasised, however it is marked up', () => {
    const bolded = markdown.replace('Distribusi dilakukan', '**Distribusi 40%** dilakukan');
    expect(pass(evaluateDraftChecks(extractDocument(bolded, 'markdown'), metadata, 'k'), 'statistical_eeat')).toBe(true);
    const tagged = markdown.replace('Distribusi dilakukan', '<b>Distribusi 40%</b> dilakukan');
    expect(pass(evaluateDraftChecks(extractDocument(tagged, 'markdown'), metadata, 'k'), 'statistical_eeat')).toBe(true);
  });

  it('scores the h2 paragraph rule from the paragraphs that follow each heading', () => {
    const deep = '## Sasaran\n\nSatu. Dua. Tiga.\n\nEmpat. Lima. Enam.';
    expect(pass(evaluateDraftChecks(extractDocument(deep, 'markdown'), metadata, 'k'), 'h2_paragraph_rule')).toBe(true);

    const shallow = deep + '\n\n## Mekanisme\n\nTujuh. Delapan. Sembilan.';
    expect(pass(evaluateDraftChecks(extractDocument(shallow, 'markdown'), metadata, 'k'), 'h2_paragraph_rule')).toBe(false);
  });

  it('counts two paragraphs per h2 for a draft and its render alike', () => {
    const draft =
      '## Sasaran\n\nSatu. Dua. Tiga.\n\nEmpat. Lima. Enam.\n\n' +
      '## Mekanisme\n\nTujuh. Delapan. Sembilan.\n\nSepuluh. Sebelas. Dua belas.';
    const html =
      '<h2>Sasaran</h2><p>Satu. Dua. Tiga.</p><p>Empat. Lima. Enam.</p>' +
      '<h2>Mekanisme</h2><p>Tujuh. Delapan. Sembilan.</p><p>Sepuluh. Sebelas. Dua belas.</p>';
    expect(pass(evaluateDraftChecks(extractDocument(draft, 'markdown'), metadata, 'k'), 'h2_paragraph_rule')).toBe(true);
    expect(pass(evaluateDraftChecks(extractDocument(html, 'html'), metadata, 'k'), 'h2_paragraph_rule')).toBe(true);
  });

  it('falls back to the metadata keyphrase when no focus keyphrase is supplied', () => {
    const items = evaluateDraftChecks(extractDocument(markdown, 'markdown'), metadata);
    expect(pass(items, 'keyphrase_in_p1')).toBe(true);
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

  it('accepts the same faq signals the extractor reports, Indonesian included', () => {
    const english = evaluateHtmlChecks(extractDocument('<details><summary>FAQ</summary><p>Jawaban.</p></details>', 'html'));
    const indonesian = evaluateHtmlChecks(extractDocument('<section class="pertanyaan"><p>Jawaban.</p></section>', 'html'));
    const none = evaluateHtmlChecks(extractDocument('<p>Jawaban.</p>', 'html'));
    expect(pass(english, 'faq_schema')).toBe(true);
    expect(pass(indonesian, 'faq_schema')).toBe(true);
    expect(pass(none, 'faq_schema')).toBe(false);
  });

  it('passes links only when the render carries two anchors', () => {
    const two = evaluateHtmlChecks(extractDocument('<a href="/a">A</a><a href="/b">B</a>', 'html'));
    expect(pass(two, 'contextual_links')).toBe(true);
    expect(pass(evaluateHtmlChecks(extractDocument('<a href="/a">A</a>', 'html')), 'contextual_links')).toBe(false);
  });
});

describe('evaluateSeoChecklist', () => {
  it('still composes all 17 checks for html', () => {
    const report = evaluateSeoChecklist('<h2>S</h2><p>Teks satu. Teks dua. Teks tiga.</p>', metadata, 'makan bergizi gratis');
    expect(report.totalCount).toBe(17);
    expect(new Set(report.items.map((i) => i.id)).size).toBe(17);
    expect(report.score).toBe(Math.round((report.passedCount / report.totalCount) * 100));
  });

  it('falls back to the metadata keyphrase when the focus input is cleared', () => {
    const html =
      '<h2>Sasaran makan bergizi gratis</h2><p>Program makan bergizi gratis menyediakan makan siang.</p>';
    expect(evaluateSeoChecklist(html, metadata, '').keyphraseOccurrences).toBe(2);
  });
});