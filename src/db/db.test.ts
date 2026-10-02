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

const run = (runId: string, over: Record<string, unknown> = {}) => ({
  runId,
  seedTopic: `topic ${runId}`,
  status: 'running' as const,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...over,
});

describe('run journal', () => {
  it('round-trips a run record', async () => {
    await mod.putRun(run('r1', { focusKeyphrase: 'kw' }) as any);
    const stored = await mod.getRun('r1');
    expect(stored?.seedTopic).toBe('topic r1');
    expect(stored?.focusKeyphrase).toBe('kw');
  });

  it('overwrites a run instead of duplicating it', async () => {
    await mod.putRun(run('r1') as any);
    await mod.putRun(run('r1', { status: 'done', articleId: 'a1' }) as any);
    const all = await mod.listRuns();
    expect(all).toHaveLength(1);
    expect(all[0].status).toBe('done');
  });

  it('returns newest first', async () => {
    await mod.putRun(run('old', { updatedAt: '2026-01-01T00:00:00Z' }) as any);
    await mod.putRun(run('new', { updatedAt: '2026-06-01T00:00:00Z' }) as any);
    expect((await mod.listRuns()).map((r) => r.runId)).toEqual(['new', 'old']);
  });

  it('deletes a run', async () => {
    await mod.putRun(run('r1') as any);
    await mod.deleteRun('r1');
    expect(await mod.listRuns()).toHaveLength(0);
  });

  it('marks a run left running as interrupted', async () => {
    await mod.putRun(run('r1') as any);
    const changed = await mod.markInterruptedRuns();
    expect(changed).toBe(1);
    const stored = await mod.getRun('r1');
    expect(stored?.status).toBe('interrupted');
    expect(stored?.error).toMatch(/interrupted/i);
  });

  it('leaves finished runs alone when reconciling', async () => {
    await mod.putRun(run('done', { status: 'done' }) as any);
    await mod.putRun(run('failed', { status: 'failed' }) as any);
    expect(await mod.markInterruptedRuns()).toBe(0);
    expect((await mod.getRun('done'))?.status).toBe('done');
    expect((await mod.getRun('failed'))?.status).toBe('failed');
  });

  it('prunes old successes but keeps retryable runs', async () => {
    for (const id of ['d1', 'd2', 'd3']) {
      await mod.putRun(run(id, { status: 'done', updatedAt: `2026-01-0${id.slice(1)}T00:00:00Z` }) as any);
    }
    await mod.putRun(run('f1', { status: 'failed' }) as any);
    await mod.putRun(run('i1', { status: 'interrupted' }) as any);

    const removed = await mod.pruneRuns(2);
    expect(removed).toBe(1);

    const ids = (await mod.listRuns()).map((r) => r.runId);
    expect(ids).toContain('f1');
    expect(ids).toContain('i1');
    expect(ids).toHaveLength(4);
  });
});

describe('upgrading a v1 database', () => {
  it('keeps existing articles and adds the runs store', async () => {
    resetFakeDb();
    // Build the old shape first, exactly as a v1 install would have left it.
    await new Promise<void>((resolve, reject) => {
      const request = globalThis.indexedDB.open('fisio_architect', 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.createObjectStore('articles', { keyPath: 'id' });
        store.createIndex('generatedAt', 'generatedAt');
        db.createObjectStore('jobs', { keyPath: 'jobId' });
        db.createObjectStore('meta', { keyPath: 'key' });
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('articles', 'readwrite');
        tx.objectStore('articles').put({ id: 'legacy', topic: 'old article' });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      request.onerror = () => reject(request.error);
    });

    const fresh = await import('./index');
    const stored = await fresh.listArticles();
    expect(stored.map((a) => a.id)).toEqual(['legacy']);

    // The new store is usable straight away on the upgraded database.
    await fresh.putRun(run('r1') as any);
    expect(await fresh.listRuns()).toHaveLength(1);

    resetFakeDb();
  });
});
