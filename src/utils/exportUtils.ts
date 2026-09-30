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

export async function downloadAllAsZip(article: GeneratedArticle) {
  const zip = new JSZip();
  const slug = article.seoMetadata.urlSlug || 'commercial-fitness-article';

  // 1. All available formats in formats bundle
  if (article.formats['inline-en']) {
    zip.file(`${slug}-inline-en.html`, article.formats['inline-en']);
  }
  if (article.formats['inline-id']) {
    zip.file(`${slug}-inline-id.html`, article.formats['inline-id']);
  }

  // Ensure clean HTML files are completely filled with real content
  const cleanEnContent = article.formats['clean-en'] || article.cleanHtml;
  if (cleanEnContent) {
    const finalCleanEn = isCleanHtmlIncomplete(cleanEnContent)
      ? synthesizeCleanHtml(article.formats['inline-en'] || article.inlineCssHtml, cleanEnContent, article.topic)
      : cleanEnContent;
    zip.file(`${slug}-clean-en.html`, finalCleanEn);
  }

  const cleanIdContent = article.formats['clean-id'];
  if (cleanIdContent) {
    const finalCleanId = isCleanHtmlIncomplete(cleanIdContent)
      ? synthesizeCleanHtml(article.formats['inline-id'] || article.inlineCssHtml, cleanIdContent, article.topic)
      : cleanIdContent;
    zip.file(`${slug}-clean-id.html`, finalCleanId);
  }

  // 2. SEO Metadata
  if (article.seoMetadataEn) {
    zip.file(`${slug}-seo-metadata-en.json`, JSON.stringify(article.seoMetadataEn, null, 2));
  }
  if (article.seoMetadataId) {
    zip.file(`${slug}-seo-metadata-id.json`, JSON.stringify(article.seoMetadataId, null, 2));
  }
  if (!article.seoMetadataEn && !article.seoMetadataId) {
    zip.file(`${slug}-seo-metadata.json`, JSON.stringify(article.seoMetadata, null, 2));
  }

  const metadataText = `=========================================
SEO WORDPRESS METADATA
=========================================
SEO Title       : ${article.seoMetadata.seoTitle}
Headline        : ${article.seoMetadata.headline}
Focus Keyphrase : ${article.focusKeyphrase || article.seoMetadata.focusKeyphrase}
Meta Description: ${article.seoMetadata.metaDescription}
URL Slug        : ${article.seoMetadata.urlSlug}
Tags            : ${article.seoMetadata.tags.join(', ')}

=========================================
ARTICLE PERFORMANCE METRICS
=========================================
Target Words    : ${article.targetWordCount}
Actual Words    : ${article.metrics.wordCount}
Reading Time    : ~${article.metrics.readingTimeMinutes} mins
Flesch Score    : ${article.metrics.fleschScore}
Generated Date  : ${new Date(article.generatedAt).toLocaleString()}
Active Formats  : ${Object.keys(article.formats).join(', ') || 'inline-css, clean-html'}
`;
  zip.file(`${slug}-seo-metadata.txt`, metadataText);

  // 3. AI Image Generation Prompts
  let promptsText = `=========================================
AI IMAGE GENERATOR PROMPTS (8K HYPER-REALISTIC)
=========================================
Target Article: ${article.seoMetadata.headline}

`;
  article.imagePrompts.forEach((item, index) => {
    promptsText += `${index + 1}. ${item.label.toUpperCase()} (Aspect Ratio --ar ${item.aspectRatio})
   - Concept: ${item.concept}
   - Prompt Midjourney / FLUX / GPT:
     "${item.prompt}"\n\n`;
  });
  zip.file(`${slug}-ai-image-prompts.txt`, promptsText);

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}-4formats-complete-package.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
