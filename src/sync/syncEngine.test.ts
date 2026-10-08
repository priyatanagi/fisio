import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  articleToRow,
  deleteArticleEverywhere,
  nextRetryDelay,
  runPushCycle,
  runSyncCycle,
  testCloudConnection,
  type SyncEngineDeps,
} from './syncEngine';
import { createQueue, type QueueStore } from './syncQueue';
import { createTombstones, type Tombstone, type TombstoneStore } from './tombstones';
import { DEFAULT_USER_PROFILE } from '../types/profile';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import { DEFAULT_PIPELINE_CONFIG } from '../pipeline/stages';
import type { GeneratedArticle } from '../types/article';
import type { CloudRow } from './supabaseRest';
import type { CloudSettings } from './syncMerge';

const config = { url: 'https://demo.supabase.co', anonKey: 'anon', secret: 'sec-1' };

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
    inlineCssHtml: '',
    cleanHtml: '<p>body</p>',
    imagePrompts: [],
    metrics: { wordCount: 10, readingTimeMinutes: 1, fleschScore: 60 },
    generatedAt: '2026-10-02T10:00:00.000Z',
    ...overrides,
  } as GeneratedArticle;
}

/** A tiny PostgREST stand-in: routing by table + method, records what was sent. */
function fakeServer(state: { articles: CloudRow[]; settings: CloudRow[] }) {
  const calls: { method: string; url: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = String(input);
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ method, url, body });

    if (url.includes('/rpc/fisio_cloud_handshake')) {
      return Response.json({
        header_present: true,
        articles_visible: state.articles.length,
        settings_visible: state.settings.length,
      });
    }
    if (url.includes('fisio_settings')) {
      if (method === 'GET') {
        return Response.json(state.settings, { headers: { 'Content-Range': `0-${Math.max(0, state.settings.length - 1)}/${state.settings.length}` } });
      }
      if (method === 'PATCH') {
        state.settings = state.settings.map((s) => ({ ...s, ...(body as CloudRow) }));
        return new Response(null, { status: 204 });
      }
      for (const row of body as CloudRow[]) {
        state.settings = [row, ...state.settings.filter((s) => s.workspace_secret !== row.workspace_secret)];
      }
      return new Response(null, { status: 204 });
    }
    if (url.includes('fisio_articles')) {
      if (method === 'GET') {
        return Response.json(state.articles, { headers: { 'Content-Range': `0-${Math.max(0, state.articles.length - 1)}/${state.articles.length}` } });
      }
      if (method === 'DELETE') {
        const id = decodeURIComponent(url.split('id=eq.')[1] ?? '');
        state.articles = state.articles.filter((row) => row.id !== id);
        return new Response(null, { status: 204 });
      }
      if (method === 'PATCH') {
        const id = decodeURIComponent(url.split('id=eq.')[1] ?? '');
        state.articles = state.articles.map((row) => (row.id === id ? { ...row, ...(body as CloudRow) } : row));
        return new Response(null, { status: 204 });
      }
      for (const row of body as CloudRow[]) {
        state.articles = [row, ...state.articles.filter((a) => a.id !== row.id)];
      }
      return new Response(null, { status: 204 });
    }
    return Response.json({ message: 'unhandled' }, { status: 404 });
  });
  return { fetchMock, calls };
}

function memoryTombstoneStore(): TombstoneStore {
  let value: Tombstone[] = [];
  return {
    load: async () => value.map((entry) => ({ ...entry })),
    save: async (rows) => {
      value = rows.map((entry) => ({ ...entry }));
    },
  };
}

const DEFAULT_SETTINGS: CloudSettings = {
  profile: DEFAULT_USER_PROFILE,
  universalRules: DEFAULT_UNIVERSAL_RULES,
  pipelineConfig: DEFAULT_PIPELINE_CONFIG,
  updatedAt: '2026-10-01T00:00:00.000Z',
};

