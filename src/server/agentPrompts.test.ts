import { describe, it, expect } from 'vitest';
import { DEFAULT_USER_PROFILE, FALLBACK_BRAND } from '../types/profile';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import {
  buildBrandBlock,
  buildUniversalRulesBlock,
  buildDesignTokenBlock,
  buildJudgePrompt,
  buildImpowerPrompt,
  buildCreatorPrompt,
} from './agentPrompts';

const configured = {
  ...DEFAULT_USER_PROFILE,
  businessName: 'Klinik Sehat Sentosa',
  niche: 'Klinik fisioterapi',
  targetMarket: 'Karyawan kantoran usia 25-45 tahun dengan nyeri punggung',
};

describe('buildBrandBlock', () => {
  it('falls back to legacy brand values when the profile is empty', () => {
    const block = buildBrandBlock(DEFAULT_USER_PROFILE);
    expect(block).toContain(FALLBACK_BRAND.businessName);
    expect(block).toContain(FALLBACK_BRAND.niche);
  });

  it('uses configured values when present', () => {
    const block = buildBrandBlock(configured);
    expect(block).toContain('Klinik Sehat Sentosa');
    expect(block).toContain('Klinik fisioterapi');
    expect(block).not.toContain(FALLBACK_BRAND.businessName);
  });

  it('includes exclusions when non-empty', () => {
    expect(buildBrandBlock(DEFAULT_USER_PROFILE)).toContain('EXCLUDE');
  });

  it('omits the exclusions section when the list is empty', () => {
    expect(buildBrandBlock({ ...DEFAULT_USER_PROFILE, exclusions: [] })).not.toContain('EXCLUDE');
  });
});

describe('buildUniversalRulesBlock', () => {
  it('renders configured numeric limits', () => {
    const block = buildUniversalRulesBlock({ ...DEFAULT_UNIVERSAL_RULES, seoTitleMaxChars: 60 });
    expect(block).toContain('SEO title at most 60 characters');
    expect(block).not.toContain('SEO title at most 55 characters');
  });

  it('forbids h1 when allowH1InArticle is false', () => {
    expect(buildUniversalRulesBlock(DEFAULT_UNIVERSAL_RULES)).toMatch(/do not use <h1>/i);
  });

  it('permits h1 when allowH1InArticle is true', () => {
    expect(buildUniversalRulesBlock({ ...DEFAULT_UNIVERSAL_RULES, allowH1InArticle: true })).toContain('H1 tags are permitted');
  });
});

describe('buildDesignTokenBlock', () => {
  it('emits every palette value', () => {
    const block = buildDesignTokenBlock(DEFAULT_USER_PROFILE.designRules);
    expect(block).toContain('#cc2929');
    expect(block).toContain('#f8fafc');
    expect(block).toContain('#333940');
  });
});

