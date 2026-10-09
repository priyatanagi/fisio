import { extractDocument, type ArticleDocument } from './document';
import type { SeoMetadata } from '../types/article';

export interface SeoCheckItem {
  id: string;
  category: 'metadata' | 'content' | 'structure' | 'rich_media';
  title: string;
  description: string;
  passed: boolean;
  value?: string;
  recommendation?: string;
  /** True when the check needs rendered HTML that does not exist yet, so it was never judged. */
  unavailable?: boolean;
}

export interface SeoChecklistReport {
  score: number; // 0 - 100
  passedCount: number;
  totalCount: number;
  items: SeoCheckItem[];
  keyphraseDensityPercent: number;
  keyphraseOccurrences: number;
}

const UNAVAILABLE_WITHOUT_HTML = 'This check is not available until the HTML is rendered';

function keyphraseOccurrences(text: string, keyphrase: string): number {
  if (!keyphrase) return 0;
  const escaped = keyphrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  return (text.match(new RegExp(`\\b${escaped}\\b`, 'gi')) ?? []).length;
}

function densityPercent(occurrences: number, keyphrase: string, totalWords: number): number {
  const words = Math.max(1, keyphrase.split(/\s+/).filter(Boolean).length);
  return Math.round(((occurrences * words) / totalWords) * 1000) / 10;
}

/**
 * Headings and paragraphs arrive as two independent lists with no link between them, so each
 * entry is matched into `doc.text` in order to recover where it sat. -1 means "not found",
 * which every caller treats as "belongs to no section".
 */
function positionsInText(doc: ArticleDocument, entries: string[]): number[] {
  const positions: number[] = [];
  let cursor = 0;
  for (const entry of entries) {
    const at = entry ? doc.text.indexOf(entry, cursor) : -1;
    positions.push(at);
    if (at >= 0) cursor = at + entry.length;
  }
  return positions;
}

/** Paragraph counts owned by each H2, bounded by the next heading of any level. */
function paragraphsPerH2(doc: ArticleDocument): number[] {
  const headingPositions = positionsInText(
    doc,
    doc.headings.map((h) => h.text)
  );
  const paragraphPositions = positionsInText(doc, doc.paragraphs);
  const counts: number[] = [];

  doc.headings.forEach((heading, i) => {
    if (heading.level !== 2) return;
    const start = headingPositions[i];
    const end = i + 1 < headingPositions.length ? headingPositions[i + 1] : doc.text.length;
    counts.push(
      start < 0 ? 0 : paragraphPositions.filter((p) => p > start && p < end).length
    );
  });

  return counts;
}

