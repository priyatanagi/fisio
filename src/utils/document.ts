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

function stripHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strips fenced code, then every markdown marker, keeping prose and link text. */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
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
  const blocks = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\n\s*\n/);

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;
    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/s);
    const lines = trimmed.split('\n');
    if (headingMatch && lines.every((line) => /^\s{0,3}#{1,6}\s+/.test(line) || !line.trim())) {
      for (const line of lines) {
        const match = line.match(/^\s{0,3}(#{1,6})\s+(.*)$/);
        if (match) {
          headings.push({ level: match[1].length, text: match[2].trim() });
          corpus.push(markdownToPlainText(match[2]));
        }
      }
      continue;
    }
    const prose = markdownToPlainText(trimmed);
    paragraphs.push(prose);
    corpus.push(prose);
  }
  return { text: corpus.filter(Boolean).join(' '), headings, paragraphs };
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
      hasFaqSignal: false,
      hasStrongFigure: false,
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
      /<details\b/i.test(html) || /faq|accordion|question/i.test(html) || /application\/ld\+json/i.test(html),
    hasStrongFigure:
      /<strong>[\s\S]*?[\d%][\s\S]*?<\/strong>/i.test(html) ||
      /<aside\b/i.test(html) ||
      /<b>[\s\S]*?[\d%][\s\S]*?<\/b>/i.test(html),
  };
}