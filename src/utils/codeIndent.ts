const INDENT = '  ';

export interface ReindentResult {
  next: string;
  selection: [number, number];
}

/**
 * Tab and Shift+Tab for the code editor.
 *
 * Indenting reaches every line a selection touches, so a block moves as one
 * rather than leaving its last line ragged. Outdenting removes at most two
 * leading spaces per line: a deeper indent belongs to markup the reader did not
 * ask to lose, and one keystroke should undo one step.
 */
export function reindentLines(
  value: string,
  start: number,
  end: number,
  direction: 'in' | 'out'
): ReindentResult {
  const selected = end > start;

  if (direction === 'in' && !selected) {
    return {
      next: value.slice(0, start) + INDENT + value.slice(start),
      selection: [start + INDENT.length, start + INDENT.length],
    };
  }

  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineBreak = value.indexOf('\n', end);
  // A selection that stops right after a newline did not choose the next line.
  const lineEnd =
    selected && value[end - 1] === '\n' ? end : lineBreak < 0 ? value.length : lineBreak;

  const touched = value.slice(lineStart, lineEnd);
  const trailingBreak = touched.endsWith('\n');
  const body = trailingBreak ? touched.slice(0, -1) : touched;
  const lines = body.split('\n');
  const editedLines =
    direction === 'in'
      ? lines.map((line) => INDENT + line)
      : lines.map((line) => line.replace(/^ {1,2}/, ''));

  const editedBody = editedLines.join('\n');
  if (direction === 'out' && editedBody.length === body.length) {
    return { next: value, selection: [start, end] };
  }

  const edited = editedBody + (trailingBreak ? '\n' : '');
  // The caret only followed the first touched line; every line before it lost a
  // step of its own, but a single keystroke never spans more than one.
  const caret = Math.max(lineStart, start - (lines[0].length - editedLines[0].length));

  return {
    next: value.slice(0, lineStart) + edited + value.slice(lineEnd),
    selection: selected ? [lineStart, lineStart + edited.length] : [caret, caret],
  };
}
