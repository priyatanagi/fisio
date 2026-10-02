import { describe, it, expect } from 'vitest';
import { upsertArticle } from './articleList';
import type { GeneratedArticle } from '../types/article';

const article = (id: string, topic = id): GeneratedArticle =>
  ({ id, topic, generatedAt: '2026-01-01T00:00:00Z' }) as GeneratedArticle;

describe('upsertArticle', () => {
  it('inserts an article it has never seen', () => {
    const list = upsertArticle([], article('a1'));
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('a1');
  });

  it('inserts without disturbing the existing list', () => {
    const list = upsertArticle([article('a1')], article('a2'));
    expect(list.map((a) => a.id)).toEqual(['a2', 'a1']);
  });

  it('replaces an article with the same id instead of duplicating', () => {
    const list = upsertArticle([article('a1', 'old')], article('a1', 'new'));
    expect(list).toHaveLength(1);
    expect(list[0].topic).toBe('new');
  });

  it('does not mutate the input list', () => {
    const input = [article('a1')];
    upsertArticle(input, article('a2'));
    expect(input).toHaveLength(1);
  });
});