describe('buildJudgePrompt', () => {
  it('includes the seed topic and demands the judge shape', () => {
    const prompt = buildJudgePrompt({ seedTopic: 'Gym ROI' }, DEFAULT_USER_PROFILE);
    expect(prompt).toContain('Gym ROI');
    expect(prompt).toContain('refinedTopic');
    expect(prompt).toContain('rejectedAngles');
  });

  it('includes a focus keyphrase when supplied', () => {
    const prompt = buildJudgePrompt(
      { seedTopic: 'Gym ROI', focusKeyphrase: 'roi gym' },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('roi gym');
  });
});

describe('user intent lock', () => {
  const driftCase = {
    seedTopic: 'Optimalisasi Infrastruktur Kebugaran',
    originalTopic: 'Program Makan Bergizi Gratis',
    focusKeyphrase: 'makan bergizi gratis',
  };

  it('tells the Judge it may not swap the subject', () => {
    const prompt = buildJudgePrompt(
      { seedTopic: 'Program Makan Bergizi Gratis' },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toMatch(/must stay on the exact subject/i);
    expect(prompt).toMatch(/SUBJECT LOCK/);
  });

  it('pins the original topic and keyphrase in the Creator prompt', () => {
    const prompt = buildCreatorPrompt(
      { ...driftCase, targetWords: 900, brief: null },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('Program Makan Bergizi Gratis');
    expect(prompt).toMatch(/PINNED FOCUS KEYPHRASE/);
    expect(prompt).toContain('makan bergizi gratis');
    expect(prompt).toMatch(/Write about the ORIGINAL USER TOPIC/);
  });

  it('injects the current profile design settings into the Creator prompt', () => {
    const profile = {
      ...DEFAULT_USER_PROFILE,
      designRules: {
        ...DEFAULT_USER_PROFILE.designRules,
        bulletStyle: 'check',
        numberingStyle: 'upper-alpha',
        tableStyle: 'zebra',
        blockquoteStyle: 'centered',
        faqStyle: 'card',
        textAlignment: 'justify',
      },
    };
    const prompt = buildCreatorPrompt(
      { seedTopic: 'A practical guide', targetWords: 900, brief: null },
      profile
    );
    expect(prompt).toContain('Bulleted list: check');
    expect(prompt).toContain('Numbered list: upper-alpha');
    expect(prompt).toContain('Table: zebra');
    expect(prompt).toContain('Blockquote: centered');
    expect(prompt).toContain('FAQ: card');
    expect(prompt).toContain('Paragraph alignment: justify');
  });

  it('still locks the topic when no separate original exists', () => {
    const prompt = buildCreatorPrompt(
      { seedTopic: 'Treadmill guide', targetWords: 900, brief: null },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toMatch(/must stay exactly on the TOPIC above/i);
    expect(prompt).not.toContain('ORIGINAL USER TOPIC');
  });

  it('pins the original topic and keyphrase in the Impower prompt', () => {
    const prompt = buildImpowerPrompt(
      { topic: 'Optimalisasi Infrastruktur Kebugaran', seedTopic: 'Program Makan Bergizi Gratis', focusKeyphrase: 'makan bergizi gratis', targetWords: 900 },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('Program Makan Bergizi Gratis');
    expect(prompt).toMatch(/PINNED FOCUS KEYPHRASE/);
    expect(prompt).toMatch(/authoritative subject/i);
  });

  it('omits the original block when the angle matches the seed topic', () => {
    const prompt = buildImpowerPrompt(
      { topic: 'Treadmill guide', seedTopic: 'Treadmill guide', targetWords: 900 },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).not.toContain('ORIGINAL USER TOPIC');
    expect(prompt).not.toContain('PINNED FOCUS KEYPHRASE');
  });
});

describe('buildCreatorPrompt', () => {
  it('states the word target and forbids h1', () => {
    const prompt = buildCreatorPrompt(
      { seedTopic: 'Treadmill guide', targetWords: 1200, brief: null },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('1200');
    expect(prompt).toMatch(/do not use <h1>/i);
  });

  it('asks for selfPlanned metadata when no brief is supplied', () => {
    const prompt = buildCreatorPrompt(
      { seedTopic: 'Treadmill guide', targetWords: 900, brief: null },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('selfPlanned');
  });

  it('embeds an outline when a brief exists', () => {
    const prompt = buildCreatorPrompt(
      {
        seedTopic: 'Treadmill guide',
        targetWords: 900,
        brief: {
          seoMetadata: {
            seoTitle: 'T',
            headline: 'H',
            focusKeyphrase: 'treadmill',
            metaDescription: 'M',
            urlSlug: 'treadmill',
            tags: [],
          },
          secondaryKeywords: ['commercial treadmill'],
          outline: [{ heading: 'Motor specs', mustCover: ['HP rating'] }],
          faqPlan: [],
          statPlan: [],
          internalLinkTargets: [],
          source: 'impower',
        },
      },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('Motor specs');
    expect(prompt).toContain('commercial treadmill');
    expect(prompt).not.toContain('selfPlanned');
  });

  it('applies a tone override when given', () => {
    const prompt = buildCreatorPrompt(
      { seedTopic: 'T', targetWords: 900, brief: null, toneOverride: 'Playful and casual' },
      DEFAULT_USER_PROFILE
    );
    expect(prompt).toContain('Playful and casual');
  });
});
