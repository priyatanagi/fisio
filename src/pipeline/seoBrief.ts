import type { CreatorOutput, SeoBrief, SeoMetadata } from './stages';

const MAX_META_DESCRIPTION = 155;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function briefFromCreator(
  seedTopic: string,
  selfPlanned: Partial<SeoBrief> | undefined,
  focusKeyphrase: string
): SeoBrief {
  const meta = (selfPlanned?.seoMetadata ?? {}) as Partial<SeoMetadata>;
  const keyword = meta.focusKeyphrase?.trim() || focusKeyphrase || slugify(seedTopic).slice(0, 20);

  return {
    seoMetadata: {
      seoTitle: meta.seoTitle?.trim() || seedTopic,
      headline: meta.headline?.trim() || seedTopic,
      focusKeyphrase: keyword,
      metaDescription: meta.metaDescription?.trim() || seedTopic,
      urlSlug: meta.urlSlug?.trim() || slugify(seedTopic),
      tags: Array.isArray(meta.tags) ? meta.tags.filter(Boolean) : [],
    },
    secondaryKeywords: selfPlanned?.secondaryKeywords ?? [],
    outline: selfPlanned?.outline ?? [],
    faqPlan: selfPlanned?.faqPlan ?? [],
    statPlan: selfPlanned?.statPlan ?? [],
    internalLinkTargets: selfPlanned?.internalLinkTargets ?? [],
    source: 'creator-selfplanned',
  };
}

export function minimalBrief(
  seedTopic: string,
  markdown: string,
  focusKeyphrase: string
): SeoBrief {
  const headingMatch = markdown.match(/^#{1,2}\s+(.+)$/m);
  const title = (headingMatch ? headingMatch[1] : seedTopic).trim();

  const body = markdown.replace(/^#{1,6}\s+.*$/gm, '').trim();
  const firstParagraph = (body.split(/\n\s*\n/)[0] ?? '').replace(/\s+/g, ' ').trim();
  const metaDescription = firstParagraph
    ? firstParagraph.length > MAX_META_DESCRIPTION
      ? `${firstParagraph.slice(0, MAX_META_DESCRIPTION - 3).trimEnd()}...`
      : firstParagraph
    : seedTopic;

  return {
    seoMetadata: {
      seoTitle: title.slice(0, 55),
      headline: title,
      focusKeyphrase: focusKeyphrase || slugify(seedTopic).slice(0, 20),
      metaDescription,
      urlSlug: slugify(title || seedTopic),
      tags: [],
    },
    secondaryKeywords: [],
    outline: [],
    faqPlan: [],
    statPlan: [],
    internalLinkTargets: [],
    source: 'minimal',
  };
}

export function resolveBrief(
  creator: CreatorOutput,
  seedTopic: string,
  focusKeyphrase: string
): SeoBrief {
  return creator.selfPlanned
    ? briefFromCreator(seedTopic, creator.selfPlanned, focusKeyphrase)
    : minimalBrief(seedTopic, creator.markdownContent, focusKeyphrase);
}
