import { IDBFactory } from 'fake-indexeddb';

// Vitest's node environment has no localStorage, but migration tests exercise
// the legacy localStorage recovery path. Install an in-memory stand-in.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => void store.set(String(key), String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  };
}

// fake-indexeddb/auto installs a global factory on import. Reassigning it gives
// each test a genuinely empty database rather than shared state.
export function resetFakeDb(): void {
  (globalThis as any).indexedDB = new IDBFactory();
}
