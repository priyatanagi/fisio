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

async function run(config: Partial<PipelineConfig>, handlers: Record<string, any>) {
  for (const key of Object.keys(calls)) delete calls[key];
  (globalThis as any).__handlers = handlers;
  return runArticle({
    seedTopic: 'Treadmill buying',
    focusKeyphrase: 'treadmill',
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
    metrics: { wordCount: 12, readingTimeMinutes: 1, fleschScore: 0 },
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
