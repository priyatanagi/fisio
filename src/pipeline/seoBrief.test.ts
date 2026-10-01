import { describe, it, expect } from 'vitest';
import { briefFromCreator, minimalBrief, resolveBrief } from './seoBrief';

describe('briefFromCreator', () => {
  it('builds a brief from a Creator selfPlanned payload', () => {
    const brief = briefFromCreator(
      'How to choose a commercial treadmill',
      {
        seoMetadata: {
          seoTitle: 'Commercial Treadmill Guide',
          headline: 'Pick the Right Treadmill',
          focusKeyphrase: 'commercial treadmill',
          metaDescription: 'A guide.',
          urlSlug: 'commercial-treadmill',
          tags: ['gym'],
        },
        secondaryKeywords: ['treadmill motor'],
        outline: [{ heading: 'Motors', mustCover: ['HP'] }],
        faqPlan: [],
        statPlan: [],
        internalLinkTargets: [],
      },
      'gym'
    );
    expect(brief.source).toBe('creator-selfplanned');
    expect(brief.seoMetadata.focusKeyphrase).toBe('commercial treadmill');
    expect(brief.outline).toHaveLength(1);
  });

  it('fills missing arrays rather than leaving them undefined', () => {
    const brief = briefFromCreator('Topic', undefined, 'gym');
    expect(brief.secondaryKeywords).toEqual([]);
    expect(brief.outline).toEqual([]);
    expect(brief.faqPlan).toEqual([]);
    expect(brief.statPlan).toEqual([]);
    expect(brief.internalLinkTargets).toEqual([]);
  });

  it('supplies a fallback focus keyphrase from the seed topic', () => {
    const brief = briefFromCreator('Commercial Treadmill Buying', undefined, 'treadmill');
    expect(brief.seoMetadata.focusKeyphrase).toBe('treadmill');
  });

  it('derives a slug when none was supplied', () => {
    const brief = briefFromCreator('Best Gym Shoes & Trainers', undefined, 'kw');
    expect(brief.seoMetadata.urlSlug).toBe('best-gym-shoes-trainers');
  });
});

describe('minimalBrief', () => {
  it('derives a title from the first markdown heading', () => {
    const brief = minimalBrief('Seed topic', '# Choosing a Treadmill\n\nBody text here.', 'treadmill');
    expect(brief.source).toBe('minimal');
    expect(brief.seoMetadata.seoTitle).toContain('Choosing a Treadmill');
  });

  it('truncates the meta description to 155 characters', () => {
    const long = 'word '.repeat(80);
    const brief = minimalBrief('Seed', `# T\n\n${long}`, 'kw');
    expect(brief.seoMetadata.metaDescription.length).toBeLessThanOrEqual(155);
  });

  it('produces a kebab-case slug', () => {
    const brief = minimalBrief('Seed topic', '# T\n\nbody', 'kw');
    expect(brief.seoMetadata.urlSlug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('handles markdown with no heading', () => {
    const brief = minimalBrief('Fallback Seed Topic', 'just a paragraph', 'kw');
    expect(brief.seoMetadata.seoTitle.length).toBeGreaterThan(0);
  });

  it('falls back to the seed topic when there is no body text', () => {
    const brief = minimalBrief('Seed topic', '', 'kw');
    expect(brief.seoMetadata.metaDescription.length).toBeGreaterThan(0);
  });
});

describe('resolveBrief', () => {
  it('prefers the selfPlanned payload', () => {
    const brief = resolveBrief(
      {
        markdownContent: '# T',
        selfPlanned: {
          seoMetadata: {
            seoTitle: 'Planned',
            headline: 'H',
            focusKeyphrase: 'kw',
            metaDescription: 'M',
            urlSlug: 's',
            tags: [],
          },
        },
      },
      'Seed',
      'kw'
    );
    expect(brief.source).toBe('creator-selfplanned');
  });

  it('falls back to minimal when selfPlanned is absent', () => {
    const brief = resolveBrief({ markdownContent: '# Title\n\nBody.' }, 'Seed', 'kw');
    expect(brief.source).toBe('minimal');
  });
});
