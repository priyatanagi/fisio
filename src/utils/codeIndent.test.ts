import { describe, it, expect } from 'vitest';
import { reindentLines } from './codeIndent';

describe('reindentLines', () => {
  it('inserts one step at the caret when nothing is selected', () => {
    const { next, selection } = reindentLines('<p>x</p>', 0, 0, 'in');
    expect(next).toBe('  <p>x</p>');
    expect(selection).toEqual([2, 2]);
  });

  it('indents every line a selection touches', () => {
    const value = '<li>a</li>\n<li>b</li>';
    const { next, selection } = reindentLines(value, 0, value.length, 'in');
    expect(next).toBe('  <li>a</li>\n  <li>b</li>');
    expect(selection).toEqual([0, next.length]);
  });

  it('finishes the line the selection stops inside', () => {
    const value = '<p>one</p>\n<p>two</p>';
    expect(reindentLines(value, 3, value.length, 'in').next).toBe('  <p>one</p>\n  <p>two</p>');
  });

  it('leaves the next line alone when the selection ends on a newline', () => {
    const value = '<p>one</p>\n<p>two</p>';
    const end = value.indexOf('\n') + 1;
    expect(reindentLines(value, 0, end, 'in').next).toBe('  <p>one</p>\n<p>two</p>');
  });

  it('undoes one step on each touched line', () => {
    const value = '  <li>a</li>\n    <li>b</li>';
    const { next, selection } = reindentLines(value, 0, value.length, 'out');
    expect(next).toBe('<li>a</li>\n  <li>b</li>');
    expect(selection).toEqual([0, next.length]);
  });

  it('takes only two spaces from a deeper indent', () => {
    expect(reindentLines('      <p>x</p>', 6, 6, 'out').next).toBe('    <p>x</p>');
  });

  it('keeps the caret on the character it was on', () => {
    expect(reindentLines('  <p>x</p>', 4, 4, 'out').selection).toEqual([2, 2]);
    expect(reindentLines('  <p>x</p>', 1, 1, 'out').selection).toEqual([0, 0]);
  });

  it('changes nothing when the touched lines carry no indent', () => {
    const value = '<p>x</p>';
    const { next, selection } = reindentLines(value, 0, 3, 'out');
    expect(next).toBe(value);
    expect(selection).toEqual([0, 3]);
  });
});