export function evaluateDraftChecks(
  doc: ArticleDocument,
  metadata: SeoMetadata,
  focusKeyphrase?: string
): SeoCheckItem[] {
  const keyphrase = (focusKeyphrase || metadata.focusKeyphrase || '').trim();
  const lowerKeyphrase = keyphrase.toLowerCase();
  const totalWords = Math.max(1, doc.text.split(/\s+/).filter(Boolean).length);
  const occurrences = keyphraseOccurrences(doc.text, lowerKeyphrase);
  const density = densityPercent(occurrences, lowerKeyphrase, totalWords);

  const seoTitle = metadata.seoTitle ?? '';
  const metaDescription = metadata.metaDescription ?? '';
  const headline = metadata.headline ?? '';
  const titleLen = seoTitle.length;
  const descLen = metaDescription.length;

  const firstParagraph = (doc.paragraphs[0] ?? '').toLowerCase();
  const headingText = doc.headings
    .filter((h) => h.level === 2 || h.level === 3)
    .map((h) => h.text.toLowerCase())
    .join(' ');
  const h1Count = doc.headings.filter((h) => h.level === 1).length;
  const h2Count = doc.headings.filter((h) => h.level === 2).length;

  const h2Counts = paragraphsPerH2(doc);
  const allH2HaveMultipleP = h2Counts.length > 0 && h2Counts.every((count) => count >= 2);
  const shallowestH2 = h2Counts.length > 0 ? Math.min(...h2Counts) : 0;

  const hasShallowParagraph = doc.paragraphs.some(
    (p) => p.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10).length < 2
  );
  const hasWellFormedParagraphs = doc.paragraphs.length >= 4 && !hasShallowParagraph;

  return [
    {
      id: 'seo_title_length',
      category: 'metadata',
      title: 'SEO Title Length (≤ 55 chars)',
      description: 'Prevents title truncation in Google SERP snippet previews.',
      passed: titleLen > 0 && titleLen <= 55,
      value: `${titleLen}/55 characters`,
      recommendation: titleLen > 55 ? 'Shorten SEO Title to under 55 characters' : undefined,
    },
    {
      id: 'seo_title_keyphrase',
      category: 'metadata',
      title: 'Focus Keyphrase in SEO Title',
      description: 'The primary phrase must appear in the search snippet title.',
      passed: Boolean(lowerKeyphrase && seoTitle.toLowerCase().includes(lowerKeyphrase)),
      value: lowerKeyphrase || 'no keyphrase set',
      recommendation: lowerKeyphrase && !seoTitle.toLowerCase().includes(lowerKeyphrase)
        ? `Insert "${keyphrase}" near the start of the SEO Title`
        : undefined,
    },
    {
      id: 'headline_present',
      category: 'metadata',
      title: 'Headline Present',
      description: 'A click-magnet headline is required for the article header.',
      passed: Boolean(headline.trim().length > 10),
      value: headline || 'missing',
      recommendation:
        headline.trim().length > 10 ? undefined : 'Write a headline longer than 10 characters',
    },
    {
      id: 'meta_desc_length',
      category: 'metadata',
      title: 'Meta Description Length (70-155 chars)',
      description: 'Keeps the SERP description within the display limit.',
      passed: descLen >= 70 && descLen <= 155,
      value: `${descLen}/155 characters`,
      recommendation: descLen > 155
        ? 'Reduce to under 155 chars'
        : descLen < 70
          ? 'Expand to at least 100 chars'
          : undefined,
    },
    {
      id: 'meta_desc_keyphrase',
      category: 'metadata',
      title: 'Focus Keyphrase in Meta Description',
      description: 'The primary phrase must appear in the meta description.',
      passed: Boolean(lowerKeyphrase && metaDescription.toLowerCase().includes(lowerKeyphrase)),
      value: lowerKeyphrase || 'no keyphrase set',
      recommendation:
        lowerKeyphrase && !metaDescription.toLowerCase().includes(lowerKeyphrase)
          ? `Insert "${keyphrase}" in the meta description`
          : undefined,
    },
    {
      id: 'focus_keyphrase_length',
      category: 'metadata',
      title: 'Focus Keyphrase Length (≤ 25 chars)',
      description: 'Overly long keyphrases never match real queries.',
      passed: keyphrase.length > 0 && keyphrase.length <= 25,
      value: `${keyphrase.length}/25 characters`,
      recommendation:
        keyphrase.length > 0 && keyphrase.length <= 25
          ? undefined
          : 'Set a focus keyphrase of 25 characters or fewer',
    },
    {
      id: 'keyphrase_in_p1',
      category: 'content',
      title: 'Keyphrase in First Paragraph',
      description: 'The opening paragraph must name the topic explicitly.',
      passed: Boolean(lowerKeyphrase && firstParagraph.includes(lowerKeyphrase)),
      value: firstParagraph ? firstParagraph.slice(0, 60) : 'no paragraph',
      recommendation:
        lowerKeyphrase && !firstParagraph.includes(lowerKeyphrase)
          ? 'Include your focus keyphrase in the very first paragraph'
          : undefined,
    },
    {
      id: 'keyphrase_in_headings',
      category: 'content',
      title: 'Keyphrase in H2/H3 Headings',
      description: 'Subheadings reinforce topical relevance.',
      passed: Boolean(lowerKeyphrase && headingText.includes(lowerKeyphrase)),
      value: headingText ? headingText.slice(0, 60) : 'no headings',
      recommendation:
        lowerKeyphrase && !headingText.includes(lowerKeyphrase)
          ? `Include "${keyphrase}" in at least one H2 or H3 heading`
          : undefined,
    },
    {
      id: 'keyphrase_density',
      category: 'content',
      title: 'Keyphrase Density (0.4% - 2.5%)',
      description: 'Enough repetition to rank, not enough to read as spam.',
      passed: occurrences >= 2 && density >= 0.4 && density <= 2.5,
      value: `${density}% across ${totalWords} words`,
      recommendation: density < 0.4
        ? 'Mention keyphrase 1–2 more times'
        : density > 2.5
          ? 'Reduce keyphrase repetition'
          : undefined,
    },
    {
      id: 'no_h1_in_body',
      category: 'structure',
      title: 'No H1 in Article Body',
      description: 'The CMS supplies the H1; the body must not duplicate it.',
      passed: h1Count === 0,
      value: `${h1Count} H1 heading(s) in the body`,
      recommendation: h1Count > 0 ? 'Change <h1> tags to <h2> to avoid duplicate H1 penalties' : undefined,
    },
    {
      id: 'heading_structure',
      category: 'structure',
      title: 'Heading Structure (≥ 2 H2s)',
      description: 'Subheadings break the article into scannable sections.',
      passed: h2Count >= 2,
      value: `${h2Count} H2 heading(s)`,
      recommendation: h2Count >= 2 ? undefined : 'Add 2 or more H2 subheadings',
    },
    {
      id: 'h2_paragraph_rule',
      category: 'structure',
      title: 'H2 Paragraph Depth (≥ 2 paragraphs per H2)',
      description: 'Ensures each subtopic has substantive depth per Yoast rules.',
      passed: allH2HaveMultipleP,
      value: allH2HaveMultipleP
        ? `All ${h2Counts.length} H2s have 2+ paragraphs`
        : h2Counts.length === 0
          ? 'No H2 headings found'
          : `One or more H2s has only ${shallowestH2} paragraph${shallowestH2 === 1 ? '' : 's'}`,
      recommendation:
        allH2HaveMultipleP ? undefined : 'Write at least 2 paragraphs under every H2',
    },
    {
      id: 'paragraph_depth',
      category: 'structure',
      title: 'Paragraph Depth (≥ 3 sentences per paragraph)',
      description: 'Prohibits shallow single-sentence paragraphs for sustained dwell time.',
      passed: hasWellFormedParagraphs,
      value: hasWellFormedParagraphs
        ? `Passed (${doc.paragraphs.length} paragraphs)`
        : doc.paragraphs.length < 4
          ? `Only ${doc.paragraphs.length} paragraphs found`
          : 'Shallow single-sentence paragraphs detected',
      recommendation:
        hasWellFormedParagraphs
          ? undefined
          : 'Write at least 4 paragraphs of 2 or more sentences each',
    },
    {
      id: 'statistical_eeat',
      category: 'rich_media',
      title: 'Statistical E-E-A-T & Featured Snippet Data',
      description: 'Emphasizes concrete metrics (ROI %, retention %) in bold or a callout.',
      passed: doc.hasStrongFigure,
      value: doc.hasStrongFigure ? 'Highlighted Statistics Present' : 'No highlighted statistical figures',
      recommendation:
        doc.hasStrongFigure
          ? undefined
          : 'Bold a concrete figure, for example **30%**, or place it in a callout',
    },
    {
      id: 'cta_present',
      category: 'rich_media',
      title: 'Closing Call to Action',
      description: 'A B2B reader must be invited to request a quotation or consultation at the end.',
      passed: doc.hasCtaSignal,
      value: doc.hasCtaSignal ? 'Call to action present' : 'No closing invitation found',
      recommendation: doc.hasCtaSignal
        ? undefined
        : 'End the article with <aside class="cta"> holding one short paragraph and one link',
    },
  ];
}

