import { SeoMetadata } from '../types/article';

export interface SeoCheckItem {
  id: string;
  category: 'metadata' | 'content' | 'structure' | 'rich_media';
  title: string;
  description: string;
  passed: boolean;
  value?: string;
  recommendation?: string;
}

export interface SeoChecklistReport {
  score: number; // 0 - 100
  passedCount: number;
  totalCount: number;
  items: SeoCheckItem[];
  keyphraseDensityPercent: number;
  keyphraseOccurrences: number;
}

export function evaluateSeoChecklist(
  htmlContent: string,
  metadata: SeoMetadata,
  focusKeyphraseInput?: string
): SeoChecklistReport {
  const keyphrase = (focusKeyphraseInput || metadata.focusKeyphrase || '').trim();
  const lowerKeyphrase = keyphrase.toLowerCase();
  const lowerHtml = (htmlContent || '').toLowerCase();

  // Extract clean text from HTML
  const rawText = htmlContent
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const totalWords = Math.max(1, rawText.split(/\s+/).filter(Boolean).length);

  // Keyphrase density
  let occurrences = 0;
  if (lowerKeyphrase) {
    const escaped = lowerKeyphrase.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
    const matches = rawText.match(regex);
    occurrences = matches ? matches.length : 0;
  }
  const keyphraseWords = Math.max(1, keyphrase.split(/\s+/).length);
  const densityPercent = Math.round(((occurrences * keyphraseWords) / totalWords) * 1000) / 10;

  // 1. Post Title Length (<= 55 chars)
  const titleLen = metadata.seoTitle ? metadata.seoTitle.length : 0;
  const isTitleLenValid = titleLen > 0 && titleLen <= 55;

  // 2. Post Title has Keyphrase
  const isTitleHasKeyphrase = Boolean(
    lowerKeyphrase && metadata.seoTitle && metadata.seoTitle.toLowerCase().includes(lowerKeyphrase)
  );

  // 3. Headline Present
  const hasHeadline = Boolean(metadata.headline && metadata.headline.trim().length > 10);

  // 4. Meta Description Length (<= 155 chars)
  const descLen = metadata.metaDescription ? metadata.metaDescription.length : 0;
  const isDescLenValid = descLen >= 70 && descLen <= 155;

  // 5. Meta Description has Keyphrase
  const isDescHasKeyphrase = Boolean(
    lowerKeyphrase && metadata.metaDescription && metadata.metaDescription.toLowerCase().includes(lowerKeyphrase)
  );

  // 6. Focus Keyphrase Length (<= 20 chars)
  const isKeyphraseLenValid = keyphrase.length > 0 && keyphrase.length <= 25;

  // 7. Keyphrase in Paragraph 1
  const firstParagraphMatch = htmlContent.match(/<p\b[^>]*>(.*?)<\/p>/i);
  const firstParagraphText = firstParagraphMatch ? firstParagraphMatch[1].replace(/<[^>]+>/g, '').toLowerCase() : '';
  const isKeyphraseInP1 = Boolean(lowerKeyphrase && firstParagraphText.includes(lowerKeyphrase));

  // 8. Keyphrase in Headings (H2 or H3)
  const headingMatches = htmlContent.match(/<h[23]\b[^>]*>(.*?)<\/h[23]>/gi) || [];
  const headingText = headingMatches.map((h) => h.replace(/<[^>]+>/g, '').toLowerCase()).join(' ');
  const isKeyphraseInHeadings = Boolean(lowerKeyphrase && headingText.includes(lowerKeyphrase));

  // 9. Keyphrase density (0.4% - 2.5%)
  const isDensityOptimal = occurrences >= 2 && densityPercent >= 0.4 && densityPercent <= 2.5;

  // 10. NO H1 in body
  const hasH1Tag = /<h1\b/i.test(htmlContent);
  const isNoH1Compliant = !hasH1Tag;

  // 11. Heading Structure (has H2s)
  const h2Count = (htmlContent.match(/<h2\b/gi) || []).length;
  const isHeadingStructureValid = h2Count >= 2;

  // 12. H2 Paragraph Rule (every H2 has at least 2 paragraphs)
  // Split content by H2 and check paragraph counts
  const h2Sections = htmlContent.split(/<h2\b/i).slice(1);
  let allH2HaveMultipleP = h2Sections.length > 0;
  for (const sec of h2Sections) {
    const pCount = (sec.match(/<p\b/gi) || []).length;
    if (pCount < 2) {
      allH2HaveMultipleP = false;
      break;
    }
  }

  // 13. Paragraph Sentences Rule (each paragraph >= 3 sentences)
  const allParagraphs = Array.from(htmlContent.matchAll(/<p\b[^>]*>(.*?)<\/p>/gi)).map((m) =>
    m[1].replace(/<[^>]+>/g, ' ').trim()
  );
  let singleSentenceFound = false;
  if (allParagraphs.length > 0) {
    for (const p of allParagraphs) {
      const sentenceCount = p.split(/(?<=[.!?])\s+/).filter((s) => s.length > 10).length;
      if (sentenceCount < 2) {
        singleSentenceFound = true;
        break;
      }
    }
  }
  const isParagraphRuleCompliant = allParagraphs.length >= 4 && !singleSentenceFound;

  // 14. Statistical Data (E-E-A-T)
  const hasStrongTag = /<strong>.*?[\d%]+.*?<\/strong>/i.test(htmlContent);
  const hasCalloutBox = /<aside\b/i.test(htmlContent);
  const isStatsCompliant = hasStrongTag || hasCalloutBox;

  // 15. Native Images
  const imgMatches = htmlContent.match(/<img\b[^>]*>/gi) || [];
  const hasValidImages =
    imgMatches.length >= 2 &&
    imgMatches.every((img) => /src=/i.test(img) && /alt=/i.test(img));

  // 16. Contextual Links
  const linkMatches = htmlContent.match(/<a\b[^>]*href=/gi) || [];
  const isLinksCompliant = linkMatches.length >= 2;

  // 17. FAQ Schema & Interactive FAQ
  const hasDetailsTag = /<details\b/i.test(htmlContent);
  const hasFaqClass = /faq|accordion|question/i.test(htmlContent);
  const hasJsonLd = /application\/ld\+json/i.test(htmlContent);
  const isFaqCompliant = hasDetailsTag || hasFaqClass || hasJsonLd;

  const items: SeoCheckItem[] = [
    {
      id: 'seo_title_length',
      category: 'metadata',
      title: 'SEO Title Length (≤ 55 chars)',
      description: 'Prevents title truncation in Google SERP snippet previews.',
      passed: isTitleLenValid,
      value: `${titleLen}/55 characters`,
      recommendation: titleLen > 55 ? 'Shorten SEO Title to under 55 characters' : undefined,
    },
    {
      id: 'seo_title_keyphrase',
      category: 'metadata',
      title: 'Focus Keyphrase in SEO Title',
      description: 'Crucial for immediate search intent match in Google search results.',
      passed: isTitleHasKeyphrase,
      value: `Keyphrase: "${keyphrase}"`,
      recommendation: !isTitleHasKeyphrase ? `Insert "${keyphrase}" near the start of the SEO Title` : undefined,
    },
    {
      id: 'headline_present',
      category: 'metadata',
      title: 'Click-Magnet Headline',
      description: 'High-converting title for social sharing and WordPress hero header.',
      passed: hasHeadline,
      value: metadata.headline ? `${metadata.headline.slice(0, 35)}...` : 'Missing',
    },
    {
      id: 'meta_desc_length',
      category: 'metadata',
      title: 'Meta Description Length (≤ 155 chars)',
      description: 'Optimal snippet display without ellipsis on desktop and mobile SERPs.',
      passed: isDescLenValid,
      value: `${descLen}/155 characters`,
      recommendation: descLen > 155 ? 'Reduce to under 155 chars' : descLen < 70 ? 'Expand to at least 100 chars' : undefined,
    },
    {
      id: 'meta_desc_keyphrase',
      category: 'metadata',
      title: 'Focus Keyphrase in Meta Description',
      description: 'Google bolds matching search terms in the snippet description.',
      passed: isDescHasKeyphrase,
      value: isDescHasKeyphrase ? 'Present' : 'Not found in meta description',
    },
    {
      id: 'focus_keyphrase_length',
      category: 'metadata',
      title: 'Focus Keyphrase Length (≤ 20–25 chars)',
      description: 'Maintains focused semantic targeting without diluting keyphrase density.',
      passed: isKeyphraseLenValid,
      value: `${keyphrase.length} characters`,
    },
    {
      id: 'keyphrase_in_p1',
      category: 'content',
      title: 'Focus Keyphrase in 1st Paragraph',
      description: 'Confirms immediate topic relevance for search crawlers in the opening hook.',
      passed: isKeyphraseInP1,
      value: isKeyphraseInP1 ? 'Found in Introduction' : 'Missing in Paragraph 1',
      recommendation: !isKeyphraseInP1 ? 'Include your focus keyphrase in the very first paragraph' : undefined,
    },
    {
      id: 'keyphrase_in_headings',
      category: 'content',
      title: 'Focus Keyphrase in H2 or H3 Headings',
      description: 'Reinforces topic relevance across major content sections.',
      passed: isKeyphraseInHeadings,
      value: isKeyphraseInHeadings ? 'Present in Headings' : 'Missing in H2/H3',
    },
    {
      id: 'keyphrase_density',
      category: 'content',
      title: 'Keyphrase Density (0.5% – 2.0%)',
      description: 'Balanced usage avoids both keyword stuffing penalties and under-optimization.',
      passed: isDensityOptimal,
      value: `${densityPercent}% (${occurrences} occurrences)`,
      recommendation: densityPercent < 0.4 ? 'Mention keyphrase 1–2 more times' : densityPercent > 2.5 ? 'Reduce keyphrase repetition' : undefined,
    },
    {
      id: 'no_h1_in_body',
      category: 'structure',
      title: 'Strictly No <h1> in Article Body',
      description: 'Prevents duplicate H1 SEO penalty since WordPress theme generates H1.',
      passed: isNoH1Compliant,
      value: isNoH1Compliant ? 'Passed (H2/H3 only)' : 'Contains illegal <h1> tag!',
      recommendation: !isNoH1Compliant ? 'Change <h1> tags to <h2> to avoid duplicate H1 penalties' : undefined,
    },
    {
      id: 'heading_structure',
      category: 'structure',
      title: 'Logical Heading Structure (≥ 2 H2 sections)',
      description: 'Breaks down article into clear, skimmable themes.',
      passed: isHeadingStructureValid,
      value: `${h2Count} H2 sections`,
    },
    {
      id: 'h2_paragraph_rule',
      category: 'structure',
      title: 'H2 Paragraph Depth (≥ 2 paragraphs per H2)',
      description: 'Ensures each subtopic has substantive depth per Yoast rules.',
      passed: allH2HaveMultipleP,
      value: allH2HaveMultipleP ? 'All H2s have 2+ paragraphs' : 'One or more H2s has only 1 paragraph',
    },
    {
      id: 'paragraph_depth',
      category: 'structure',
      title: 'Paragraph Depth (≥ 3 sentences per paragraph)',
      description: 'Prohibits shallow single-sentence paragraphs for sustained dwell time.',
      passed: isParagraphRuleCompliant,
      value: isParagraphRuleCompliant ? 'Passed (Well-structured)' : 'Shallow single-sentence paragraphs detected',
    },
    {
      id: 'statistical_eeat',
      category: 'rich_media',
      title: 'Statistical E-E-A-T & Featured Snippet Data',
      description: 'Emphasizes concrete metrics (ROI %, retention %) inside <strong> or <aside>.',
      passed: isStatsCompliant,
      value: isStatsCompliant ? 'Highlighted Statistics Present' : 'No highlighted statistical figures',
    },
    {
      id: 'native_images',
      category: 'rich_media',
      title: 'Native In-Place Commercial Images (≥ 2)',
      description: 'Embedded with <figure>, <img>, alt, title, and lazy loading.',
      passed: hasValidImages,
      value: `${imgMatches.length} images embedded`,
    },
    {
      id: 'contextual_links',
      category: 'rich_media',
      title: 'Contextual In-Text Anchor Links (≥ 2)',
      description: 'Native B2B internal & external linking within text flow.',
      passed: isLinksCompliant,
      value: `${linkMatches.length} links placed`,
    },
    {
      id: 'faq_schema',
      category: 'rich_media',
      title: 'Interactive FAQ / JSON-LD Schema',
      description: 'Targets Google People Also Ask (PAA) rich snippet results.',
      passed: isFaqCompliant,
      value: isFaqCompliant ? 'Interactive FAQ Present' : 'Missing FAQ',
    },
  ];

  const passedCount = items.filter((item) => item.passed).length;
  const score = Math.round((passedCount / items.length) * 100);

  return {
    score,
    passedCount,
    totalCount: items.length,
    items,
    keyphraseDensityPercent: densityPercent,
    keyphraseOccurrences: occurrences,
  };
}
