export type DiffOp = 'same' | 'del' | 'add';

export interface DiffToken {
  type: DiffOp;
  text: string;
}

/** One entry per line — line diffs are rendered row by row, never merged. */
export interface LineDiffEntry {
  type: DiffOp;
  text: string;
}

/**
 * Beyond this many DP cells the quadratic LCS table is not worth its cost, so
 * the diff degrades to "everything removed, then everything added" rather than
 * freezing the tab on a pathological pair of inputs.
 */
const MAX_DP_CELLS = 400_000;

function diffSequences<T>(a: T[], b: T[]): { type: DiffOp; value: T }[] {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];

  if (n * m > MAX_DP_CELLS) {
    return [
      ...a.map((value) => ({ type: 'del' as const, value })),
      ...b.map((value) => ({ type: 'add' as const, value })),
    ];
  }

  // dp[i][j] = length of the longest common subsequence of a[i:] and b[j:].
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * width + j] =
        a[i] === b[j]
          ? dp[(i + 1) * width + (j + 1)] + 1
          : Math.max(dp[(i + 1) * width + j], dp[i * width + (j + 1)]);
    }
  }

  const out: { type: DiffOp; value: T }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'same', value: a[i] });
      i++;
      j++;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + (j + 1)]) {
      out.push({ type: 'del', value: a[i] });
      i++;
    } else {
      out.push({ type: 'add', value: b[j] });
      j++;
    }
  }
  while (i < n) out.push({ type: 'del', value: a[i++] });
  while (j < m) out.push({ type: 'add', value: b[j++] });
  return out;
}

/** Collapses runs of the same operation into single tokens: "abc" not "a" "b" "c". */
function merge(tokens: DiffToken[]): DiffToken[] {
  const out: DiffToken[] = [];
  for (const token of tokens) {
    const last = out[out.length - 1];
    if (last && last.type === token.type) last.text += token.text;
    else out.push({ ...token });
  }
  return out;
}

const WORD_PATTERN = /\S+\s*/g;

/**
 * Word-level diff for short strings such as metadata field values. Splits on
 * word boundaries (keeping trailing space attached) so highlighting lands on
 * whole words instead of stray characters.
 */
export function wordDiff(from: string, to: string): DiffToken[] {
  const a = from.match(WORD_PATTERN) ?? [];
  const b = to.match(WORD_PATTERN) ?? [];
  return merge(
    diffSequences(a, b).map(({ type, value }) => ({ type, text: value }))
  );
}

/**
 * Line-level diff for article HTML. Returns one entry per line, unmerged, so
 * the caller can render a row per line and collapse unchanged runs itself.
 * Line endings are normalised away; `from` is the old side, `to` the new one.
 */
export function lineDiff(from: string, to: string): LineDiffEntry[] {
  const a = from.split('\n');
  const b = to.split('\n');
  return diffSequences(a, b).map(({ type, value }) => ({ type, text: value }));
}