function makeDeps(
  local: GeneratedArticle[],
  server: { articles: CloudRow[]; settings: CloudRow[] }
): { deps: SyncEngineDeps; writes: GeneratedArticle[]; applied: unknown[] } {
  const store: QueueStore = {
    load: async () => null,
    save: async () => undefined,
  };
  const writes: GeneratedArticle[] = [];
  const applied: unknown[] = [];
  const byId = new Map(local.map((a) => [a.id, a]));
  return {
    deps: {
      config: () => config,
      queue: createQueue(store),
      tombstones: createTombstones(memoryTombstoneStore()),
      listLocal: async () => local,
      getLocal: async (id) => byId.get(id),
      writeLocal: async (a) => {
        writes.push(a);
        byId.set(a.id, a);
      },
      removeLocal: async (id) => {
        byId.delete(id);
      },
      readSettings: () => DEFAULT_SETTINGS,
      applySettings: (settings) => void applied.push(settings),
    },
    writes,
    applied,
  };
}

beforeEach(() => vi.unstubAllGlobals());

describe('articleToRow', () => {
  it('carries the secret, the flat topic and the stamp the policy and merge need', () => {
    const row = articleToRow(article({ id: 'a9' }), 'sec-1');
    expect(row).toMatchObject({
      id: 'a9',
      workspace_secret: 'sec-1',
      topic: 'Treadmill',
      updated_at: '2026-10-02T10:00:00.000Z',
    });
    expect((row.article as GeneratedArticle).id).toBe('a9');
  });
});

