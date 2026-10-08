import { describe, expect, it } from 'vitest';
import {
  articleStamp,
  chooseSettings,
  mergeArticleLists,
  rowToSettings,
  sanitizeCloudArticle,
  sanitizeCloudProfile,
  sanitizeCloudRules,
  settingsToRow,
  shrinkArticleForCloud,
} from './syncMerge';
import { DEFAULT_USER_PROFILE } from '../types/profile';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import type { ContentVersion, GeneratedArticle } from '../types/article';

function article(overrides: Partial<GeneratedArticle> = {}): GeneratedArticle {
  return {
    id: 'a1',
    topic: 'Treadmill',
    language: 'en',
    lengthTarget: 'standard',
    targetWordCount: 1200,
    formats: { 'clean-en': '<p>body</p>' },
    seoMetadata: {
      seoTitle: 'Title',
      headline: 'Headline',
      focusKeyphrase: 'treadmill',
      metaDescription: 'desc',
      urlSlug: 'treadmill',
      tags: [],
    },
    inlineCssHtml: '<p>inline</p>',
    cleanHtml: '<p>body</p>',
    imagePrompts: [],
    metrics: { wordCount: 100, readingTimeMinutes: 1, fleschScore: 65 },
    generatedAt: '2026-10-01T10:00:00.000Z',
    ...overrides,
  } as GeneratedArticle;
}

function contentVersion(version: number, savedAt: string, html = `v${version}`): ContentVersion {
  return { version, label: `v${version}`, savedAt, format: 'clean-en', html };
}

describe('articleStamp', () => {
  it('is the generation time when nothing was edited afterwards', () => {
    expect(articleStamp(article())).toBe('2026-10-01T10:00:00.000Z');
  });

  it('follows the newest saved version, because edits are the later revision', () => {
    const edited = article({
      contentVersions: [contentVersion(1, '2026-10-01T10:00:00.000Z'), contentVersion(2, '2026-10-05T08:00:00.000Z')],
      metadataVersions: [{ version: 1, label: 'x', savedAt: '2026-10-02T08:00:00.000Z', metadata: article().seoMetadata }],
    });
    expect(articleStamp(edited)).toBe('2026-10-05T08:00:00.000Z');
  });
});

describe('mergeArticleLists', () => {
  it('keeps the newer revision when both sides edited the same article', () => {
    const local = article({ cleanHtml: '<p>local</p>', generatedAt: '2026-10-01T10:00:00.000Z' });
    const cloud = article({ cleanHtml: '<p>cloud</p>', generatedAt: '2026-10-03T10:00:00.000Z' });

    const merged = mergeArticleLists([local], [cloud]);

    expect(merged.articles[0].cleanHtml).toBe('<p>cloud</p>');
    expect(merged.updatedIds).toEqual(['a1']);
  });

  it('prefers local on an exact tie, so a device that just wrote is not overwritten by its own copy', () => {
    const local = article({ cleanHtml: '<p>local</p>' });
    const cloud = article({ cleanHtml: '<p>cloud</p>' });
    expect(mergeArticleLists([local], [cloud]).articles[0].cleanHtml).toBe('<p>local</p>');
  });

  it('keeps articles that only exist on one side', () => {
    const result = mergeArticleLists([article({ id: 'only-local' })], [article({ id: 'only-cloud' })]);
    expect(result.articles.map((a) => a.id).sort()).toEqual(['only-cloud', 'only-local']);
    expect(result.addedIds).toEqual(['only-cloud']);
  });

  it('unions the version history so a trimmed cloud copy cannot shorten local history', () => {
    const local = article({
      generatedAt: '2026-10-05T10:00:00.000Z',
      contentVersions: [contentVersion(3, '2026-10-05T09:00:00.000Z'), contentVersion(4, '2026-10-05T10:00:00.000Z')],
    });
    // The cloud copy won on one axis: it is newer overall.
    // The cloud copy wins on time, and owns the shared version 4 entry.
    const cloud = article({
      generatedAt: '2026-10-06T10:00:00.000Z',
      contentVersions: [contentVersion(4, '2026-10-06T10:00:00.000Z', 'cloud4'), contentVersion(5, '2026-10-06T11:00:00.000Z')],
    });

    const merged = mergeArticleLists([local], [cloud]).articles[0];

    expect(merged.contentVersions?.map((v) => v.version)).toEqual([3, 4, 5]);
    expect(merged.contentVersions?.find((v) => v.version === 4)?.html).toBe('cloud4');
  });

  it('is empty-safe when one side has nothing', () => {
    expect(mergeArticleLists([], []).articles).toEqual([]);
    expect(mergeArticleLists([article()], []).articles).toHaveLength(1);
  });

  it('sorts newest first, matching the local history order', () => {
    const result = mergeArticleLists(
      [article({ id: 'old', generatedAt: '2026-01-01T00:00:00.000Z' })],
      [article({ id: 'new', generatedAt: '2026-09-01T00:00:00.000Z' })]
    );
    expect(result.articles.map((a) => a.id)).toEqual(['new', 'old']);
  });
});

