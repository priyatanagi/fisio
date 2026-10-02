export interface ArticleDocument {
  text: string;
  headings: { level: number; text: string }[];
  paragraphs: string[];
  html: string | null;
  imageCount: number;
  linkCount: number;
  hasFaqSignal: boolean;
  hasStrongFigure: boolean;
}

/** The opener is captured so the closer must repeat its exact backtick count; $ swallows an unclosed final fence. */
const FENCED_CODE = /(`{3,})[\s\S]*?(?:\1|$)/g;

const THEMATIC_BREAK = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/gm;

/** Mirrors the markers markdownToPlainText strips. A block opening with one is list content. */
const LIST_MARKER = /^\s{0,3}(?:[-*+]|\d+[.)])\s+/;

const ATX_HEADING = /^\s{0,3}(#{1,6})\s+(.*)$/;

/** A run of = or - under a line of text closes that line into a setext heading. */
const SETEXT_UNDERLINE = /^\s{0,3}(=+|-+)\s*$/;

const isListItemLine = (line: string): boolean => LIST_MARKER.test(line);

/** In CommonMark only these markers may interrupt a paragraph; an ordered `2.` cannot. */
const INTERRUPTS_PARAGRAPH = /^\s{0,3}(?:[-*+]|1\.)\s+/;

const startsListAfterProse = (line: string): boolean => INTERRUPTS_PARAGRAPH.test(line);

/** `-`, `*` and `+` each open their own list, as do `.` and `)` runs of numbers. */
function listMarkerKind(line: string): string {
  const marker = line.match(/^\s{0,3}([-*+]|\d+[.)])\s+/);
  if (!marker) return '';
  return /\d/.test(marker[1]) ? marker[1].slice(-1) : marker[1];
}

const FAQ_WORDS = /faq|accordion|question|pertanyaan|tanya/i;

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when the source bolds a figure, as <strong>/<b>, as <aside>, or as markdown **bold**.
 * Both paths call this on their own raw source so a draft and its render cannot disagree.
 */
export function containsStrongFigure(source: string): boolean {
  return (
    /<(strong|b)\b[^>]*>[\s\S]*?[\d%][\s\S]*?<\/\1>/i.test(source) ||
    /<aside\b/i.test(source) ||
    /\*\*[^*]*[\d%][^*]*\*\*/.test(source)
  );
}

function hasFaqWords(text: string): boolean {
  return FAQ_WORDS.test(text);
}

/** Strips fenced code, then every markdown marker, keeping prose and link text. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(FENCED_CODE, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(THEMATIC_BREAK, ' ')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s{0,3}\d+[.)]\s+/gm, '')
    .replace(/(\*\*|__|\*|_)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMarkdownParts(markdown: string): {
  text: string;
  headings: { level: number; text: string }[];
  paragraphs: string[];
} {
  const headings: { level: number; text: string }[] = [];
  const paragraphs: string[] = [];
  const corpus: string[] = [];
  const chunks = markdown
    .replace(FENCED_CODE, ' ')
    .split(/\n\s*\n/)
    .map((block) => block.split('\n'));

  const addParagraph = (lines: string[]): void => {
    const prose = markdownToPlainText(lines.join('\n'));
    if (!prose) return;
    paragraphs.push(prose);
    corpus.push(prose);
  };

  /** A tight list renders as bare <li>, so its words are read but never form a paragraph. */
  const addListWords = (lines: string[]): void => {
    const prose = markdownToPlainText(lines.join('\n'));
    if (prose) corpus.push(prose);
  };

  /** A loose list wraps each item's content in <p>, so every item is one paragraph. */
  const addLooseItems = (lines: string[]): void => {
    let item: string[] = [];
    for (const line of lines) {
      if (isListItemLine(line) && item.length > 0) {
        addParagraph(item);
        item = [];
      }
      item.push(line);
    }
    if (item.length > 0) addParagraph(item);
  };

  const addHeading = (level: number, source: string): void => {
    const prose = markdownToPlainText(source);
    headings.push({ level, text: prose });
    if (prose) corpus.push(prose);
  };

  const isBlank = (lines: string[]): boolean => lines.every((line) => !line.trim());

  /** Index of the next block, shared with consumeList so both read the source in one pass. */
  let cursor = 0;

  /**
   * The leading lines a list claims: its items plus the lines that continue them. An ATX heading
   * interrupts a paragraph and so ends the list; a setext underline cannot and does not.
   */
  const takeListLines = (lines: string[]): string[] => {
    let count = 0;
    while (count < lines.length && !ATX_HEADING.test(lines[count])) {
      if (count > 0 || isListItemLine(lines[count])) count += 1;
      else break;
    }
    return lines.slice(0, count);
  };

  const addHeadingsAndProse = (lines: string[]): void => {
    let body: string[] = [];
    for (const line of lines) {
      const atx = line.match(ATX_HEADING);
      const setext =
        !atx && body.length > 0 && !isListItemLine(body[body.length - 1])
          ? line.match(SETEXT_UNDERLINE)
          : null;

      if (atx) {
        addParagraph(body);
        body = [];
        addHeading(atx[1].length, atx[2]);
      } else if (setext) {
        const title = body[body.length - 1];
        body = body.slice(0, -1);
        addParagraph(body);
        body = [];
        addHeading(setext[1].startsWith('=') ? 1 : 2, title);
      } else {
        body.push(line);
      }
    }
    addParagraph(body);
  };

  /**
   * Consumes the list starting at `lines`: its items, plus the following blocks that share its
   * marker. A blank line between items makes the list loose. Returns whatever followed the list.
   */
  const consumeList = (lines: string[]): string[] => {
    const kind = listMarkerKind(lines[0]);
    const items: string[][] = [];
    let tail: string[] = [];
    let block = lines;
    for (;;) {
      const item = takeListLines(block);
      items.push(item);
      tail = block.slice(item.length);
      if (!isBlank(tail)) break;
      const next = cursor < chunks.length ? chunks[cursor] : null;
      if (!next || isBlank(next) || listMarkerKind(next[0]) !== kind) break;
      block = next;
      cursor += 1;
    }
    const loose = items.length > 1;
    for (const item of items) (loose ? addLooseItems : addListWords)(item);
    return tail;
  };

  while (cursor < chunks.length) {
    let rest = chunks[cursor];
    cursor += 1;

    // A block is read in segments: prose and headings, then the list that interrupts them, then
    // whatever the list left. Without this a list line following a heading would be read as prose.
    while (!isBlank(rest)) {
      if (isListItemLine(rest[0])) {
        rest = consumeList(rest);
        continue;
      }
      const cut = rest.findIndex(startsListAfterProse);
      addHeadingsAndProse(cut < 0 ? rest : rest.slice(0, cut));
      if (cut < 0) break;
      rest = rest.slice(cut);
    }
  }

  return { text: corpus.join(' '), headings, paragraphs };
}

export function extractDocument(source: string, kind: 'html' | 'markdown'): ArticleDocument {
  if (kind === 'markdown') {
    const { text, headings, paragraphs } = extractMarkdownParts(source);
    return {
      text,
      headings,
      paragraphs,
      html: null,
      imageCount: 0,
      linkCount: 0,
      hasFaqSignal: hasFaqWords(text),
      hasStrongFigure: containsStrongFigure(source),
    };
  }

  const html = source || '';
  const headings = Array.from(html.matchAll(/<h([1-6])\b[^>]*>(.*?)<\/h\1>/gi)).map((m) => ({
    level: Number(m[1]),
    text: stripHtml(m[2]),
  }));
  const paragraphs = Array.from(html.matchAll(/<p\b[^>]*>(.*?)<\/p>/gi)).map((m) => stripHtml(m[1]));
  return {
    text: stripHtml(html),
    headings,
    paragraphs,
    html,
    imageCount: (html.match(/<img\b[^>]*>/gi) ?? []).length,
    linkCount: (html.match(/<a\b[^>]*href=/gi) ?? []).length,
    hasFaqSignal:
      /<details\b/i.test(html) || hasFaqWords(html) || /application\/ld\+json/i.test(html),
    hasStrongFigure: containsStrongFigure(html),
  };
}