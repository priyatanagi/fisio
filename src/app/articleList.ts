import type { GeneratedArticle } from '../types/article';

/**
 * Adds a freshly saved article or replaces one already in the list.
 *
 * A plain map() returns ids it has never seen untouched, so every new
 * generation stayed invisible in History until the page was reloaded — the
 * record was in IndexedDB the whole time, just missing from state.
 */
export function upsertArticle(
  list: GeneratedArticle[],
  article: GeneratedArticle
): GeneratedArticle[] {
  return list.some((a) => a.id === article.id)
    ? list.map((a) => (a.id === article.id ? article : a))
    : [article, ...list];
}