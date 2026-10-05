/**
 * Chunk-and-stitch support for local models that cannot hold a whole role's
 * output in one response.
 *
 * This is a *fallback*, not the normal path: measured completions on the local
 * models finish well inside the ceiling, so it only runs after a truncated or
 * unparseable first attempt. The pure helpers live here so they can be tested
 * without a live Ollama.
 */

/** Roles whose output is one long prose field and therefore worth splitting. */
export type ChunkableRole = 'creator' | 'designer';

export interface ChunkPlan {
  /** 1-based position of this chunk in the whole document. */
  index: number;
  /** How many chunks make up the whole document. */
  total: number;
  /** Short instruction describing what this chunk must cover. */
  heading: string;
}

/**
 * Sections per role. The creator produces the markdown article and the
 * designer wraps it in HTML, so both need a stable H2 skeleton to stitch onto.
 */
const SECTION_COUNT: Record<ChunkableRole, number> = {
  creator: 4,
  designer: 3,
};

export function isChunkableRole(role: string): role is ChunkableRole {
  return role === 'creator' || role === 'designer';
}

/**
 * Plan the chunks for a role. Kept deliberately small and fixed so a partial
 * stitch still yields a coherent document, and so the number of extra provider
 * calls stays bounded.
 */
export function planChunks(role: ChunkableRole): ChunkPlan[] {
  const total = SECTION_COUNT[role];
  const nouns =
    role === 'creator'
      ? [
          'introduction and what commercial gym equipment maintenance actually involves',
          'the inspection routine and daily/weekly schedule',
          'common failure modes, repairs, and parts replacement',
          'cost control, warranty handling, and the conclusion',
        ]
      : [
          'the document head, styles, and opening section',
          'the main body sections',
          'the remaining body sections and closing markup',
        ];
  return Array.from({ length: total }, (_, i) => ({
    index: i + 1,
    total,
    heading: nouns[i] ?? `section ${i + 1}`,
  }));
}

/**
 * Combine chunk bodies into one document, dropping empty parts and avoiding the
 * duplicated heading a model tends to repeat when asked to continue.
 *
 * A chunk that comes back empty leaves a gap rather than failing the run: a
 * partial document is more useful here than none, and the caller already
 * rejects an empty result.
 */
export function stitchChunks(bodies: string[]): string {
  const parts: string[] = [];
  let lastHeading = '';
  let lastLine = '';
  bodies.forEach((body) => {
    const trimmed = String(body ?? '').trim();
    if (!trimmed) return;

    let text = trimmed;
    // A continued chunk often restates the heading it is continuing under.
    // It arrives as the chunk's first line, so drop it when it repeats.
    const lines = text.split('\n');
    if (lines[0]?.trim().startsWith('#') && lines[0].trim() === lastHeading) {
      text = lines.slice(1).join('\n').trim();
    }
    // Some models resume mid-paragraph by echoing the previous chunk's tail.
    if (lastLine && text.startsWith(lastLine)) {
      text = text.slice(lastLine.length).trim();
    }

    if (text) parts.push(text);
    const kept = text.split('\n').filter(Boolean);
    const headingLine = kept.find((line) => line.trim().startsWith('#'));
    lastHeading = headingLine ? headingLine.trim() : lastHeading;
    lastLine = kept[kept.length - 1]?.trim() ?? '';
  });
  return parts.join('\n\n');
}

/**
 * Build the prompt for one chunk. Each chunk is self-contained.
 *
 * The chunk is asked for JSON like the original role call, because Ollama is
 * invoked with `format: 'json'` for these requests; asking for bare markdown
 * there yields an empty or JSON-wrapped-mess response. Each chunk therefore
 * returns its own {field: "..."} object and the bodies are stitched and wrapped
 * once at the end.
 */
export function buildChunkPrompt(
  role: ChunkableRole,
  originalPrompt: string,
  plan: ChunkPlan,
  field: string
): string {
  return [
    originalPrompt,
    '',
    '---',
    `The previous attempt could not finish in one response. Write ONLY section ${plan.index} of ${plan.total}.`,
    `This section covers: ${plan.heading}.`,
    plan.index > 1
      ? 'Do not repeat earlier sections and do not restate their headings.'
      : 'Start directly with the content.',
    'Write substantial prose for this section only, then stop.',
    `Respond with a single JSON object of the form {"${field}": "..."} containing that section as markdown.`,
  ].join('\n');
}

/**
 * Pull the prose out of one chunk response. Ollama is called with
 * `format: 'json'`, so a chunk normally arrives as {field: "..."}; a model that
 * ignores the format and answers in the clear still counts.
 */
export function extractChunkBody(raw: string, field: string): string {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  try {
    const parsed = JSON.parse(text);
    const value = parsed?.[field];
    if (typeof value === 'string' && value.trim()) return value;
  } catch {
    // Not JSON: fall through to the raw text.
  }
  return text;
}