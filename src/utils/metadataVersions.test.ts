import { describe, it, expect } from 'vitest';
import {
  appendMetadataVersion,
  formatVersionStamp,
  metadataDiff,
  restoreMetadataVersion,
  seedMetadataVersions,
  versionsFor,
} from './metadataVersions';
import type { SeoMetadata } from '../types/article';

const metadata: SeoMetadata = {
  seoTitle: 'Original title',
  headline: 'Original headline',
  focusKeyphrase: 'treadmill',
  metaDescription: 'Original description that is long enough to be a real description.',
  urlSlug: 'original-slug',
  tags: ['gym'],
};

const GENERATED_AT = '2026-10-06T09:15:00.000Z';

describe('seedMetadataVersions', () => {
  it('records version 1 as the pipeline output', () => {
    const [first] = seedMetadataVersions(metadata, GENERATED_AT);
    expect(first.version).toBe(1);
    expect(first.label).toBe('Original output');
    expect(first.savedAt).toBe(GENERATED_AT);
    expect(first.metadata).toEqual(metadata);
  });

  it('copies the metadata rather than aliasing it', () => {
    const [first] = seedMetadataVersions(metadata, GENERATED_AT);
    first.metadata.seoTitle = 'mutated';
    expect(metadata.seoTitle).toBe('Original title');
  });
});

describe('versionsFor', () => {
  it('seeds from the article own metadata when there is no history', () => {
    const versions = versionsFor(undefined, metadata, GENERATED_AT);
    expect(versions).toHaveLength(1);
    expect(versions[0].version).toBe(1);
  });

  it('keeps an existing history rather than reseeding it', () => {
    const existing = seedMetadataVersions(metadata, GENERATED_AT);
    expect(versionsFor(existing, metadata, GENERATED_AT)).toBe(existing);
  });

  it('seeds when the stored history is empty', () => {
    expect(versionsFor([], metadata, GENERATED_AT)).toHaveLength(1);
  });
});

describe('appendMetadataVersion', () => {
  it('numbers the next version after the highest one present', () => {
    const history = seedMetadataVersions(metadata, GENERATED_AT);
    const next = appendMetadataVersion(history, { ...metadata, seoTitle: 'Changed' });
    expect(next[1].version).toBe(2);
    expect(next[1].metadata.seoTitle).toBe('Changed');
  });

  it('continues from a history that skipped a number', () => {
    const history = seedMetadataVersions(metadata, GENERATED_AT);
    history.push({ version: 7, label: 'x', savedAt: GENERATED_AT, metadata });
    expect(appendMetadataVersion(history, metadata)[2].version).toBe(8);
  });

  it('keeps the previous versions so the original is never lost', () => {
    const history = seedMetadataVersions(metadata, GENERATED_AT);
    const next = appendMetadataVersion(history, { ...metadata, seoTitle: 'Changed' });
    expect(next[0].metadata.seoTitle).toBe('Original title');
  });

  it('uses a label the reader supplied', () => {
    const history = seedMetadataVersions(metadata, GENERATED_AT);
    expect(appendMetadataVersion(history, metadata, { label: 'Indonesian variant' })[1].label).toBe(
      'Indonesian variant'
    );
  });

  it('stamps a version saved without a label with its date and hour', () => {
    const history = seedMetadataVersions(metadata, GENERATED_AT);
    const savedAt = new Date(2026, 9, 6, 14, 32, 0, 0).toISOString();
    const next = appendMetadataVersion(history, metadata, { savedAt });
    const saved = next[next.length - 1];
    expect(saved.savedAt).toBe(savedAt);
    expect(saved.label).toBe('Edited 06 Oct 2026, 14:32');
    expect(formatVersionStamp(saved.savedAt)).toBe('06 Oct 2026, 14:32');
  });
});

describe('restoreMetadataVersion', () => {
  it('returns the metadata of the requested version', () => {
    const history = appendMetadataVersion(seedMetadataVersions(metadata, GENERATED_AT), {
      ...metadata,
      seoTitle: 'Changed',
    });
    const restored = restoreMetadataVersion(history, 1);
    expect(restored?.metadata.seoTitle).toBe('Original title');
  });

  it('records the restore as a new version instead of rewriting history', () => {
    const history = seedMetadataVersions(metadata, GENERATED_AT);
    const restored = restoreMetadataVersion(history, 1);
    expect(restored?.versions).toHaveLength(2);
    expect(restored?.versions[1].label).toBe('Restored v1');
  });

  it('returns null for a version that does not exist', () => {
    expect(restoreMetadataVersion(seedMetadataVersions(metadata, GENERATED_AT), 99)).toBeNull();
  });
});

describe('metadataDiff', () => {
  it('reports nothing when the version matches what is in play', () => {
    expect(metadataDiff(metadata, metadata)).toEqual([]);
  });

  it('names the field that changed and both values', () => {
    const diff = metadataDiff(metadata, { ...metadata, seoTitle: 'New title' });
    expect(diff).toEqual([{ field: 'SEO Title', from: 'Original title', to: 'New title' }]);
  });

  it('compares tags as a list, not as an object', () => {
    const diff = metadataDiff(metadata, { ...metadata, tags: ['gym', 'cardio'] });
    expect(diff[0]).toEqual({ field: 'Tags', from: 'gym', to: 'gym, cardio' });
  });
});

describe('formatVersionStamp', () => {
  // Built from local-time parts, so the assertions compare against the same
  // local parts rather than a hardcoded UTC reading.
  const at = (y: number, month: number, day: number, hour: number, minute: number) =>
    new Date(y, month, day, hour, minute, 0, 0).toISOString();

  it('shows the date and the hour', () => {
    const stamp = formatVersionStamp(at(2026, 9, 6, 14, 32));
    expect(stamp).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2}$/);
  });

  it('pads single-digit days and hours', () => {
    expect(formatVersionStamp(at(2026, 0, 5, 8, 7))).toMatch(/^05 \w{3} 2026, 08:07$/);
  });

  it('names the month rather than printing a number', () => {
    expect(formatVersionStamp(at(2026, 0, 5, 8, 7))).toContain('Jan');
    expect(formatVersionStamp(at(2026, 9, 6, 8, 7))).toContain('Oct');
  });

  it('reports an unreadable timestamp rather than printing NaN', () => {
    expect(formatVersionStamp('not-a-date')).toBe('unknown time');
  });
});