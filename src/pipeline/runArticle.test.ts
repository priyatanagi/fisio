import { describe, it, expect, vi } from 'vitest';

const calls: Record<string, number> = {};

vi.mock('./runAgent', () => ({
  AgentError: class AgentError extends Error {
    constructor(
      message: string,
      public recoverable: boolean,
      public aborted = false
    ) {
      super(message);
      this.name = 'AgentError';
    }
  },
  runAgent: async (options: any) => {
    const role = options.role;
    calls[role] = (calls[role] ?? 0) + 1;
    const handler = (globalThis as any).__handlers?.[role];
    if (!handler) throw new Error(`No handler for ${role}`);
    const value = await handler(options.input);
    if (value instanceof Error) throw value;
    return value;
  },
}));

import { runArticle, resumeArticle } from './runArticle';
import { DEFAULT_USER_PROFILE } from '../types/profile';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import { extractDocument } from '../utils/document';
import { readabilityFromText } from '../utils/readability';
import type { PipelineConfig } from './stages';

const multiAgentConfig: any = {
  judge: { provider: 'gemini', model: 'm', apiKey: 'k', baseUrl: '' },
  impower: { provider: 'gemini', model: 'm', apiKey: 'k', baseUrl: '' },
  creator: { provider: 'gemini', model: 'm', apiKey: 'k', baseUrl: '' },
  reviewer: { provider: 'gemini', model: 'm', apiKey: 'k', baseUrl: '' },
  designer: { provider: 'gemini', model: 'm', apiKey: 'k', baseUrl: '' },
};

const markdown = '# Choosing a Treadmill\n\nSome body content for the article.';
const html = '<article><p>Body</p></article>';

const judgeOutput = {
  refinedTopic: 'Choosing a commercial treadmill',
  searchIntent: 'commercial',
  audienceAngle: 'for owners',
  subtopics: ['a', 'b'],
  rejectedAngles: [],
};

const brief = {
  seoMetadata: {
    seoTitle: 'T',
    headline: 'H',
    focusKeyphrase: 'kw',
    metaDescription: 'M',
    urlSlug: 's',
    tags: [],
  },
  secondaryKeywords: [],
  outline: [],
  faqPlan: [],
  statPlan: [],
  internalLinkTargets: [],
  source: 'impower' as const,
};

const pass = { verdict: 'pass' as const, seoScore: 90, issues: [], revisedAfterIssues: false };
const fail = {
  verdict: 'fail' as const,
  seoScore: 30,
  issues: [
    {
      severity: 'blocker' as const,
      category: 'fact' as const,
      message: 'bad stat',
      suggestedFix: 'remove',
    },
  ],
  revisedAfterIssues: false,
};

const baseConfig: PipelineConfig = {
  judge: false,
  impower: 'off',
  reviewer: 'off',
  targetFormats: ['inline-en'],
  languages: ['en'],
  targetWords: 900,
};

async function run(
  config: Partial<PipelineConfig>,
  handlers: Record<string, any>,
  topic: { seedTopic?: string; focusKeyphrase?: string } = {}
) {
  for (const key of Object.keys(calls)) delete calls[key];
  (globalThis as any).__handlers = handlers;
  return runArticle({
    seedTopic: topic.seedTopic ?? 'Treadmill buying',
    focusKeyphrase: topic.focusKeyphrase ?? 'treadmill',
    config: { ...baseConfig, ...config },
    profile: DEFAULT_USER_PROFILE,
    multiAgentConfig,
    universalRules: DEFAULT_UNIVERSAL_RULES,
    onStage: () => {},
    signal: new AbortController().signal,
  });
}

const total = () => Object.values(calls).reduce((a, b) => a + b, 0);

