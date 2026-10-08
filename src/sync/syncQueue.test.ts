import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createQueue, type QueueState, type QueueStore } from './syncQueue';

function memoryStore(initial: QueueState | null = null): QueueStore & { reads: number; writes: QueueState[] } {
  let value = initial;
  return {
    reads: 0,
    writes: [],
    async load() {
      this.reads++;
      return value ? { ...value, articleIds: [...value.articleIds] } : null;
    },
    async save(state) {
      this.writes.push({ ...state, articleIds: [...state.articleIds] });
      value = { ...state, articleIds: [...state.articleIds] };
    },
  };
}

describe('sync queue', () => {
  let queue: ReturnType<typeof createQueue>;
  let store: ReturnType<typeof memoryStore>;

  beforeEach(() => {
    store = memoryStore();
    queue = createQueue(store);
  });

  it('starts empty and hydrates nothing when the store is blank', async () => {
    await queue.hydrate();
    expect(queue.pending()).toEqual({ articleIds: [], settingsDirty: false });
  });

  it('collects edits by id without duplicating a repeated save', async () => {
    await queue.hydrate();
    queue.addArticle('a1');
    queue.addArticle('a2');
    queue.addArticle('a1');
    expect(queue.pending().articleIds).toEqual(['a1', 'a2']);
  });

  it('marks settings dirty once, and clears only what was asked', async () => {
    await queue.hydrate();
    queue.addArticle('a1');
    queue.addSettings();
    queue.addSettings();
    expect(queue.pending().settingsDirty).toBe(true);

    queue.markPushed({ articleIds: ['a1'], settings: false });
    expect(queue.pending()).toEqual({ articleIds: [], settingsDirty: true });

    queue.markPushed({ articleIds: [], settings: true });
    expect(queue.pending().settingsDirty).toBe(false);
  });

  it('survives a reload by persisting after each change', async () => {
    await queue.hydrate();
    queue.addArticle('a1');
    queue.addSettings();
    await queue.flush();

    const reopened = createQueue(store);
    await reopened.hydrate();
    expect(reopened.pending()).toEqual({ articleIds: ['a1'], settingsDirty: true });
  });

  it('keeps offline edits that were made before the store was read', async () => {
    // A write that lands during hydration must not be erased by the stored copy.
    const slow = memoryStore({ articleIds: ['from-disk'], settingsDirty: false });
    let resolveLoad: (value: QueueState | null) => void = () => {};
    const store2: QueueStore = {
      load: () => new Promise((resolve) => (resolveLoad = resolve)),
      save: slow.save.bind(slow),
    };
    const q = createQueue(store2);
    const hydration = q.hydrate();
    q.addArticle('typed-while-loading');
    resolveLoad({ articleIds: ['from-disk'], settingsDirty: false });
    await hydration;

    expect(q.pending().articleIds).toEqual(['from-disk', 'typed-while-loading']);
  });

  it('notifies subscribers so the UI badge can follow the queue', async () => {
    await queue.hydrate();
    const seen: number[] = [];
    const stop = queue.subscribe((pending) => seen.push(pending.articleIds.length));
    queue.addArticle('a1');
    queue.addArticle('a2');
    queue.markPushed({ articleIds: ['a1', 'a2'], settings: false });
    expect(seen).toEqual([1, 2, 0]);

    stop();
    queue.addArticle('a3');
    expect(seen).toEqual([1, 2, 0]);
  });

  it('records a failure and its attempt count for backoff', async () => {
    await queue.hydrate();
    queue.noteFailure('offline');
    queue.noteFailure('offline');
    expect(queue.failure()).toEqual({ attempts: 2, lastError: 'offline' });
    queue.noteSuccess();
    expect(queue.failure().attempts).toBe(0);
  });

  it('never throws when the store itself fails, so sync cannot break saving', async () => {
    const broken: QueueStore = {
      load: async () => {
        throw new Error('quota exceeded');
      },
      save: async () => {
        throw new Error('quota exceeded');
      },
    };
    const q = createQueue(broken);
    await expect(q.hydrate()).resolves.toBeUndefined();
    q.addArticle('a1');
    await expect(q.flush()).resolves.toBeUndefined();
    expect(q.pending().articleIds).toEqual(['a1']);
  });

  it('drops a deleted article from the queue so it is never re-uploaded', async () => {
    await queue.hydrate();
    queue.addArticle('a1');
    queue.drop('a1');
    expect(queue.pending().articleIds).toEqual([]);
  });
});
