import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { resetFakeDb } from './testHelpers';

type Mod = typeof import('./index');
let mod: Mod;

beforeEach(async () => {
  resetFakeDb();
  mod = await import('./index');
});

afterEach(() => resetFakeDb());

const article = (id: string, generatedAt: string) => ({ id, generatedAt, topic: id } as any);

describe('article store', () => {
  it('round-trips a single article', async () => {
    await mod.putArticle(article('a1', '2026-01-01T00:00:00Z'));
    expect((await mod.getArticle('a1'))?.topic).toBe('a1');
  });

  it('stores one record per article rather than one array', async () => {
    await mod.putArticle(article('a1', '2026-01-01T00:00:00Z'));
    await mod.putArticle(article('a2', '2026-01-02T00:00:00Z'));
    expect(await mod.listArticles()).toHaveLength(2);
  });

  it('returns newest first', async () => {
    await mod.putArticle(article('old', '2026-01-01T00:00:00Z'));
    await mod.putArticle(article('new', '2026-06-01T00:00:00Z'));
    const all = await mod.listArticles();
    expect(all[0].id).toBe('new');
    expect(all[1].id).toBe('old');
  });

  it('overwrites rather than duplicating on repeated puts', async () => {
    await mod.putArticle(article('a1', '2026-01-01T00:00:00Z'));
    await mod.putArticle({ ...article('a1', '2026-01-01T00:00:00Z'), topic: 'updated' });
    const all = await mod.listArticles();
    expect(all).toHaveLength(1);
    expect(all[0].topic).toBe('updated');
  });

  it('deletes one article', async () => {
    await mod.putArticle(article('a1', '2026-01-01T00:00:00Z'));
    await mod.deleteArticle('a1');
    expect(await mod.listArticles()).toHaveLength(0);
  });

  it('clears all articles', async () => {
    await mod.putArticle(article('a1', '2026-01-01T00:00:00Z'));
    await mod.clearArticles();
    expect(await mod.listArticles()).toHaveLength(0);
  });
});

describe('meta store', () => {
  it('round-trips a value', async () => {
    await mod.setMeta('profile', { businessName: 'Sehat Sentosa' });
    expect((await mod.getMeta<any>('profile')).businessName).toBe('Sehat Sentosa');
  });

  it('returns undefined for a missing key', async () => {
    expect(await mod.getMeta('nope')).toBeUndefined();
  });
});

describe('job store', () => {
  it('round-trips a job', async () => {
    await mod.putJob({
      jobId: 'j1',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect((await mod.getJob('j1'))?.jobId).toBe('j1');
  });
});
