/**
 * Deletion tombstones.
 *
 * Without them a delete that happens while offline (or is rejected by the
 * server) would be undone by the next pull, which simply sees the cloud row and
 * treats it as an article this device has never had. So a deletion is recorded
 * with its own timestamp, uploads are retried from that list, and the pull side
 * skips anything still pending.
 */
import { getMeta, setMeta } from '../db';

const TOMBSTONE_META_KEY = 'cloud_tombstones';

export interface Tombstone {
  id: string;
  deletedAt: string;
  /** False until the remote row is confirmed gone. */
  synced: boolean;
}

export interface TombstoneStore {
  load(): Promise<Tombstone[]>;
  save(rows: Tombstone[]): Promise<void>;
}

export const idbTombstoneStore: TombstoneStore = {
  async load() {
    const stored = await getMeta<Tombstone[]>(TOMBSTONE_META_KEY);
    if (!Array.isArray(stored)) return [];
    return stored.filter(
      (entry) => entry && typeof entry.id === 'string' && typeof entry.deletedAt === 'string'
    );
  },
  async save(rows) {
    await setMeta(TOMBSTONE_META_KEY, rows);
  },
};

/** A deleted row that keeps failing to disappear is retried for a month, then dropped. */
const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function createTombstones(store: TombstoneStore) {
  let rows: Tombstone[] = [];
  let loaded = false;
  let writes: Promise<void> = Promise.resolve();

  const persist = () => {
    const copy = rows.slice();
    writes = writes
      .then(() => store.save(copy))
      .catch((err) => void console.warn('[cloud] tombstones could not be persisted:', err));
  };

  return {
    async hydrate(): Promise<void> {
      try {
        rows = await store.load();
      } catch (err) {
        console.warn('[cloud] tombstones could not be read:', err);
      }
      loaded = true;
    },

    isLoaded: () => loaded,

    async add(id: string, deletedAt = new Date().toISOString()): Promise<void> {
      if (!loaded) await this.hydrate();
      rows = [...rows.filter((entry) => entry.id !== id), { id, deletedAt, synced: false }];
      persist();
    },

    async markSynced(id: string): Promise<void> {
      rows = rows.filter((entry) => entry.id !== id);
      persist();
    },

    /** Ids the pull side must not resurrect. */
    pendingIds(): string[] {
      return rows.map((entry) => entry.id);
    },

    /** Deletes the remote row has not confirmed yet, oldest first. */
    unsynced(): Tombstone[] {
      const cutoff = Date.now() - TOMBSTONE_TTL_MS;
      return rows
        .filter((entry) => !entry.synced && Date.parse(entry.deletedAt) >= cutoff)
        .sort((a, b) => a.deletedAt.localeCompare(b.deletedAt));
    },

    async flush(): Promise<void> {
      await writes;
    },
  };
}

export type Tombstones = ReturnType<typeof createTombstones>;

export const cloudTombstones = createTombstones(idbTombstoneStore);
