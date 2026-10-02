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
  const blocks = markdown.replace(FENCED_CODE, ' ').split(/\n\s*\n/);

  const addProse = (lines: string[]): void => {
    const prose = markdownToPlainText(lines.join('\n'));
    if (!prose) return;
    paragraphs.push(prose);
    corpus.push(prose);
  };

  for (const block of blocks) {
    let body: string[] = [];
    for (const line of block.split('\n')) {
      const heading = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
      if (heading) {
        addProse(body);
        body = [];
        const prose = markdownToPlainText(heading[2]);
        headings.push({ level: heading[1].length, text: prose });
        if (prose) corpus.push(prose);
      } else {
        body.push(line);
      }
    }
    addProse(body);
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