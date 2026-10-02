/**
 * Guards the user's own topic against an LLM rewriting it into something else.
 *
 * The Judge may sharpen the angle of a seed topic, but the brief it returns is
 * free text: with a brand block pointing at one niche, a model handed an
 * off-niche seed topic can "rescue" it by rewriting it into the brand's
 * subject. That silently replaces what the user asked for, so the refined
 * topic is only accepted while it still describes the same subject.
 */

/** Tokens shorter than this are too generic to prove two topics are the same. */
const MIN_TOKEN_LENGTH = 4;

const STOP_WORDS = new Set([
  // English
  'about', 'after', 'also', 'another', 'because', 'been', 'being', 'best',
  'better', 'between', 'both', 'could', 'does', 'doing', 'done', 'down',
  'from', 'have', 'having', 'here', 'into', 'just', 'like', 'make', 'many',
  'more', 'most', 'much', 'must', 'need', 'only', 'other', 'over', 'same',
  'should', 'since', 'some', 'such', 'than', 'that', 'their', 'them',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'under',
  'until', 'very', 'want', 'well', 'what', 'when', 'where', 'which', 'while',
  'who', 'why', 'will', 'with', 'within', 'without', 'your', 'will',
  // Indonesian
  'adalah', 'akan', 'atau', 'bagi', 'banyak', 'dalam', 'dengan', 'hanya',
  'hingga', 'juga', 'kalau', 'kamu', 'kita', 'lebih', 'maka', 'masih',
  'melalui', 'mereka', 'namun', 'oleh', 'pada', 'para', 'saja', 'sampai',
  'sangat', 'satu', 'sebagai', 'sebuah', 'secara', 'sedang', 'sehingga',
  'sejak', 'selain', 'semua', 'serta', 'setiap', 'sudah', 'supaya',
  'tentang', 'terhadap', 'tersebut', 'tetapi', 'tidak', 'untuk', 'yaitu',
  'yang',
]);

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function significantTokens(value: string): Set<string> {
  return new Set(
    normalize(value)
      .split(' ')
      .filter((t) => t.length >= MIN_TOKEN_LENGTH && !STOP_WORDS.has(t))
  );
}

/**
 * True when two topic phrasings plausibly describe the same subject. An empty
 * side counts as a match: a missing refinement carries no conflict.
 */
export function sharesSubject(a: string, b: string): boolean {
  const left = normalize(a);
  const right = normalize(b);
  if (!left || !right) return true;
  if (left === right) return true;

  const leftTokens = significantTokens(a);
  const rightTokens = significantTokens(b);
  for (const token of leftTokens) {
    if (rightTokens.has(token)) return true;
  }
  return false;
}

/**
 * Picks the topic the pipeline runs on. A faithful Judge refinement is kept
 * because it is a better angle on the same subject; anything that swaps the
 * subject out is discarded in favour of what the user typed.
 */
export function resolveTopicForRun(seedTopic: string, refinedTopic?: string): string {
  const seed = seedTopic.trim();
  const refined = refinedTopic?.trim();
  if (!refined) return seed;
  return sharesSubject(seed, refined) ? refined : seed;
}