describe('runSyncCycle', () => {
  it('pulls a cloud article the browser has never seen and stores it locally', async () => {
    const cloudRow = articleToRow(article({ id: 'from-cloud' }), 'sec-1');
    const server = { articles: [cloudRow], settings: [] };
    vi.stubGlobal('fetch', fakeServer(server).fetchMock);
    const { deps, writes } = makeDeps([article({ id: 'local-only' })], server);

    const result = await runSyncCycle(deps);

    expect(result.pulled.added).toBe(1);
    expect(writes.map((a) => a.id)).toEqual(['from-cloud']);
    expect(result.error).toBeUndefined();
  });

  it('pushes queued articles with the full payload and clears them from the queue', async () => {
    const server = { articles: [], settings: [] };
    const { fetchMock, calls } = fakeServer(server);
    vi.stubGlobal('fetch', fetchMock);
    const { deps } = makeDeps([article({ id: 'a1', topic: 'Bikes' })], server);

    deps.queue.addArticle('a1');
    const result = await runSyncCycle(deps);

    expect(result.pushed.articles).toBe(1);
    expect(deps.queue.pending().articleIds).toEqual([]);
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('fisio_articles'));
    // A row the cloud has never seen is a plain insert; re-posting an existing
    // row is what produced the 409, so on_conflict is no longer used at all.
    expect(post?.url).not.toContain('on_conflict');
    expect((post?.body as CloudRow[])[0]).toMatchObject({ id: 'a1', workspace_secret: 'sec-1' });
    expect(((post?.body as CloudRow[])[0].article as GeneratedArticle).topic).toBe('Bikes');
  });

  it('patches an article the cloud already has instead of re-inserting it', async () => {
    const existing = articleToRow(article({ id: 'a1', topic: 'Old' }), 'sec-1');
    const server = { articles: [existing], settings: [] };
    const { fetchMock, calls } = fakeServer(server);
    vi.stubGlobal('fetch', fetchMock);
    const { deps } = makeDeps([article({ id: 'a1', topic: 'Edited' })], server);
    deps.queue.addArticle('a1');

    const result = await runSyncCycle(deps);

    expect(result.pushed.articles).toBe(1);
    expect(calls.some((call) => call.method === 'POST' && call.url.includes('fisio_articles'))).toBe(false);
    const patch = calls.find((call) => call.method === 'PATCH' && call.url.includes('fisio_articles'));
    expect(patch?.url).toContain('id=eq.a1');
    expect((patch?.body as CloudRow).topic).toBe('Edited');
    expect(server.articles[0].topic).toBe('Edited');
  });

  it('pushes settings only when they are dirty, and clears the flag', async () => {
    const server = { articles: [], settings: [] };
    const { fetchMock, calls } = fakeServer(server);
    vi.stubGlobal('fetch', fetchMock);
    const { deps } = makeDeps([], server);

    deps.queue.addSettings();
    const result = await runSyncCycle(deps);

    expect(result.pushed.settings).toBe(true);
    expect(deps.queue.pending().settingsDirty).toBe(false);
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('fisio_settings'));
    expect(post).toBeDefined();
    expect((post?.body as CloudRow[])[0].workspace_secret).toBe('sec-1');
  });

  it('patches the settings row that already exists instead of inserting a duplicate', async () => {
    const stored = {
      workspace_secret: 'sec-1',
      updated_at: '2026-10-01T00:00:00.000Z',
      profile: DEFAULT_USER_PROFILE,
      universal_rules: DEFAULT_UNIVERSAL_RULES,
      pipeline_config: DEFAULT_PIPELINE_CONFIG,
    };
    const server = { articles: [], settings: [stored] };
    const { fetchMock, calls } = fakeServer(server);
    vi.stubGlobal('fetch', fetchMock);
    const { deps } = makeDeps([], server);
    deps.queue.addSettings();

    const result = await runSyncCycle(deps);

    expect(result.pushed.settings).toBe(true);
    expect(calls.some((call) => call.method === 'POST' && call.url.includes('fisio_settings'))).toBe(false);
    const patch = calls.find((call) => call.method === 'PATCH' && call.url.includes('fisio_settings'));
    expect(patch?.url).toContain('workspace_secret=eq.');
    expect(server.settings).toHaveLength(1);
  });

  // A device that never edited its rules has no saved-at stamp. Posting an empty
  // string there was rejected by Postgres (`invalid input syntax for type
  // timestamp with time zone: ""`), so a real timestamp must be substituted and
  // remembered locally, or every later cycle would invent a newer one.
  it('substitutes a valid timestamp when local rules were never saved, and records it', async () => {
    const server = { articles: [], settings: [] };
    const { fetchMock, calls } = fakeServer(server);
    vi.stubGlobal('fetch', fetchMock);
    const { deps } = makeDeps([], server);
    deps.readSettings = () => ({ ...DEFAULT_SETTINGS, updatedAt: '' });
    const stamped: string[] = [];
    deps.onSettingsStamped = (iso) => stamped.push(iso);
    deps.queue.addSettings();

    const result = await runSyncCycle(deps);

    expect(result.error).toBeUndefined();
    const post = calls.find((call) => call.method === 'POST' && call.url.includes('fisio_settings'));
    const row = (post?.body as CloudRow[])[0];
    expect(Number.isNaN(Date.parse(String(row.updated_at)))).toBe(false);
    expect(stamped).toEqual([row.updated_at]);
  });

  it('adopts the cloud rules when this device has never saved its own', async () => {
    const cloud = {
      workspace_secret: 'sec-1',
      updated_at: '2026-10-09T00:00:00.000Z',
      profile: { ...DEFAULT_USER_PROFILE, businessName: 'CloudBrand' },
      universal_rules: DEFAULT_UNIVERSAL_RULES,
      pipeline_config: DEFAULT_PIPELINE_CONFIG,
    };
    const server = { articles: [], settings: [cloud] };
    vi.stubGlobal('fetch', fakeServer(server).fetchMock);
    const { deps, applied } = makeDeps([], server);
    deps.readSettings = () => ({ ...DEFAULT_SETTINGS, updatedAt: '' });

    await runSyncCycle(deps);

    expect(applied).toHaveLength(1);
  });

  it('adopts newer cloud rules and leaves newer local rules alone', async () => {
    const newer = {
      workspace_secret: 'sec-1',
      updated_at: '2026-10-09T00:00:00.000Z',
      profile: { ...DEFAULT_USER_PROFILE, businessName: 'CloudBrand' },
      universal_rules: { ...DEFAULT_UNIVERSAL_RULES, maxSentenceWords: 26 },
      pipeline_config: { ...DEFAULT_PIPELINE_CONFIG, targetWords: 900 },
    };
    const server = { articles: [], settings: [newer] };
    vi.stubGlobal('fetch', fakeServer(server).fetchMock);
    const { deps, applied } = makeDeps([], server);

    await runSyncCycle(deps);
    expect(applied).toHaveLength(1);
    expect((applied[0] as { profile: { businessName: string } }).profile.businessName).toBe('CloudBrand');

    // Now the local copy is newer: nothing may be applied over it.
    const older = { ...newer, updated_at: '2026-01-01T00:00:00.000Z' };
    const server2 = { articles: [], settings: [older] };
    vi.stubGlobal('fetch', fakeServer(server2).fetchMock);
    const second = makeDeps([], server2);
    await runSyncCycle(second.deps);
    expect(second.applied).toHaveLength(0);
  });

  it('keeps the queue when the network fails, and reports it as retryable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    const server = { articles: [], settings: [] };
    const { deps } = makeDeps([article()], server);
    deps.queue.addArticle('a1');
    deps.queue.addSettings();

    const result = await runSyncCycle(deps);

    expect(result.kind).toBe('network');
    expect(result.pushed).toEqual({ articles: 0, settings: false });
    expect(deps.queue.pending()).toEqual({ articleIds: ['a1'], settingsDirty: true });
  });

  it('drops an article that was deleted locally before it could be uploaded', async () => {
    const server = { articles: [], settings: [] };
    vi.stubGlobal('fetch', fakeServer(server).fetchMock);
    const { deps } = makeDeps([], server);
    deps.queue.addArticle('vanished');

    const result = await runSyncCycle(deps);

    expect(result.pushed.articles).toBe(0);
    expect(deps.queue.pending().articleIds).toEqual([]);
  });

  it('trims the oldest snapshots when a queued article is too large for one request', async () => {
    const server = { articles: [], settings: [] };
    const { fetchMock, calls } = fakeServer(server);
    vi.stubGlobal('fetch', fetchMock);
    const big = article({
      contentVersions: Array.from({ length: 8 }, (_, i) => ({
        version: i + 1,
        label: `v${i + 1}`,
        savedAt: `2026-10-0${(i % 8) + 1}T10:00:00.000Z`,
        format: 'clean-en' as const,
        html: 'x'.repeat(2_000_000),
      })),
    });
    const { deps } = makeDeps([big], server);
    deps.queue.addArticle('a1');

    await runSyncCycle(deps);

    const post = calls.find((call) => call.method === 'POST' && call.url.includes('fisio_articles'));
    const sent = (post?.body as CloudRow[])[0].article as GeneratedArticle;
    expect(sent.contentVersions!.length).toBeLessThan(8);
    expect(sent.contentVersions![sent.contentVersions!.length - 1].version).toBe(8);
    // Local history is untouched — only the outgoing copy was trimmed.
    expect(big.contentVersions!.length).toBe(8);
  });

  it('does nothing and says so when Supabase is not configured', async () => {
    const server = { articles: [], settings: [] };
    const { deps } = makeDeps([], server);
    deps.config = () => null;

    const result = await runSyncCycle(deps);

    expect(result.kind).toBe('config');
    expect(result.error).toContain('not configured');
  });
});

