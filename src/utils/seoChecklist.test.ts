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

  it('reaches the same verdicts from a draft and its render on an article both paths pass', () => {
    const draft =
      '## Sasaran Penerima\n\n' +
      'Program makan bergizi gratis menyediakan makan siang di sekolah dasar. Dapur berada di sekolah masing-masing.\n\n' +
      'Semua peserta tidak dipungut biaya. Pendaftaran dilakukan pada awal tahun ajaran.\n\n' +
      '## Mekanisme Distribusi\n\n' +
      'Distribusi berjalan setiap hari kerja. Pengambilan dilakukan pada jam istirahat.\n\n' +
      '- Butir pertama sudah dibagikan.\n- Butir kedua sudah dibagikan.\n\n' +
      'Data menunjukkan **40%** peserta makan bergizi gratis aktif setiap hari. Jadwal distribusi tetap berjalan.';
    const rendered =
      '<h2>Sasaran Penerima</h2>' +
      '<p>Program makan bergizi gratis menyediakan makan siang di sekolah dasar. Dapur berada di sekolah masing-masing.</p>' +
      '<p>Semua peserta tidak dipungut biaya. Pendaftaran dilakukan pada awal tahun ajaran.</p>' +
      '<h2>Mekanisme Distribusi</h2>' +
      '<p>Distribusi berjalan setiap hari kerja. Pengambilan dilakukan pada jam istirahat.</p>' +
      '<ul><li>Butir pertama sudah dibagikan.</li><li>Butir kedua sudah dibagikan.</li></ul>' +
      '<p>Data menunjukkan <strong>40%</strong> peserta makan bergizi gratis aktif setiap hari. Jadwal distribusi tetap berjalan.</p>';
    const fromDraft = evaluateDraftChecks(extractDocument(draft, 'markdown'), metadata, 'makan bergizi gratis');
    const fromHtml = evaluateDraftChecks(extractDocument(rendered, 'html'), metadata, 'makan bergizi gratis');

    const everyCheck = fromDraft.map((i) => i.id);
    for (const id of everyCheck) expect(pass(fromHtml, id)).toBe(pass(fromDraft, id));

    const shouldPass = [
      'keyphrase_in_p1',
      'statistical_eeat',
      'h2_paragraph_rule',
      'paragraph_depth',
      'no_h1_in_body',
      'heading_structure',
    ];
    for (const id of shouldPass) {
      expect(pass(fromDraft, id)).toBe(true);
      expect(pass(fromHtml, id)).toBe(true);
    }
  });

  it('reaches the same keyphrase density verdict from a draft and its render when it passes', () => {
    const opener =
      'Program makan bergizi gratis menyediakan makan siang di sekolah dasar. Dapur berada di sekolah masing-masing.';
    const filler =
      'Dapur sekolah menyiapkan makan siang di ruang kelas. Semua peserta menerima porsi yang sama.';
    const closer =
      'Survey terbaru menunjukkan program makan bergizi gratis berjalan di enam puluh persen sekolah.';
    const blocks = [opener, ...Array(18).fill(filler), closer];
    const draft = '## Sasaran\n\n' + blocks.join('\n\n');
    const rendered = '<h2>Sasaran</h2>' + blocks.map((b) => `<p>${b}</p>`).join('');
    const fromDraft = evaluateDraftChecks(extractDocument(draft, 'markdown'), metadata, 'makan bergizi gratis');
    const fromHtml = evaluateDraftChecks(extractDocument(rendered, 'html'), metadata, 'makan bergizi gratis');

    expect(pass(fromDraft, 'keyphrase_density')).toBe(true);
    expect(pass(fromHtml, 'keyphrase_density')).toBe(true);
  });

  it('does not let a list block stand in for a missing paragraph', () => {
    const draft =
      '## Sasaran\n\nProgram makan bergizi gratis menyediakan makan siang. Dapur berada di sekolah.\n\n' +
      '- Butir satu sudah dibagikan.\n- Butir dua sudah dibagikan.';
    const rendered =
      '<h2>Sasaran</h2><p>Program makan bergizi gratis menyediakan makan siang. Dapur berada di sekolah.</p>' +
      '<ul><li>Butir satu sudah dibagikan.</li><li>Butir dua sudah dibagikan.</li></ul>';
    const fromDraft = evaluateDraftChecks(extractDocument(draft, 'markdown'), metadata, 'makan bergizi gratis');
    const fromHtml = evaluateDraftChecks(extractDocument(rendered, 'html'), metadata, 'makan bergizi gratis');

    for (const id of ['h2_paragraph_rule', 'paragraph_depth']) {
      expect(pass(fromDraft, id)).toBe(false);
      expect(pass(fromHtml, id)).toBe(false);
    }
  });

  it('does not let a list block pass as the opening paragraph', () => {
    const draft =
      '## Sasaran\n\n- Program makan bergizi gratis dibagikan setiap hari kerja.\n- Butir kedua.\n\n' +
      'Paragraf pembuka yang tidak memuat frasa kunci.';
    const rendered =
      '<h2>Sasaran</h2><ul><li>Program makan bergizi gratis dibagikan setiap hari kerja.</li><li>Butir kedua.</li></ul>' +
      '<p>Paragraf pembuka yang tidak memuat frasa kunci.</p>';
    const fromDraft = evaluateDraftChecks(extractDocument(draft, 'markdown'), metadata, 'makan bergizi gratis');
    const fromHtml = evaluateDraftChecks(extractDocument(rendered, 'html'), metadata, 'makan bergizi gratis');

    expect(pass(fromDraft, 'keyphrase_in_p1')).toBe(false);
    expect(pass(fromHtml, 'keyphrase_in_p1')).toBe(false);
  });

  it('scores a loose list the same from a draft and from its render', () => {
    const items = [
      'Program makan bergizi gratis dibagikan setiap hari kerja. Peserta makan di kelas masing-masing.',
      'Butir kedua juga dibagikan tepat waktu. Jadwal tidak berubah.',
    ];
    const prose = [
      'Paragraf penutup bagian ini. Semuanya berjalan sesuai rencana.',
      'Paragraf tambahan bagian ini. Jadwal tetap berjalan setiap hari.',
    ];
    const draft =
      '## Sasaran\n\n' +
      items.map((i) => `- ${i}`).join('\n\n') +
      '\n\n' +
      prose.join('\n\n');
    const rendered =
      '<h2>Sasaran</h2><ul>' +
      items.map((i) => `<li><p>${i}</p></li>`).join('') +
      '</ul>' +
      prose.map((p) => `<p>${p}</p>`).join('');
    const fromDraft = evaluateDraftChecks(extractDocument(draft, 'markdown'), metadata, 'makan bergizi gratis');
    const fromHtml = evaluateDraftChecks(extractDocument(rendered, 'html'), metadata, 'makan bergizi gratis');

    for (const id of fromDraft.map((i) => i.id)) expect(pass(fromHtml, id)).toBe(pass(fromDraft, id));

    for (const id of ['keyphrase_in_p1', 'h2_paragraph_rule', 'paragraph_depth']) {
      expect(pass(fromDraft, id)).toBe(true);
      expect(pass(fromHtml, id)).toBe(true);
    }
  });

  it('scores a list written straight after a heading the same from a draft and its render', () => {
    const items = [
      '- penerima manfaat adalah anak sekolah dasar. Pendaftaran gratis untuk semua.',
      '- jadwal distribusi berjalan setiap hari kerja. Pengambilan saat jam istirahat.',
    ];
    const prose = [
      'Paragraf satu bagian ini. Kalimat kedua. Kalimat ketiga.',
      'Paragraf dua bagian ini. Kalimat kedua. Kalimat ketiga.',
      'Paragraf tiga bagian ini. Kalimat kedua. Kalimat ketiga.',
      'Paragraf empat bagian ini. Kalimat kedua. Kalimat ketiga.',
    ];

    for (const count of [3, 4]) {
      const draft = '## Sasaran\n' + items.join('\n') + '\n\n' + prose.slice(0, count).join('\n\n');
      const rendered =
        '<h2>Sasaran</h2><ul>' +
        items.map((item) => `<li>${item.slice(2)}</li>`).join('') +
        '</ul>' +
        prose.slice(0, count).map((p) => `<p>${p}</p>`).join('');
      const fromDraft = evaluateDraftChecks(extractDocument(draft, 'markdown'), metadata, 'makan bergizi gratis');
      const fromHtml = evaluateDraftChecks(extractDocument(rendered, 'html'), metadata, 'makan bergizi gratis');

      for (const id of fromDraft.map((i) => i.id)) expect(pass(fromHtml, id)).toBe(pass(fromDraft, id));
      // The heading keeps its prose paragraphs either way; only the depth threshold moves.
      expect(pass(fromDraft, 'h2_paragraph_rule')).toBe(true);
      expect(pass(fromHtml, 'h2_paragraph_rule')).toBe(true);
      expect(pass(fromDraft, 'paragraph_depth')).toBe(count === 4);
      expect(pass(fromHtml, 'paragraph_depth')).toBe(count === 4);
    }
  });

  it('reads a heading that follows list items the same from a draft and its render', () => {
    const first = 'Butir pertama Program makan bergizi gratis.';
    const second = 'Butir kedua Program makan bergizi gratis.';
    const tightDraft = `- ${first}\n## Sasaran Makan Bergizi Gratis\n## Mekanisme Distribusi`;
    const looseDraft = `- ${first}\n\n- ${second}\n## Sasaran Makan Bergizi Gratis\n## Mekanisme Distribusi`;
    const tightRender =
      `<ul><li>${first}</li></ul><h2>Sasaran Makan Bergizi Gratis</h2><h2>Mekanisme Distribusi</h2>`;
    const looseRender =
      `<ul><li><p>${first}</p></li><li><p>${second}</p></li></ul>` +
      `<h2>Sasaran Makan Bergizi Gratis</h2><h2>Mekanisme Distribusi</h2>`;

    for (const [draft, rendered] of [
      [tightDraft, tightRender],
      [looseDraft, looseRender],
    ]) {
      const fromDraft = evaluateDraftChecks(extractDocument(draft, 'markdown'), metadata, 'makan bergizi gratis');
      const fromHtml = evaluateDraftChecks(extractDocument(rendered, 'html'), metadata, 'makan bergizi gratis');

      for (const id of fromDraft.map((i) => i.id)) expect(pass(fromHtml, id)).toBe(pass(fromDraft, id));
      for (const id of ['keyphrase_in_headings', 'heading_structure']) {
        expect(pass(fromDraft, id)).toBe(true);
        expect(pass(fromHtml, id)).toBe(true);
      }
    }
  });

  it('sees a setext h1 in a draft as the h1 it renders to', () => {
    const draft = 'Judul Artikel\n==============\n\nParagraf pembuka artikel.';
    const rendered = '<h1>Judul Artikel</h1><p>Paragraf pembuka artikel.</p>';
    const fromDraft = evaluateDraftChecks(extractDocument(draft, 'markdown'), metadata, 'k');
    const fromHtml = evaluateDraftChecks(extractDocument(rendered, 'html'), metadata, 'k');

    expect(pass(fromDraft, 'no_h1_in_body')).toBe(false);
    expect(pass(fromHtml, 'no_h1_in_body')).toBe(false);
  });

  it('reports the shallowest h2 in the failure value instead of assuming one paragraph', () => {
    const empty = evaluateDraftChecks(extractDocument('## Sasaran\n\n## Mekanisme\n\nSatu. Dua. Tiga.', 'markdown'), metadata, 'k');
    const item = empty.find((i) => i.id === 'h2_paragraph_rule');
    expect(item?.passed).toBe(false);
    expect(item?.value).toBe('One or more H2s has only 0 paragraphs');

    const thin = evaluateDraftChecks(extractDocument('## Sasaran\n\nSatu. Dua. Tiga.', 'markdown'), metadata, 'k');
    expect(thin.find((i) => i.id === 'h2_paragraph_rule')?.value).toBe(
      'One or more H2s has only 1 paragraph'
    );
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

  it('marks a not-yet-renderable check unavailable, so it is not read as a failure', () => {
    const draft = evaluateHtmlChecks(extractDocument('# Draft', 'markdown'));
    const rendered = evaluateHtmlChecks(extractDocument('<img src="a.jpg" alt="a">', 'html'));
    for (const item of draft) expect(item.unavailable).toBe(true);
    for (const item of rendered) expect(item.unavailable).toBeFalsy();
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