import { describe, expect, it } from 'vitest';
import {
  CONTENT_VERSION_CAP,
  appendContentVersion,
  contentVersionsFor,
  restoreContentVersion,
} from './contentVersions';
import type { ContentVersion } from '../types/article';

const make = (version: number, format: ContentVersion['format'] = 'inline-en'): ContentVersion => ({
  version,
  label: `v${version}`,
  savedAt: '2026-10-01T10:00:00.000Z',
  format,
  html: `<p>body ${version}</p>`,
});

describe('appendContentVersion', () => {
  it('starts at 1 and increments', () => {
    const first = appendContentVersion(undefined, '<p>a</p>', 'inline-en', {
      savedAt: '2026-10-01T10:00:00.000Z',
    });
    expect(first).toHaveLength(1);
    expect(first[0].version).toBe(1);
    expect(first[0].html).toBe('<p>a</p>');
    expect(first[0].format).toBe('inline-en');

    const second = appendContentVersion(first, '<p>b</p>', 'clean-en', {
      savedAt: '2026-10-01T11:00:00.000Z',
    });
    expect(second[1].version).toBe(2);
    expect(second[1].format).toBe('clean-en');
  });

  it('uses the given label, or a timestamped default when blank', () => {
    const labelled = appendContentVersion(undefined, 'x', 'inline-en', { label: '  After review  ' });
    expect(labelled[0].label).toBe('After review');

    const unlabelled = appendContentVersion(undefined, 'x', 'inline-en', {
      savedAt: '2026-10-01T10:00:00.000Z',
    });
    expect(unlabelled[0].label).toMatch(/^Edited \d{2} \w{3} \d{4}, \d{2}:\d{2}$/);
  });

  it('drops the oldest entries past the cap while numbers keep climbing', () => {
    let versions: ContentVersion[] = [];
    for (let i = 0; i < CONTENT_VERSION_CAP + 5; i++) {
      versions = appendContentVersion(versions, `<p>${i}</p>`, 'inline-en', {
        savedAt: '2026-10-01T10:00:00.000Z',
      });
    }
    expect(versions).toHaveLength(CONTENT_VERSION_CAP);
    expect(versions[versions.length - 1].version).toBe(CONTENT_VERSION_CAP + 5);
    expect(versions[0].version).toBe(6);
  });
});

describe('restoreContentVersion', () => {
  it('returns the snapshot and records a Restored entry', () => {
    const versions = [make(1), make(2)];
    const restored = restoreContentVersion(versions, 1);
    expect(restored).not.toBeNull();
    expect(restored!.html).toBe('<p>body 1</p>');
    expect(restored!.format).toBe('inline-en');
    expect(restored!.versions).toHaveLength(3);
    expect(restored!.versions[2]).toMatchObject({ version: 3, label: 'Restored v1' });
  });

  it('returns null for a version that is not in the history', () => {
    expect(restoreContentVersion([make(1)], 99)).toBeNull();
    expect(restoreContentVersion(undefined, 1)).toBeNull();
  });
});

describe('contentVersionsFor', () => {
  it('keeps only the snapshots of the requested format', () => {
    const versions = [make(1, 'inline-en'), make(2, 'clean-en'), make(3, 'inline-en')];
    const filtered = contentVersionsFor(versions, 'inline-en');
    expect(filtered.map((entry) => entry.version)).toEqual([1, 3]);
  });

  it('treats a missing history as empty', () => {
    expect(contentVersionsFor(undefined, 'inline-en')).toEqual([]);
  });
});
