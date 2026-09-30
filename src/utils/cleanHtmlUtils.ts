/**
 * Clean HTML Synthesizer & Validator
 * Ensures Clean HTML (clean-en, clean-id) always has complete, full-length content
 * transformed cleanly from inlineCssHtml with semantic tags, CSS variables, and JS.
 */

export function isCleanHtmlIncomplete(cleanHtml?: string): boolean {
  if (!cleanHtml || typeof cleanHtml !== 'string') return true;

  // Check if article body is missing or literally "..."
  const articleMatch = cleanHtml.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (!articleMatch) {
    const stripped = cleanHtml
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .trim();
    return stripped.length < 150 || stripped === '...';
  }

  const body = articleMatch[1];
  const bodyText = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // If the body is "...", or less than 150 characters, or contains obvious placeholder tokens
  if (
    bodyText === '...' ||
    bodyText.length < 150 ||
    bodyText.startsWith('...') ||
    bodyText.includes('...FULL IN-DEPTH') ||
    bodyText.includes('...FULL') ||
    bodyText === '...FULL ARTICLE...'
  ) {
    return true;
  }

  return false;
}

export function synthesizeCleanHtml(
  inlineCssHtml: string,
  existingCleanHtml?: string,
  topic: string = 'Commercial Fitness Equipment'
): string {
  if (!inlineCssHtml || typeof inlineCssHtml !== 'string') {
    return existingCleanHtml || '';
  }

  // Preserve FAQ Schema JSON-LD if present in existingCleanHtml
  let schemaScript = '';
  const schemaMatch = existingCleanHtml?.match(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>[\s\S]*?<\/script>/i
  );
  if (schemaMatch) {
    schemaScript = schemaMatch[0] + '\n';
  }

  // Extract inner body from inlineCssHtml
  let innerBody = inlineCssHtml;
  const match = inlineCssHtml.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (match) {
    innerBody = match[1];
  }

  // Strip all inline style="..." and style='...' attributes
  let semanticBody = innerBody
    .replace(/\s*style\s*=\s*"[^"]*"/gi, '')
    .replace(/\s*style\s*=\s*'[^']*'/gi, '');

  // Add semantic classes if missing
  semanticBody = semanticBody
    .replace(/<aside(?![^>]*class=)/gi, '<aside class="data-callout"')
    .replace(/<details(?![^>]*class=)/gi, '<details class="faq-item"');

  // Word count and reading time
  const textOnly = semanticBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const wordCount = textOnly ? textOnly.split(/\s+/).length : 850;
  const readingMins = Math.max(1, Math.ceil(wordCount / 200));

  return `${schemaScript}<style>
:root {
  --primary: #cc2929;
  --dark: #1a1d20;
  --slate: #333940;
  --bg-neutral: #f8fafc;
  --border: #e2e8f0;
}
.commercial-fitness-post {
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: var(--slate);
  line-height: 1.8;
  max-width: 840px;
  margin: 0 auto;
  padding: 32px 24px;
}
.commercial-fitness-post h2 {
  color: var(--dark);
  font-size: 1.85rem;
  font-weight: 700;
  margin-top: 2em;
  margin-bottom: 0.75em;
  letter-spacing: -0.02em;
  border-left: 4px solid var(--primary);
  padding-left: 14px;
}
.commercial-fitness-post h3 {
  color: var(--dark);
  font-size: 1.35rem;
  font-weight: 600;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
}
.commercial-fitness-post p {
  margin-bottom: 1.4em;
  line-height: 1.8;
}
.commercial-fitness-post strong {
  color: var(--dark);
}
.commercial-fitness-post a {
  color: var(--primary);
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.commercial-fitness-post figure {
  margin: 2.5em 0;
  text-align: center;
}
.commercial-fitness-post figure img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 8px;
  border: 1px solid var(--border);
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}
.commercial-fitness-post figcaption {
  color: #64748b;
  font-size: 0.85rem;
  margin-top: 0.75em;
}
.commercial-fitness-post aside.data-callout {
  background: var(--bg-neutral);
  border-left: 4px solid var(--primary);
  border-radius: 0 8px 8px 0;
  padding: 20px 24px;
  margin: 2.2em 0;
}
.commercial-fitness-post aside.data-callout strong {
  color: var(--primary);
  font-weight: 700;
}
.commercial-fitness-post details.faq-item {
  background: var(--bg-neutral);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px 20px;
  margin-bottom: 14px;
  transition: all 0.2s ease;
}
.commercial-fitness-post details.faq-item summary {
  font-weight: 600;
  color: var(--dark);
  cursor: pointer;
  font-size: 1.05rem;
  user-select: none;
}
.commercial-fitness-post details.faq-item summary:hover {
  color: var(--primary);
}
.commercial-fitness-post details.faq-item p {
  margin-top: 12px;
  margin-bottom: 0;
}
#reading-progress {
  position: fixed;
  top: 0;
  left: 0;
  height: 4px;
  background: var(--primary);
  width: 0%;
  z-index: 9999;
  transition: width 0.1s;
}
.reading-meta-bar {
  display: flex;
  gap: 16px;
  font-size: 0.85rem;
  color: #64748b;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 24px;
}
</style>

<div id="reading-progress"></div>

<article class="commercial-fitness-post">
  <div class="reading-meta-bar">
    <span id="est-read-time">~${readingMins} min read (${wordCount} words)</span>
    <span>•</span>
    <span>Commercial B2B Fitness Standards</span>
  </div>

  ${semanticBody}
</article>

<script>
(function() {
  window.addEventListener('scroll', function() {
    var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var scrolled = (winScroll / height) * 100;
    var bar = document.getElementById("reading-progress");
    if (bar) bar.style.width = scrolled + "%";
  });
})();
</script>`;
}
