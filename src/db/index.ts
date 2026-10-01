import type { GeneratedArticle } from '../types/article';

const DB_NAME = 'fisio_architect';
const DB_VERSION = 1;

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