describe('deleteArticleEverywhere', () => {
  it('removes the row, the local record and any queued upload', async () => {
    const row = articleToRow(article({ id: 'a1' }), 'sec-1');
    const server = { articles: [row], settings: [] };
    const { fetchMock, calls } = fakeServer(server);
    vi.stubGlobal('fetch', fetchMock);
    const { deps } = makeDeps([article()], server);
    deps.queue.addArticle('a1');

    await deleteArticleEverywhere(deps, 'a1');

    expect(deps.queue.pending().articleIds).toEqual([]);
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
    expect(server.articles).toHaveLength(0);
  });
});

describe('runPushCycle', () => {
  it('uploads queued work without pulling the article payloads back', async () => {
    const server = { articles: [], settings: [] };
    const { fetchMock, calls } = fakeServer(server);
    vi.stubGlobal('fetch', fetchMock);
    const { deps } = makeDeps([article()], server);
    deps.queue.addArticle('a1');

    const result = await runPushCycle(deps);

    expect(result.pushed.articles).toBe(1);
    expect(result.pulled).toEqual({ added: 0, updated: 0 });
    // The only reads are the key lists the write path needs (which ids exist,
    // is there a settings row); no article body travels down.
    const reads = calls.filter((call) => call.method === 'GET');
    expect(reads.length).toBeGreaterThan(0);
    expect(reads.every((call) => call.url.includes('select=') || call.url.includes('workspace_secret=eq.'))).toBe(true);
    expect(reads.some((call) => call.url.includes('order=updated_at.desc'))).toBe(false);
  });

  it('reports the failure and leaves the queue for the next attempt', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ code: '42501', message: 'row-level security' }, { status: 403 }))
    );
    const server = { articles: [], settings: [] };
    const { deps } = makeDeps([article()], server);
    deps.queue.addArticle('a1');

    const result = await runPushCycle(deps);

    expect(result.kind).toBe('auth');
    expect(deps.queue.pending().articleIds).toEqual(['a1']);
    expect(deps.queue.failure().attempts).toBe(1);
  });
});

