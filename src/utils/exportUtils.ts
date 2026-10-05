import JSZip from 'jszip';
import { GeneratedArticle } from '../types/article';
import { isCleanHtmlIncomplete, synthesizeCleanHtml } from './cleanHtmlUtils';

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    } else {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    }
  } catch (err) {
    console.error('Failed to copy to clipboard', err);
    return false;
  }
}

export function downloadFile(filename: string, content: string, mimeType: string = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface ArticleFile {
  name: string;
  content: string;
}

export function buildArticleFolder(article: GeneratedArticle): ArticleFile[] {
  const slug = article.seoMetadata?.urlSlug || 'article';
  const files: ArticleFile[] = [];

  const inlineEn = article.formats?.['inline-en'] || article.inlineCssHtml;
  const inlineId = article.formats?.['inline-id'];
  const cleanEn = article.formats?.['clean-en'] || article.cleanHtml;
  const cleanId = article.formats?.['clean-id'];

  if (inlineEn) files.push({ name: `${slug}-inline-en.html`, content: inlineEn });
  if (inlineId) files.push({ name: `${slug}-inline-id.html`, content: inlineId });

  if (cleanEn) {
    files.push({
      name: `${slug}-clean-en.html`,
      content: isCleanHtmlIncomplete(cleanEn)
        ? synthesizeCleanHtml(inlineEn, cleanEn, article.topic)
        : cleanEn,
    });
  }
  if (cleanId) {
    files.push({
      name: `${slug}-clean-id.html`,
      content: isCleanHtmlIncomplete(cleanId)
        ? synthesizeCleanHtml(inlineId || inlineEn, cleanId, article.topic)
        : cleanId,
    });
  }

  if (article.seoMetadataEn) {
    files.push({
      name: `${slug}-seo-metadata-en.json`,
      content: JSON.stringify(article.seoMetadataEn, null, 2),
    });
  }
  if (article.seoMetadataId) {
    files.push({
      name: `${slug}-seo-metadata-id.json`,
      content: JSON.stringify(article.seoMetadataId, null, 2),
    });
  }
  if (!article.seoMetadataEn && !article.seoMetadataId) {
    files.push({
      name: `${slug}-seo-metadata.json`,
      content: JSON.stringify(article.seoMetadata, null, 2),
    });
  }

  files.push({ name: `${slug}-seo-metadata.txt`, content: buildMetadataSummary(article) });

  if (article.rawText) {
    files.push({ name: `${slug}.md`, content: article.rawText });
  }

  if (article.reviewReport) {
    files.push({
      name: `${slug}-review-report.json`,
      content: JSON.stringify(article.reviewReport, null, 2),
    });
  }

  if (article.imagePrompts?.length) {
    const lines = [
      '=========================================',
      'AI IMAGE GENERATOR PROMPTS (8K HYPER-REALISTIC)',
      '=========================================',
      `Target Article: ${article.seoMetadata?.headline ?? article.topic}`,
      '',
    ];
    article.imagePrompts.forEach((item, index) => {
      lines.push(
        `${index + 1}. ${item.label.toUpperCase()} (Aspect Ratio --ar ${item.aspectRatio})`
      );
      lines.push(`   - Concept: ${item.concept}`);
      lines.push(`   - Prompt Midjourney / FLUX / GPT:`);
      lines.push(`   "${item.prompt}"`, '');
    });
    files.push({ name: `${slug}-ai-image-prompts.txt`, content: lines.join('\n') });
  }

  return files;
}

function buildMetadataSummary(article: GeneratedArticle): string {
  const meta = article.seoMetadata;
  return [
    '=========================================',
    'SEO WORDPRESS METADATA',
    '=========================================',
    `SEO Title       : ${meta?.seoTitle ?? ''}`,
    `Headline        : ${meta?.headline ?? ''}`,
    `Focus Keyphrase : ${article.focusKeyphrase || meta?.focusKeyphrase || ''}`,
    `Meta Description: ${meta?.metaDescription ?? ''}`,
    `URL Slug        : ${meta?.urlSlug ?? ''}`,
    `Tags            : ${(meta?.tags ?? []).join(', ')}`,
    '',
    '=========================================',
    'ARTICLE PERFORMANCE METRICS',
    '=========================================',
    `Target Words    : ${article.targetWordCount}`,
    `Actual Words    : ${article.metrics?.wordCount ?? 0}`,
    `Reading Time    : ~${article.metrics?.readingTimeMinutes ?? 0} mins`,
    `Flesch Score    : ${
      typeof article.metrics?.fleschScore === 'number' && article.metrics.fleschScore > 0
        ? article.metrics.fleschScore
        : 'n/a (not measured)'
    }`,
    `Generated Date  : ${new Date(article.generatedAt).toLocaleString()}`,
    `Active Formats  : ${Object.keys(article.formats ?? {}).join(', ') || 'none'}`,
    article.reviewReport
      ? `Review Verdict  : ${article.reviewReport.verdict} (score ${article.reviewReport.seoScore})`
      : 'Review Verdict  : not reviewed',
    '',
  ].join('\n');
}

export async function downloadAllAsZip(article: GeneratedArticle): Promise<void> {
  const zip = new JSZip();
  for (const file of buildArticleFolder(article)) {
    zip.file(file.name, file.content);
  }
  const slug = article.seoMetadata?.urlSlug || 'article';
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `${slug}-package.zip`);
}

export async function downloadBatchAsZip(articles: GeneratedArticle[]): Promise<void> {
  const zip = new JSZip();
  articles.forEach((article, index) => {
    const slug = article.seoMetadata?.urlSlug || `article-${index + 1}`;
    const folder = zip.folder(slug) ?? zip;
    for (const file of buildArticleFolder(article)) {
      folder.file(file.name, file.content);
    }
  });
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `fisio-batch-${articles.length}-articles.zip`);
}

function triggerDownload(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