export function evaluateHtmlChecks(doc: ArticleDocument): SeoCheckItem[] {
  const html = doc.html;
  const imageTags = html ? html.match(/<img\b[^>]*>/gi) ?? [] : [];
  const hasValidImages =
    imageTags.length >= 2 && imageTags.every((img) => /src=/i.test(img) && /alt=/i.test(img));

  return [
    {
      id: 'native_images',
      category: 'rich_media',
      title: 'Native In-Place Commercial Images (≥ 2)',
      description: 'Embedded with <figure>, <img>, alt, title, and lazy loading.',
      passed: hasValidImages,
      value: html ? `${imageTags.length} images embedded` : UNAVAILABLE_WITHOUT_HTML,
      unavailable: !html,
    },
    {
      id: 'contextual_links',
      category: 'rich_media',
      title: 'Contextual In-Text Anchor Links (≥ 2)',
      description: 'Native B2B internal & external linking within text flow.',
      passed: html ? doc.linkCount >= 2 : false,
      value: html ? `${doc.linkCount} links placed` : UNAVAILABLE_WITHOUT_HTML,
      unavailable: !html,
    },
    {
      id: 'faq_schema',
      category: 'rich_media',
      title: 'Interactive FAQ / JSON-LD Schema',
      description: 'Targets Google People Also Ask (PAA) rich snippet results.',
      passed: html ? doc.hasFaqSignal : false,
      value: html
        ? doc.hasFaqSignal
          ? 'Interactive FAQ Present'
          : 'Missing FAQ'
        : UNAVAILABLE_WITHOUT_HTML,
      unavailable: !html,
    },
  ];
}

export function evaluateSeoChecklist(
  htmlContent: string,
  metadata: SeoMetadata,
  focusKeyphraseInput?: string
): SeoChecklistReport {
  const doc = extractDocument(htmlContent, 'html');
  const keyphrase = (focusKeyphraseInput || metadata.focusKeyphrase || '').trim();
  const lowerKeyphrase = keyphrase.toLowerCase();
  const totalWords = Math.max(1, doc.text.split(/\s+/).filter(Boolean).length);
  const occurrences = keyphraseOccurrences(doc.text, lowerKeyphrase);

  const items = [...evaluateDraftChecks(doc, metadata, keyphrase), ...evaluateHtmlChecks(doc)];
  const passedCount = items.filter((item) => item.passed).length;

  return {
    score: Math.round((passedCount / items.length) * 100),
    passedCount,
    totalCount: items.length,
    items,
    keyphraseDensityPercent: densityPercent(occurrences, lowerKeyphrase, totalWords),
    keyphraseOccurrences: occurrences,
  };
}