describe('nextRetryDelay', () => {
  it('never schedules when nothing failed', () => {
    expect(nextRetryDelay(0)).toBe(0);
  });

  it('doubles from two seconds and stops at a minute', () => {
    expect(nextRetryDelay(1)).toBe(2_000);
    expect(nextRetryDelay(2)).toBe(4_000);
    expect(nextRetryDelay(3)).toBe(8_000);
    expect(nextRetryDelay(12)).toBe(60_000);
  });
});

describe('testCloudConnection', () => {
  it('explains an empty workspace instead of claiming data was found', async () => {
    const server = { articles: [], settings: [] };
    vi.stubGlobal('fetch', fakeServer(server).fetchMock);
    const { deps } = makeDeps([], server);

    const result = await testCloudConnection(deps);

    expect(result.ok).toBe(true);
    expect(result.message).toContain('no saved data yet');
  });

  it('reports what the secret can actually see', async () => {
    const server = {
      articles: [articleToRow(article({ id: 'a1' }), 'sec-1')],
      settings: [{ workspace_secret: 'sec-1', updated_at: '2026-10-01T00:00:00.000Z', profile: {}, universal_rules: {}, pipeline_config: {} }],
    };
    vi.stubGlobal('fetch', fakeServer(server).fetchMock);
    const { deps } = makeDeps([], server);

    const result = await testCloudConnection(deps);

    expect(result.ok).toBe(true);
    expect(result.message).toContain('1 article(s) and 1 settings row(s) visible');
  });

  it('says so when the platform does not expose request headers to policies', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ header_present: false, headers_guc_present: false }))
    );
    const server = { articles: [], settings: [] };
    const { deps } = makeDeps([], server);

    const result = await testCloudConnection(deps);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('not publishing request headers');
  });

  it('tells the user to save a secret when the header arrives empty', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ header_present: false, headers_guc_present: true }))
    );
    const server = { articles: [], settings: [] };
    const { deps } = makeDeps([], server);

    const result = await testCloudConnection(deps);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('without a workspace secret');
  });

  it('surfaces the secret error when the server rejects it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ code: '42501', message: 'row-level security' }, { status: 403 }))
    );
    const server = { articles: [], settings: [] };
    const { deps } = makeDeps([], server);

    const result = await testCloudConnection(deps);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('workspace secret');
  });
});
