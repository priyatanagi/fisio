import { describe, it, expect } from 'vitest';
import { buildImproverPrompt, buildDesignerPrompt } from './agentPrompts';
import { DEFAULT_USER_PROFILE } from '../types/profile';

const input = {
  html: '<article><h1>Judul</h1><p>Isi artikel tanpa kata kunci.</p></article>',
  language: 'id' as const,
  cssMode: 'inline' as const,
  instruction: 'Add a section on warranty coverage',
  topic: 'Garansi alat fitness komersial',
  focusKeyphrase: 'garansi alat fitness',
  targetWords: 900,
  failedChecks: [
    { id: 'keyphrase_in_p1', title: 'Keyphrase in First Paragraph', actual: 'no paragraph', expected: 'Include "garansi alat fitness" in the very first paragraph' },
  ],
  reviewIssues: [
    { severity: 'warning', category: 'seo', message: 'Keyphrase is thin', suggestedFix: 'Use the keyphrase twice more' },
  ],
  seoMetadata: { seoTitle: 'Garansi alat fitness' },
  markdown: '# Judul\n\nIsi.',
};

describe('buildImproverPrompt', () => {
  it('carries the measured failures so the fix is not a guess', () => {
    const prompt = buildImproverPrompt(input, DEFAULT_USER_PROFILE);
    expect(prompt).toContain('[keyphrase_in_p1]');
    expect(prompt).toContain('Include "garansi alat fitness" in the very first paragraph');
  });

  it('carries the reviewer issues', () => {
    const prompt = buildImproverPrompt(input, DEFAULT_USER_PROFILE);
    expect(prompt).toMatch(/\(warning\/seo\)/);
    expect(prompt).toContain('Use the keyphrase twice more');
  });

  it('carries the brand tokens, so a repair stays on brand', () => {
    expect(buildImproverPrompt(input, DEFAULT_USER_PROFILE)).toContain('BRAND DESIGN TOKENS');
  });

  it('carries the HTML under repair', () => {
    expect(buildImproverPrompt(input, DEFAULT_USER_PROFILE)).toContain(input.html);
  });

  it('carries the instruction and the topic', () => {
    const prompt = buildImproverPrompt(input, DEFAULT_USER_PROFILE);
    expect(prompt).toContain('Add a section on warranty coverage');
    expect(prompt).toContain('Garansi alat fitness komersial');
  });

  it('states the language and the output format', () => {
    const prompt = buildImproverPrompt(input, DEFAULT_USER_PROFILE);
    expect(prompt).toContain('Bahasa Indonesia');
    expect(prompt).toMatch(/inline CSS only/);
  });

  it('says so explicitly when nothing failed, rather than leaving an empty section', () => {
    const prompt = buildImproverPrompt({ ...input, failedChecks: [] }, DEFAULT_USER_PROFILE);
    expect(prompt).toMatch(/none; the measured checks all pass/);
  });

  it('forbids dropping content to make a check pass', () => {
    expect(buildImproverPrompt(input, DEFAULT_USER_PROFILE)).toMatch(
      /Never remove a section, an image, a link or an FAQ/
    );
  });

  it('forbids a page background and a width cap', () => {
    const prompt = buildImproverPrompt(input, DEFAULT_USER_PROFILE);
    expect(prompt).toMatch(/never paint a page background/i);
    expect(prompt).toMatch(/never cap the article width/i);
  });

  it('asks for the whole document, not a diff', () => {
    expect(buildImproverPrompt(input, DEFAULT_USER_PROFILE)).toMatch(/whole repaired HTML document/);
  });
});

describe('buildDesignerPrompt', () => {
  const base = {
    markdown: '# Judul\n\nIsi artikel.',
    language: 'en' as const,
    cssMode: 'inline' as const,
  };

  it('forbids a page background on the article root', () => {
    const prompt = buildDesignerPrompt(base, DEFAULT_USER_PROFILE);
    expect(prompt).toMatch(/Never paint a page background/);
    expect(prompt).toMatch(/component surfaces only/i);
  });

  it('forbids capping the article width and asks for the measure on paragraphs', () => {
    const prompt = buildDesignerPrompt(base, DEFAULT_USER_PROFILE);
    expect(prompt).toMatch(/fills the width of the container/);
    expect(prompt).toMatch(/Apply the reading measure to the paragraphs/);
  });

  it('asks for a header block, which one language was shipping and the other was not', () => {
    expect(buildDesignerPrompt(base, DEFAULT_USER_PROFILE)).toMatch(/<header>/);
  });

  it('omits the structure section when no reference was rendered', () => {
    expect(buildDesignerPrompt(base, DEFAULT_USER_PROFILE)).not.toContain('STRUCTURE REFERENCE');
  });

  it('hands the sibling render over as the structure to copy', () => {
    const reference = '<article><header><h1>Judul</h1></header></article>';
    const prompt = buildDesignerPrompt({ ...base, referenceHtml: reference }, DEFAULT_USER_PROFILE);
    expect(prompt).toContain('STRUCTURE REFERENCE');
    expect(prompt).toContain(reference);
    expect(prompt).toMatch(/Translate only the visible text/);
  });

  it('keeps the clean-mode rules intact alongside the new ones', () => {
    const prompt = buildDesignerPrompt({ ...base, cssMode: 'clean' }, DEFAULT_USER_PROFILE);
    expect(prompt).toMatch(/NO inline styles/);
    expect(prompt).toMatch(/Never paint a page background/);
  });
});