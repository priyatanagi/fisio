import type { GeneratedArticle } from '../types/article';
import {
  listArticles,
  putArticle,
  deleteArticle,
  clearArticles,
} from '../db/index';
import { runMigration } from '../db/migrate';

// Compatibility layer for App.tsx, which Task 16 rewires away from this
// module. Each function now delegates to the per-article IndexedDB store, so
// one record is written per article instead of re-serialising the full array.

export async function loadHistory(): Promise<GeneratedArticle[]> {
  try {
    return await listArticles();
  } catch (error) {
    console.error('Failed to load history from IndexedDB:', error);
    return [];
  }
}

export async function migrateHistoryFromLocalStorage(): Promise<void> {
  await runMigration();
}

export async function addToHistory(article: GeneratedArticle): Promise<void> {
  try {
    await putArticle(article);
  } catch (error) {
    console.error('Failed to save history to IndexedDB:', error);
  }
}

export async function updateInHistory(article: GeneratedArticle): Promise<void> {
  try {
    await putArticle(article);
  } catch (error) {
    console.error('Failed to update article in IndexedDB:', error);
  }
}

export async function deleteFromHistory(id: string): Promise<void> {
  try {
    await deleteArticle(id);
  } catch (error) {
    console.error('Failed to delete article from IndexedDB:', error);
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await clearArticles();
  } catch (error) {
    console.error('Failed to clear history from IndexedDB:', error);
  }
}
