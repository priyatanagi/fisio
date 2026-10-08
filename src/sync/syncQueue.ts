/**
 * The pending-work queue for cloud sync.
 *
 * Saving an article must never wait for the network, and an edit made while
 * offline must still be uploaded when the connection returns — including after a
 * page reload. So every change is recorded here immediately (in memory, for the
 * UI badge) and persisted to IndexedDB, and the sync engine drains it whenever
 * it next succeeds.
 */
import { getMeta, setMeta } from '../db';

const QUEUE_META_KEY = 'cloud_queue';

export interface QueueState {
  articleIds: string[];
  settingsDirty: boolean;
}

export interface QueueStore {
  load(): Promise<QueueState | null>;
  save(state: QueueState): Promise<void>;
}

export const idbQueueStore: QueueStore = {
  async load() {
    const stored = await getMeta<Partial<QueueState>>(QUEUE_META_KEY);
    if (!stored || !Array.isArray(stored.articleIds)) return null;
    return {
      articleIds: stored.articleIds.filter((id): id is string => typeof id === 'string'),
      settingsDirty: Boolean(stored.settingsDirty),
    };
  },
  async save(state) {
    await setMeta(QUEUE_META_KEY, state);
  },
};

export type QueueListener = (pending: QueueState) => void;

export function createQueue(store: QueueStore) {
  let state: QueueState = { articleIds: [], settingsDirty: false };
  let hydrated = false;
  let pendingWrites: Promise<void> = Promise.resolve();
  const listeners = new Set<QueueListener>();
  let failure = { attempts: 0, lastError: '' };

  const snapshot = (): QueueState => ({
    articleIds: [...state.articleIds],
    settingsDirty: state.settingsDirty,
  });

  const notify = () => {
    const copy = snapshot();
    for (const listener of listeners) listener(copy);
  };

  // Storage failures are never worth breaking a local save over; the write is
  // simply retried on the next change.
  const persist = () => {
    const target = snapshot();
    pendingWrites = pendingWrites
      .then(() => store.save(target))
      .catch((err) => void console.warn('[cloud] queue could not be persisted:', err));
  };

  return {
    /** Reads the persisted queue. Changes made before this resolves are kept. */
    async hydrate(): Promise<void> {
      try {
        const stored = await store.load();
        if (stored) {
          const merged = new Set([...stored.articleIds, ...state.articleIds]);
          state = {
            articleIds: [...merged],
            settingsDirty: stored.settingsDirty || state.settingsDirty,
          };
        }
      } catch (err) {
        console.warn('[cloud] queue could not be read:', err);
      }
      hydrated = true;
      notify();
    },

    isHydrated: () => hydrated,

    addArticle(id: string): void {
      if (!id || state.articleIds.includes(id)) return;
      state = { ...state, articleIds: [...state.articleIds, id] };
      persist();
      notify();
    },

    addSettings(): void {
      if (state.settingsDirty) return;
      state = { ...state, settingsDirty: true };
      persist();
      notify();
    },

    /** A deleted article must not be resurrected by a later drain. */
    drop(id: string): void {
      if (!state.articleIds.includes(id)) return;
      state = { ...state, articleIds: state.articleIds.filter((entry) => entry !== id) };
      persist();
      notify();
    },

    markPushed(result: { articleIds?: string[]; settings?: boolean }): void {
      const pushed = new Set(result.articleIds ?? []);
      const next: QueueState = {
        articleIds: state.articleIds.filter((id) => !pushed.has(id)),
        settingsDirty: result.settings ? false : state.settingsDirty,
      };
      const changed =
        next.articleIds.length !== state.articleIds.length ||
        next.settingsDirty !== state.settingsDirty;
      state = next;
      if (changed) persist();
      notify();
    },

    pending: snapshot,

    subscribe(listener: QueueListener): () => void {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    noteFailure(message: string): void {
      failure = { attempts: failure.attempts + 1, lastError: message };
    },

    noteSuccess(): void {
      failure = { attempts: 0, lastError: '' };
    },

    failure: () => ({ ...failure }),

    /** Awaits the queued storage writes; used by tests and by a clean shutdown. */
    async flush(): Promise<void> {
      await pendingWrites;
    },
  };
}

export type SyncQueue = ReturnType<typeof createQueue>;

/** The one instance the app uses; tests build their own with an in-memory store. */
export const cloudQueue = createQueue(idbQueueStore);
