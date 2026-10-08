import { beforeEach, describe, expect, it } from 'vitest';
import { createTombstones, type Tombstone, type TombstoneStore } from './tombstones';

function memoryStore(initial: Tombstone[] = []): TombstoneStore {
  let value = initial.map((entry) => ({ ...entry }));
  return {
    async load() {
      return value.map((entry) => ({ ...entry }));
    },
    async save(rows) {
      value = rows.map((entry) => ({ ...entry }));
    },
  };
}

let tombstones: ReturnType<typeof createTombstones>;

beforeEach(async () => {
  tombstones = createTombstones(memoryStore());
  await tombstones.hydrate();
});

describe('tombstones', () => {
  it('records a delete once and lists it as pending', async () => {
    await tombstones.add('a1', '2026-10-05T10:00:00.000Z');
    await tombstones.add('a1', '2026-10-05T10:00:00.000Z');
    expect(tombstones.pendingIds()).toEqual(['a1']);
    expect(tombstones.unsynced()).toHaveLength(1);
  });

  it('clears a delete once the remote row is confirmed gone', async () => {
    await tombstones.add('a1');
    await tombstones.markSynced('a1');
    expect(tombstones.pendingIds()).toEqual([]);
    expect(tombstones.unsynced()).toEqual([]);
  });

  it('survives a reload', async () => {
    const store = memoryStore();
    const first = createTombstones(store);
    await first.add('a1', '2026-10-05T10:00:00.000Z');
    await first.flush();

    const reopened = createTombstones(store);
    await reopened.hydrate();
    expect(reopened.pendingIds()).toEqual(['a1']);
  });

  it('does not lose a delete that happens before the stored list arrives', async () => {
    const slow = createTombstones({
      load: () =>
        new Promise<Tombstone[]>((resolve) =>
          setTimeout(
            () => resolve([{ id: 'from-disk', deletedAt: '2026-10-01T00:00:00.000Z', synced: false }]),
            5
          )
        ),
      save: async () => undefined,
    });
    await slow.add('fresh');
    expect(slow.pendingIds()).toEqual(['from-disk', 'fresh']);
  });

  it('stops retrying a delete that is older than the grace period', async () => {
    await tombstones.add('ancient', '2020-01-01T00:00:00.000Z');
    expect(tombstones.pendingIds()).toEqual(['ancient']);
    expect(tombstones.unsynced()).toEqual([]);
  });
});
