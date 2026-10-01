import { get, del } from 'idb-keyval';
import type { GeneratedArticle } from '../types/article';
import { initDb, putArticle, listArticles, setMeta, getMeta } from './index';

const LEGACY_LS_KEY = 'fitseo_history';
const LEGACY_IDB_KEY = 'fitseo_history';
export const CURRENT_SCHEMA_VERSION = 1;

export async function runMigration(): Promise<void> {
  try {
    await initDb();

    if ((await getMeta<number>('schemaVersion')) === CURRENT_SCHEMA_VERSION) return;

    // 1. The pre-v2 location: localStorage.
    const stored = localStorage.getItem(LEGACY_LS_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as GeneratedArticle[];
        if (Array.isArray(parsed) && parsed.length > 0 && (await listArticles()).length === 0) {
          for (const article of parsed) await putArticle(article);
        }
      } catch (err) {
        console.warn('[db] Could not parse localStorage history:', err);
      }
      localStorage.removeItem(LEGACY_LS_KEY);
    }

    // 2. The legacy single-key IndexedDB store from the partial earlier attempt.
    //    It lives in a different database, so its absence is expected and normal.
    try {
      const legacy = await get<GeneratedArticle[]>(LEGACY_IDB_KEY);
      if (Array.isArray(legacy) && legacy.length > 0 && (await listArticles()).length === 0) {
        for (const article of legacy) await putArticle(article);
      }
      if (legacy !== undefined) await del(LEGACY_IDB_KEY);
    } catch {
      // Database does not exist. Nothing to recover.
    }

    await setMeta('schemaVersion', CURRENT_SCHEMA_VERSION);
  } catch (err) {
    // A failed migration must never prevent the app from starting.
    console.warn('[db] Migration skipped:', err);
  }
}