describe('floor configuration', () => {
  it('makes exactly two provider calls with everything off', async () => {
    const result = await run({}, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(total()).toBe(2);
    expect(calls.creator).toBe(1);
    expect(calls.designer).toBe(1);
    expect(result.status).toBe('done');
  });

  it('never calls Judge when judge is disabled', async () => {
    await run({ judge: false }, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.judge).toBeUndefined();
  });

  it('never calls Impower when impower is off', async () => {
    await run({ impower: 'off' }, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.impower).toBeUndefined();
  });

  it('never calls the Reviewer when the reviewer is off', async () => {
    await run({ judge: false, impower: 'off', reviewer: 'off' }, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.reviewer).toBeUndefined();
  });

  it('invokes nothing but Creator and Designer when all three are switched off', async () => {
    const result = await run({ judge: false, impower: 'off', reviewer: 'off' }, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(total()).toBe(2);
    expect(Object.keys(calls).sort()).toEqual(['creator', 'designer']);
    expect(result.status).toBe('done');
  });

  it('feeds the refined topic from Judge to Creator', async () => {
    let received = '';
    await run({ judge: true }, {
      judge: () => judgeOutput,
      creator: (input: any) => {
        received = input.seedTopic;
        return { markdownContent: markdown };
      },
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.judge).toBe(1);
    expect(received).toBe('Choosing a commercial treadmill');
  });
});

describe('user topic integrity', () => {
  const SEED = 'Program Makan Bergizi Gratis';
  const KEYWORD = 'makan bergizi gratis';
  const DRIFTED = 'Optimalisasi Infrastruktur Kebugaran untuk Fasilitas Berkinerja Tinggi';

  const handlers = (seen: Record<string, any>) => ({
    judge: (input: any) => {
      seen.judge = input;
      return { ...judgeOutput, refinedTopic: DRIFTED };
    },
    impower: (input: any) => {
      seen.impower = input;
      return brief;
    },
    creator: (input: any) => {
      seen.creator = input;
      return { markdownContent: markdown };
    },
    designer: () => ({ html, warnings: [] }),
  });

  it('never lets a drifted judge angle replace the topic the user typed', async () => {
    const seen: Record<string, any> = {};
    const result = await run(
      { judge: true, impower: 'standard', reviewer: 'off' },
      handlers(seen),
      { seedTopic: SEED, focusKeyphrase: KEYWORD }
    );

    expect(seen.judge.seedTopic).toBe(SEED);
    expect(seen.impower.topic).toBe(SEED);
    expect(seen.creator.seedTopic).toBe(SEED);
    expect(result.article?.topic).toBe(SEED);
  });

  it('carries the user focus keyphrase into Impower and Creator', async () => {
    const seen: Record<string, any> = {};
    await run(
      { judge: true, impower: 'standard', reviewer: 'off' },
      handlers(seen),
      { seedTopic: SEED, focusKeyphrase: KEYWORD }
    );

    expect(seen.impower.focusKeyphrase).toBe(KEYWORD);
    expect(seen.creator.focusKeyphrase).toBe(KEYWORD);
  });

  it('keeps the user keyphrase when Impower and Judge are both off', async () => {
    const seen: Record<string, any> = {};
    const result = await run(
      { judge: false, impower: 'off', reviewer: 'off' },
      {
        creator: (input: any) => {
          seen.creator = input;
          return { markdownContent: markdown };
        },
        designer: () => ({ html, warnings: [] }),
      },
      { seedTopic: SEED, focusKeyphrase: KEYWORD }
    );

    expect(seen.creator.seedTopic).toBe(SEED);
    expect(seen.creator.focusKeyphrase).toBe(KEYWORD);
    // With no brief supplied, the keyphrase is resolved from the creator's
    // self-plan or this pinned one, so the article still lands on the keyword.
    expect(result.article?.seoMetadata.focusKeyphrase).toBe(KEYWORD);
    expect(result.article?.topic).toBe(SEED);
  });

  it('still accepts a judge refinement that stays on the user subject', async () => {
    const seen: Record<string, any> = {};
    await run(
      { judge: true, impower: 'off', reviewer: 'off' },
      {
        judge: () => judgeOutput,
        creator: (input: any) => {
          seen.creator = input;
          return { markdownContent: markdown };
        },
        designer: () => ({ html, warnings: [] }),
      },
      { seedTopic: 'Treadmill buying', focusKeyphrase: 'treadmill' }
    );

    expect(seen.creator.seedTopic).toBe('Choosing a commercial treadmill');
  });
});

describe('Impower levels', () => {
  it('makes one call at standard', async () => {
    await run({ impower: 'standard' }, {
      impower: () => brief,
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.impower).toBe(1);
  });

  it('makes one call at lite', async () => {
    await run({ impower: 'lite' }, {
      impower: () => brief,
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.impower).toBe(1);
  });

  it('makes two calls at max (research then brief)', async () => {
    await run({ impower: 'max' }, {
      research: () => ({
        primaryKeyword: 'kw',
        secondaryKeywords: [],
        lsiEntities: [],
        questionQueries: [],
        intentModifiers: [],
      }),
      impower: () => brief,
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.research).toBe(1);
    expect(calls.impower).toBe(1);
  });
});

describe('Reviewer modes', () => {
  it('never calls Reviewer when off', async () => {
    await run({ reviewer: 'off' }, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.reviewer).toBeUndefined();
  });

  it('does not block in advisory mode', async () => {
    const result = await run({ reviewer: 'advisory' }, {
      reviewer: () => fail,
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.creator).toBe(1);
    expect(calls.designer).toBe(1);
    expect(result.status).toBe('done');
    expect(result.reviewReport?.verdict).toBe('fail');
  });

  it('forces exactly one revision then halts in strict mode', async () => {
    const result = await run({ reviewer: 'strict' }, {
      reviewer: () => fail,
      creator: () => ({ markdownContent: markdown }),
    });
    expect(calls.creator).toBe(2);
    expect(calls.reviewer).toBe(2);
    expect(calls.designer).toBeUndefined();
    expect(result.status).toBe('needs_attention');
  });

  it('proceeds to design when the revision passes', async () => {
    let attempt = 0;
    const result = await run({ reviewer: 'strict' }, {
      reviewer: () => (++attempt === 1 ? fail : pass),
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.creator).toBe(2);
    expect(result.status).toBe('done');
    expect(calls.designer).toBe(1);
  });

  it('retains the markdown on needs_attention', async () => {
    const result = await run({ reviewer: 'strict' }, {
      reviewer: () => fail,
      creator: () => ({ markdownContent: markdown }),
    });
    expect(result.article?.rawText).toContain('Some body content');
  });

  it('records reviewPassed as true when the review passes', async () => {
    const result = await run({ reviewer: 'strict' }, {
      reviewer: () => pass,
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(result.article?.reviewPassed).toBe(true);
  });
});

describe('Designer fan-out', () => {
  it('makes one call per requested format', async () => {
    await run(
      { targetFormats: ['inline-en', 'clean-en', 'inline-id'], languages: ['en', 'id'] },
      {
        creator: () => ({ markdownContent: markdown }),
        designer: () => ({ html, warnings: [] }),
      }
    );
    expect(calls.designer).toBe(3);
  });

  it('filters formats by the configured languages', async () => {
    const result = await run(
      { targetFormats: ['inline-en', 'inline-id'], languages: ['en'] },
      {
        creator: () => ({ markdownContent: markdown }),
        designer: () => ({ html, warnings: [] }),
      }
    );
    expect(calls.designer).toBe(1);
    expect(Object.keys(result.article!.formats)).toEqual(['inline-en']);
  });

  it('freezes a profile snapshot on the article', async () => {
    const result = await run({}, {
      creator: () => ({ markdownContent: markdown }),
      designer: () => ({ html, warnings: [] }),
    });
    expect(result.article?.profileSnapshot).toBeDefined();
  });
});

describe('failure handling', () => {
  it('returns failed rather than throwing when a stage throws', async () => {
    const result = await run({}, {
      creator: () => new Error('provider exploded'),
      designer: () => ({ html, warnings: [] }),
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('provider exploded');
  });
});

function makeStalled(): any {
  const measured = readabilityFromText(extractDocument(markdown, 'markdown').text, 'en');
  return {
    id: 'art_stalled_1',
    topic: 'Choosing a commercial treadmill',
    focusKeyphrase: 'kw',
    secondaryKeywords: 'a, b',
    language: 'en',
    lengthTarget: 'custom',
    targetWordCount: 900,
    targetFormats: ['inline-en'],
    formats: {},
    seoMetadata: brief.seoMetadata,
    inlineCssHtml: '',
    cleanHtml: '',
    imagePrompts: [],
    metrics: {
      wordCount: measured.wordCount,
      readingTimeMinutes: Math.max(1, Math.ceil(measured.wordCount / 200)),
      fleschScore: measured.fleschReadingEase,
    },
    generatedAt: new Date().toISOString(),
    rawText: markdown,
    pipelineConfig: baseConfig,
    profileSnapshot: DEFAULT_USER_PROFILE,
    reviewReport: fail,
    reviewPassed: false,
  };
}

async function resume(
  action: 'retry_creator' | 'skip_designer',
  handlers: Record<string, any>,
  stalled: any = makeStalled()
) {
  for (const key of Object.keys(calls)) delete calls[key];
  (globalThis as any).__handlers = handlers;
  return resumeArticle(
    stalled,
    {
      seedTopic: 'Treadmill buying',
      focusKeyphrase: 'treadmill',
      config: { ...baseConfig, reviewer: 'strict' },
      profile: DEFAULT_USER_PROFILE,
      multiAgentConfig,
      universalRules: DEFAULT_UNIVERSAL_RULES,
      onStage: () => {},
      signal: new AbortController().signal,
    },
    action
  );
}

describe('resumeArticle — skip to designer', () => {
  it('renders only the Designer and keeps the same article id', async () => {
    const result = await resume('skip_designer', {
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.creator).toBeUndefined();
    expect(calls.reviewer).toBeUndefined();
    expect(calls.designer).toBe(1);
    expect(result.status).toBe('done');
    expect(result.article!.id).toBe('art_stalled_1');
    expect(result.article!.formats['inline-en']).toBe(html);
  });

  it('never calls the Reviewer even in strict mode', async () => {
    await resume('skip_designer', {
      reviewer: () => pass,
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.reviewer).toBeUndefined();
  });

  it('returns failed when the Designer throws', async () => {
    const result = await resume('skip_designer', {
      designer: () => new Error('designer exploded'),
    });
    expect(result.status).toBe('failed');
    expect(result.error).toContain('designer exploded');
  });
});

describe('resumeArticle — retry creator', () => {
  it('runs Creator, Reviewer, then Designer when the retry passes', async () => {
    const result = await resume('retry_creator', {
      creator: () => ({ markdownContent: markdown }),
      reviewer: () => pass,
      designer: () => ({ html, warnings: [] }),
    });
    expect(calls.creator).toBe(1);
    expect(calls.reviewer).toBe(1);
    expect(calls.designer).toBe(1);
    expect(result.status).toBe('done');
    expect(result.article!.reviewPassed).toBe(true);
    expect(result.article!.id).toBe('art_stalled_1');
  });

  it('halts again with no Designer call when the retry still fails', async () => {
    const result = await resume('retry_creator', {
      creator: () => ({ markdownContent: markdown }),
      reviewer: () => fail,
    });
    expect(calls.creator).toBe(2);
    expect(calls.reviewer).toBe(2);
    expect(calls.designer).toBeUndefined();
    expect(result.status).toBe('needs_attention');
    expect(result.article!.id).toBe('art_stalled_1');
    expect(result.article!.rawText).toContain('Some body content');
  });
});

describe('measured metrics', () => {
  it('records a measured Flesch score instead of a zero placeholder', async () => {
    const result = await run({ judge: false, impower: 'off', reviewer: 'off', targetWords: 900 }, {
      creator: () => ({
        markdownContent:
          '# Judul Artikel\n\nProgram makan bergizi gratis menyediakan makan siang gratis bagi anak sekolah. ' +
          'Program ini berjalan setiap hari kerja di sekolah. Dapur berada di dalam sekolah masing-masing.\n\n' +
          '## Sasaran\n\nSasaran utama adalah anak sekolah dasar kelas satu sampai enam. Pendaftaran dilakukan ' +
          'pada awal tahun ajaran. Biaya program ditanggung oleh pemerintah pusat.\n\n' +
          '## Distribusi\n\nDistribusi dilakukan melalui dapur yang dikelola sekolah. Pengambilan berlangsung ' +
          'saat jam istirahat. Jadwal distribusi berjalan setiap hari kerja tanpa kecuali.\n',
      }),
      designer: () => ({
        html: '<article><h2>Sasaran</h2><p>Sasaran utama adalah anak sekolah dasar kelas satu sampai enam. Pendaftaran dilakukan pada awal tahun ajaran.</p></article>',
        warnings: [],
      }),
    });
    const article = result.article!;
    expect(article.metrics.fleschScore).toBeGreaterThan(0);
    expect(article.score).toBeDefined();
    expect(article.score?.flesch).toBeGreaterThan(0);
    expect(article.score?.checks).toHaveLength(16);
  });
});
