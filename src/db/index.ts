import type { GeneratedArticle } from '../types/article';
import type { RunRecord } from '../types/run';

const DB_NAME = 'fisio_architect';
const DB_VERSION = 2;

export interface JobRecord {
  jobId: string;
  createdAt: string;
  updatedAt: string;
  [key: string]: unknown;
}

let dbFactory: IDBFactory | null = null;
let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('articles')) {
        const store = db.createObjectStore('articles', { keyPath: 'id' });
        store.createIndex('generatedAt', 'generatedAt');
      }
      if (!db.objectStoreNames.contains('jobs')) {
        const store = db.createObjectStore('jobs', { keyPath: 'jobId' });
        store.createIndex('createdAt', 'createdAt');
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains('runs')) {
        const store = db.createObjectStore('runs', { keyPath: 'runId' });
        store.createIndex('updatedAt', 'updatedAt');
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getDb(): Promise<IDBDatabase> {
  // Tests swap the global factory for a fresh, empty world; reopening when it
  // changes keeps that isolation real instead of writing into a stale database.
  const factory = globalThis.indexedDB;
  if (!dbPromise || factory !== dbFactory) {
    dbFactory = factory;
    dbPromise = openDatabase(factory);
  }
  return dbPromise;
}

// Runs one request inside a transaction and settles only when the transaction
// itself settles, so writes are guaranteed committed before the promise resolves.
function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  const db = getDb();
  return db.then(
    (connected) =>
      new Promise<T>((resolve, reject) => {
        const tx = connected.transaction(storeName, mode);
        const request = action(tx.objectStore(storeName));
        let result: T;
        request.onsuccess = () => {
          result = request.result;
        };
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () =>
          reject(tx.error ?? new DOMException('Transaction aborted', 'AbortError'));
      })
  );
}

export async function initDb(): Promise<void> {
  await getDb();
}

export async function getArticle(id: string): Promise<GeneratedArticle | undefined> {
  return run<GeneratedArticle | undefined>('articles', 'readonly', (store) => store.get(id));
}

export async function putArticle(article: GeneratedArticle): Promise<void> {
  await run('articles', 'readwrite', (store) => store.put(article));
}

export async function listArticles(): Promise<GeneratedArticle[]> {
  const all = await run<GeneratedArticle[]>('articles', 'readonly', (store) => store.getAll());
  return all.sort((a, b) => (a.generatedAt < b.generatedAt ? 1 : -1));
}

export async function deleteArticle(id: string): Promise<void> {
  await run('articles', 'readwrite', (store) => store.delete(id));
}

export async function clearArticles(): Promise<void> {
  await run('articles', 'readwrite', (store) => store.clear());
}

export async function getJob(jobId: string): Promise<JobRecord | undefined> {
  return run<JobRecord | undefined>('jobs', 'readonly', (store) => store.get(jobId));
}

export async function putJob(job: JobRecord): Promise<void> {
  await run('jobs', 'readwrite', (store) => store.put(job));
}

export async function listJobs(): Promise<JobRecord[]> {
  return run<JobRecord[]>('jobs', 'readonly', (store) => store.getAll());
}

export async function clearJobs(): Promise<void> {
  await run('jobs', 'readwrite', (store) => store.clear());
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const record = await run<{ key: string; value: unknown } | undefined>(
    'meta',
    'readonly',
    (store) => store.get(key)
  );
  return record?.value as T | undefined;
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await run('meta', 'readwrite', (store) => store.put({ key, value }));
}

// ---- Run journal ----------------------------------------------------------
// Every generation is journalled before its first provider call, so a run that
// dies mid-flight is still on record and can be retried from History.

export async function putRun(record: RunRecord): Promise<void> {
  await run('runs', 'readwrite', (store) => store.put(record));
}

export async function getRun(runId: string): Promise<RunRecord | undefined> {
  return run<RunRecord | undefined>('runs', 'readonly', (store) => store.get(runId));
}

export async function listRuns(): Promise<RunRecord[]> {
  const all = await run<RunRecord[]>('runs', 'readonly', (store) => store.getAll());
  return all.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function deleteRun(runId: string): Promise<void> {
  await run('runs', 'readwrite', (store) => store.delete(runId));
}

/**
 * Closes out runs that were still marked running when the app last went away.
 * A 'running' record can only exist after a reload or a closed tab, because the
 * run writes a terminal status on every normal exit.
 */
export async function markInterruptedRuns(
  reason = 'Interrupted before it finished — the page was closed or reloaded mid-run.'
): Promise<number> {
  const stale = (await listRuns()).filter((r) => r.status === 'running');
  for (const record of stale) {
    await putRun({ ...record, status: 'interrupted', error: reason, updatedAt: new Date().toISOString() });
  }
  return stale.length;
}

/**
 * Keeps the journal bounded. Failed and interrupted runs are always kept
 * because they are the retryable ones; successful ones are trimmed to the
 * newest `keep`.
 */
export async function pruneRuns(keep = 100): Promise<number> {
  const all = await listRuns();
  const succeeded = all.filter((r) => r.status === 'done' || r.status === 'needs_attention');
  const surplus = succeeded.slice(Math.max(keep, 0));
  for (const record of surplus) await deleteRun(record.runId);
  return surplus.length;
}
