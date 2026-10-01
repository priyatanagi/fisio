import { describe, it, expect, beforeEach } from 'vitest';
import 'fake-indexeddb/auto';
import { resetFakeDb } from './testHelpers';

const LS_KEY = 'fitseo_history';

beforeEach(() => {
  resetFakeDb();
  localStorage.clear();
});

describe('runMigration', () => {
  it('migrates localStorage history into per-article records', async () => {
    localStorage.setItem(
      LS_KEY,
      JSON.stringify([
        { id: 'a', generatedAt: '2026-01-01T00:00:00Z', topic: 'one' },
        { id: 'b', generatedAt: '2026-01-02T00:00:00Z', topic: 'two' },
      ])
    );
    const { runMigration } = await import('./migrate');
    await runMigration();
    const db = await import('./index');
    expect(await db.listArticles()).toHaveLength(2);
    expect(localStorage.getItem(LS_KEY)).toBeNull();
    expect(await db.getMeta('schemaVersion')).toBe(1);
  });

  it('is a no-op when schemaVersion is already current', async () => {
    const db0 = await import('./index');
    await db0.setMeta('schemaVersion', 1);
    localStorage.setItem(LS_KEY, JSON.stringify([{ id: 'x', topic: 'y' }]));
    const { runMigration } = await import('./migrate');
    await runMigration();
    expect(await db0.listArticles()).toHaveLength(0);
  });

  it('never throws on malformed localStorage JSON', async () => {
    localStorage.setItem(LS_KEY, '{not json');
    const { runMigration } = await import('./migrate');
    await expect(runMigration()).resolves.toBeUndefined();
  });

  it('never throws when there is nothing to migrate', async () => {
    const { runMigration } = await import('./migrate');
    await expect(runMigration()).resolves.toBeUndefined();
  });
});