describe('sanitizeCloudArticle', () => {
  it('accepts a well-formed row payload', () => {
    expect(sanitizeCloudArticle(article())?.id).toBe('a1');
  });

  it('rejects junk instead of letting it into history state', () => {
    expect(sanitizeCloudArticle(null)).toBeNull();
    expect(sanitizeCloudArticle('a1')).toBeNull();
    expect(sanitizeCloudArticle({ topic: 'no id' })).toBeNull();
    expect(sanitizeCloudArticle({ id: 42, topic: 'x', generatedAt: 'now' })).toBeNull();
    expect(sanitizeCloudArticle({ id: 'a1', generatedAt: 'now', formats: 'not an object' })).toBeNull();
  });
});

describe('shrinkArticleForCloud', () => {
  it('leaves a small article untouched', () => {
    const small = article();
    expect(shrinkArticleForCloud(small, 1024)).toBe(small);
  });

  it('drops the oldest versions first until the payload fits', () => {
    const big = article({
      contentVersions: Array.from({ length: 6 }, (_, i) =>
        contentVersion(i + 1, `2026-10-0${i + 1}T10:00:00.000Z`, 'x'.repeat(2000))
      ),
    });
    const shrunk = shrinkArticleForCloud(big, 8000);

    expect(shrunk).not.toBe(big);
    const versions = shrunk.contentVersions ?? [];
    expect(versions.length).toBeLessThan(6);
    expect(versions[versions.length - 1].version).toBe(6);
    // The article body itself always stays.
    expect(shrunk.formats).toEqual(big.formats);
  });
});

describe('sanitizeCloudProfile', () => {
  it('fills every missing field from the defaults', () => {
    const profile = sanitizeCloudProfile({ businessName: 'GymCo' });
    expect(profile?.businessName).toBe('GymCo');
    expect(profile?.niche).toBe(DEFAULT_USER_PROFILE.niche);
    expect(profile?.designRules.primaryColor).toBe(DEFAULT_USER_PROFILE.designRules.primaryColor);
  });

  it('keeps design tokens and exclusions that came back as proper values', () => {
    const profile = sanitizeCloudProfile({
      businessName: 'GymCo',
      designRules: { primaryColor: '#123456', bodyStyle: 'serif' },
      exclusions: ['no clinical'],
      formatOverrides: { 'clean-en': { primaryColor: '#abcdef' } },
    });
    expect(profile?.designRules.primaryColor).toBe('#123456');
    expect(profile?.exclusions).toEqual(['no clinical']);
    expect(profile?.formatOverrides?.['clean-en'].primaryColor).toBe('#abcdef');
  });

  it('falls back when a whole profile is nonsense', () => {
    expect(sanitizeCloudProfile(42)).toBeNull();
  });
});

describe('sanitizeCloudRules', () => {
  it('keeps valid numbers and booleans', () => {
    const rules = sanitizeCloudRules({ ...DEFAULT_UNIVERSAL_RULES, maxSentenceWords: 24 });
    expect(rules?.maxSentenceWords).toBe(24);
    expect(rules?.requireStats).toBe(true);
  });

  it('replaces a damaged number or flag with the default rather than an undefined', () => {
    const rules = sanitizeCloudRules({ maxSentenceWords: 'twenty', requireFaq: 'yes' });
    expect(rules?.maxSentenceWords).toBe(DEFAULT_UNIVERSAL_RULES.maxSentenceWords);
    expect(rules?.requireFaq).toBe(DEFAULT_UNIVERSAL_RULES.requireFaq);
  });

  it('rejects a non-object', () => {
    expect(sanitizeCloudRules('rules')).toBeNull();
  });
});

describe('settings row mapping', () => {
  const settings = {
    profile: DEFAULT_USER_PROFILE,
    universalRules: DEFAULT_UNIVERSAL_RULES,
    pipelineConfig: {
      judge: true,
      impower: 'standard' as const,
      reviewer: 'strict' as const,
      targetFormats: ['clean-en' as const],
      languages: ['en' as const],
      targetWords: 1200,
    },
    updatedAt: '2026-10-05T10:00:00.000Z',
  };

  it('writes the workspace secret and snake_case columns the policy expects', () => {
    const row = settingsToRow(settings, 'secret-1');
    expect(row.workspace_secret).toBe('secret-1');
    expect(row.updated_at).toBe('2026-10-05T10:00:00.000Z');
    expect((row.profile as { businessName: string }).businessName).toBe('');
  });

  it('reads the row back and sanitizes each part', () => {
    const row = settingsToRow(settings, 'secret-1');
    const parsed = rowToSettings(row);
    expect(parsed?.updatedAt).toBe('2026-10-05T10:00:00.000Z');
    expect(parsed?.pipelineConfig.targetWords).toBe(1200);
  });

  it('ignores a row whose payload is damaged', () => {
    expect(rowToSettings({ updated_at: 'x' })).toBeNull();
  });

  it('picks the newer side, and local on a tie', () => {
    const older = { ...settings, updatedAt: '2026-10-01T00:00:00.000Z' };
    expect(chooseSettings(older, settings)).toBe('cloud');
    expect(chooseSettings(settings, older)).toBe('local');
    expect(chooseSettings(settings, settings)).toBe('local');
  });
});
