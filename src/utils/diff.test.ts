import { describe, expect, it } from 'vitest';
import { lineDiff, wordDiff } from './diff';

describe('wordDiff', () => {
  it('returns a single same token for identical input', () => {
    expect(wordDiff('physical therapy', 'physical therapy')).toEqual([
      { type: 'same', text: 'physical therapy' },
    ]);
  });

  it('marks the changed words only', () => {
    expect(wordDiff('the quick fox', 'the fast fox')).toEqual([
      { type: 'same', text: 'the ' },
      { type: 'del', text: 'quick ' },
      { type: 'add', text: 'fast ' },
      { type: 'same', text: 'fox' },
    ]);
  });

  it('treats an empty side as all added or all deleted', () => {
    expect(wordDiff('', 'hello')).toEqual([{ type: 'add', text: 'hello' }]);
    expect(wordDiff('hello', '')).toEqual([{ type: 'del', text: 'hello' }]);
    expect(wordDiff('', '')).toEqual([]);
  });

  it('reports pure insertion in the middle', () => {
    expect(wordDiff('a c', 'a b c')).toEqual([
      { type: 'same', text: 'a ' },
      { type: 'add', text: 'b ' },
      { type: 'same', text: 'c' },
    ]);
  });
});

describe('lineDiff', () => {
  it('returns one entry per line', () => {
    const result = lineDiff('one\ntwo', 'one\ntwo');
    expect(result).toEqual([
      { type: 'same', text: 'one' },
      { type: 'same', text: 'two' },
    ]);
  });

  it('marks replaced lines as del then add', () => {
    const result = lineDiff('a\nb\nc', 'a\nx\nc');
    expect(result).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'same', text: 'c' },
    ]);
  });

  it('marks a removed line', () => {
    expect(lineDiff('a\nb', 'a')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'del', text: 'b' },
    ]);
  });

  it('marks an added line', () => {
    expect(lineDiff('a', 'a\nb')).toEqual([
      { type: 'same', text: 'a' },
      { type: 'add', text: 'b' },
    ]);
  });

  it('degrades to remove-all then add-all beyond the DP budget instead of hanging', () => {
    const from = Array.from({ length: 700 }, () => 'a').join('\n');
    const to = Array.from({ length: 700 }, () => 'b').join('\n');
    const result = lineDiff(from, to);
    expect(result).toHaveLength(1400);
    expect(result.slice(0, 700).every((entry) => entry.type === 'del')).toBe(true);
    expect(result.slice(700).every((entry) => entry.type === 'add')).toBe(true);
  });
});
