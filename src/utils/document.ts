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
const LIST_MARKER = /^\s{0,3}(?:[-*+]|\d+\.)\s+/;

/** A run of = or - under a line of text closes that line into a setext heading. */
const SETEXT_UNDERLINE = /^\s{0,3}(=+|-+)\s*$/;

const isListItemLine = (line: string): boolean => LIST_MARKER.test(line);

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
    .replace(/^\s{0,3}\d+\.\s+/gm, '')
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

  for (let i = 0; i < chunks.length; ) {
    const lines = chunks[i];
    if (isBlank(lines)) {
      i += 1;
      continue;
    }

    // A block opening with a list marker is list content; consecutive such blocks are one list,
    // and a blank line between its items is what makes it loose.
    if (isListItemLine(lines[0])) {
      const list: string[][] = [lines];
      let next = i + 1;
      while (next < chunks.length && !isBlank(chunks[next]) && isListItemLine(chunks[next][0])) {
        list.push(chunks[next]);
        next += 1;
      }
      i = next;
      const loose = list.length > 1;
      for (const item of list) (loose ? addLooseItems : addListWords)(item);
      continue;
    }

    i += 1;
    let body: string[] = [];
    for (const line of lines) {
      const atx = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
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