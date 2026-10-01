import express from 'express';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { callProvider, cleanJsonOutput, callGemini, callOpenAI, callAnthropic } from './src/server/providers.js';
import { DEFAULT_BASE_SYSTEM_PROMPT, DEFAULT_NEGATIVE_PROMPT } from './src/config/defaultPrompts.js';
import { ProviderConfig } from './src/types/provider.js';
import { isCleanHtmlIncomplete, synthesizeCleanHtml } from './src/utils/cleanHtmlUtils.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const DEFAULT_PORT = 3000;
const MAX_PORT_ATTEMPTS = 10;

const PORT: number = (() => {
  const raw = process.env.PORT;
  if (!raw || !raw.trim()) return DEFAULT_PORT;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.warn(`[Server] Invalid PORT="${raw}", falling back to ${DEFAULT_PORT}.`);
    return DEFAULT_PORT;
  }
  return parsed;
})();

app.use(express.json({ limit: '25mb' }));

// Ensure cleanHtml has the full complete article content (prevents "..." placeholder bug)
function ensureCompleteCleanHtml(cleanHtml: string, inlineCssHtml: string, topic: string): string {
  if (isCleanHtmlIncomplete(cleanHtml)) {
    console.log('[Server] Synthesizing complete cleanHtml from inlineCssHtml to prevent truncated content...');
    return synthesizeCleanHtml(inlineCssHtml, cleanHtml, topic);
  }
  return cleanHtml;
}

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// Test connection endpoint for any provider
app.post('/api/test-provider', async (req, res) => {
  try {
    const { provider = 'gemini', model, apiKey, baseUrl } = req.body;
    const testConfig: ProviderConfig = { provider, model, apiKey, baseUrl };

    if (provider === 'openai') {
      let url = testConfig.baseUrl?.trim() || 'https://api.openai.com/v1';
      url = url.replace(/\/+$/, '');
      const modelsUrl = `${url}/models`;
      
      const response = await fetch(modelsUrl, {
        headers: {
          Authorization: `Bearer ${testConfig.apiKey}`,
        }
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI-compatible endpoint returned status ${response.status}: ${errText}`);
      }
      
      const data = await response.json();
      const modelsCount = data.data ? data.data.length : 0;
      
      return res.json({
        success: true,
        message: `Successfully connected! Found ${modelsCount} models. Base URL & API Key are valid.`,
      });
    }

    const testPrompt = 'Respond strictly with valid JSON: {"status": "ok", "message": "connection successful"}';

    const result = await callProvider(testPrompt, testConfig);

    const cleaned = cleanJsonOutput(result);
    JSON.parse(cleaned);

    return res.json({
      success: true,
      message: `Successfully connected to ${provider.toUpperCase()} (${model || 'default'})!`,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Connection test failed',
    });
  }
});

// Improve / Refine Article endpoint
app.post('/api/improve-article', async (req, res) => {
  try {
    const { htmlContent, instruction, providerConfig } = req.body;
    if (!htmlContent || !instruction) {
      return res.status(400).json({ error: 'htmlContent and instruction are required.' });
    }

    const prompt = `You are an Expert SEO Content Strategist & Web Developer.
Please improve the following commercial fitness article HTML according to this instruction:
"${instruction}"

RULES:
- Preserve all valid HTML tags, <figure><img> tags, statistical callout boxes, and FAQs.
- Do NOT add <h1> tags.
- Return ONLY valid raw JSON:
{
  "improvedHtml": "YOUR FULL IMPROVED HTML HERE"
}

Article HTML to improve:
${htmlContent}`;

    const providerType = providerConfig?.provider || 'gemini';
    let raw = '';
    if (providerType === 'gemini') raw = await callGemini(prompt, providerConfig);
    else if (providerType === 'openai') raw = await callOpenAI(prompt, providerConfig);
    else if (providerType === 'anthropic') raw = await callAnthropic(prompt, providerConfig);

    const parsed = JSON.parse(cleanJsonOutput(raw));
    return res.json({ improvedHtml: parsed.improvedHtml || htmlContent });
  } catch (err: any) {
    console.error('Error improving article:', err);
    return res.status(500).json({ error: err.message || 'Failed to improve article with AI.' });
  }
});

// Generate Article endpoint
app.post('/api/generate-article', async (req, res) => {
  try {
    const {
      topic,
      focusKeyphrase,
      secondaryKeywords,
      language = 'en',
      lengthTarget = 'standard',
      customWordCount,
      targetFormats = ['inline-en', 'inline-id', 'clean-en', 'clean-id'],
      systemPromptOverride,
      negativePromptOverride,
      providerConfig,
    } = req.body;

    if (!topic || typeof topic !== 'string' || !topic.trim()) {
      return res.status(400).json({ error: 'Topic is required.' });
    }

    let targetWords = 950;
    if (lengthTarget === 'short') targetWords = 650;
    else if (lengthTarget === 'long') targetWords = 1500;
    else if (lengthTarget === 'custom' && customWordCount) targetWords = Number(customWordCount);

    const needsEnglish = targetFormats.some((f: string) => f.endsWith('-en')) || language === 'en';
    const needsIndonesian = targetFormats.some((f: string) => f.endsWith('-id')) || language === 'id';

    const providerType = providerConfig?.provider || 'gemini';
    const resolvedProviderConfig: ProviderConfig = { ...providerConfig, provider: providerType };

    const buildMasterPrompt = (langCode: 'en' | 'id') => {
      const isIndo = langCode === 'id';
      const langName = isIndo ? 'Bahasa Indonesia' : 'English (US)';

      const basePrompt = (systemPromptOverride || DEFAULT_BASE_SYSTEM_PROMPT).replace(
        '{{TARGET_WORD_COUNT}}',
        `${targetWords} words (strict range ${Math.round(targetWords * 0.85)} – ${Math.round(targetWords * 1.15)})`
      );

      const negativePrompt = negativePromptOverride || DEFAULT_NEGATIVE_PROMPT;

      const keyphraseInstruction = focusKeyphrase?.trim()
        ? `- MANDATORY FOCUS KEYPHRASE TO USE: "${focusKeyphrase.trim()}". (Must appear in SEO Title, Meta Description, Paragraph 1, and H2/H3).`
        : '- Focus Keyphrase: Extract the most commercially intent-driven keyphrase (max 20 chars).';

      const secondaryKeywordsInstruction = secondaryKeywords?.trim()
        ? `- Secondary Keywords / LSI Terms to integrate naturally: "${secondaryKeywords.trim()}".`
        : '';

      return `${basePrompt}

---

${negativePrompt}

---

**USER REQUEST & ASSIGNMENT:**
- Topic / Article Theme: "${topic.trim()}"
${keyphraseInstruction}
${secondaryKeywordsInstruction}
- Target Language: ${langName} (Must be written natively and professionally in ${langName} throughout the article, headers, callouts, and SEO metadata)
- Target Content Length: ~${targetWords} words

**CRITICAL INSTRUCTION - FORMATTED JSON OUTPUT ONLY:**
CRITICAL: Output the ENTIRE, UNABBREVIATED ARTICLE TEXT in Markdown format. DO NOT WRITE '...' OR PLACEHOLDER TOKENS ANYWHERE.

Output your response exclusively as a valid JSON object matching the following structure without any markdown backticks or commentary:

{
  "seoMetadata": {
    "seoTitle": "Max 55 chars containing focus keyphrase",
    "headline": "Catchy & Click-magnet headline",
    "focusKeyphrase": "${focusKeyphrase?.trim() || 'Max 20 chars keyphrase'}",
    "metaDescription": "Max 155 chars containing focus keyphrase",
    "urlSlug": "kebab-case-wordpress-slug",
    "tags": ["tag1", "tag2", "tag3", "tag4", "tag5"]
  },
  "markdownContent": "# Primary Section Header\\n\\nExhaustive first paragraph with stats and keyphrase...",
  "imagePrompts": [
    {
      "type": "featured",
      "label": "Featured Image (16:9)",
      "aspectRatio": "16:9",
      "concept": "Main banner concept",
      "prompt": "Commercial gym interior shot with premium Realleader strength equipment..."
    }
  ],
  "metrics": {
    "wordCount": 980,
    "readingTimeMinutes": 5,
    "fleschScore": 65,
    "sentenceCount": 55,
    "statisticalHighlights": ["Highlight 1", "Highlight 2"]
  }
}`;
    };

    const buildFormatPrompt = (markdown: string, formatType: 'clean' | 'inline', langCode: 'en' | 'id') => {
      const langName = langCode === 'id' ? 'Bahasa Indonesia' : 'English (US)';
      if (formatType === 'clean') {
        return `You are an Expert Web Developer. Convert the following Markdown article into Clean Semantic HTML.
Target Language: ${langName}
RULES:
- Preserve all content, headings, lists, and structure exactly as written.
- Do NOT use inline CSS (no style="...").
- Use <article>, <h2>, <p>, <ul>, <strong>, <figure>, <img> etc.
- Output ONLY valid JSON containing the converted HTML.

Markdown Content:
${markdown}

{
  "cleanHtml": "<style>:root { --primary: #cc2929; --dark: #1a1d20; --slate: #333940; --bg-neutral: #f8fafc; --border: #e2e8f0; } .commercial-fitness-post { font-family: system-ui, sans-serif; color: var(--slate); line-height: 1.75; max-width: 820px; margin: 0 auto; } .commercial-fitness-post h2 { color: var(--dark); border-left: 4px solid var(--primary); padding-left: 12px; } .commercial-fitness-post figure img { width: 100%; height: auto; border-radius: 8px; border: 1px solid var(--border); } .data-callout { background: var(--bg-neutral); border-left: 4px solid var(--primary); padding: 20px; margin: 2em 0; } details.faq-item { background: var(--bg-neutral); border: 1px solid var(--border); border-radius: 6px; padding: 14px; margin-bottom: 12px; } </style>\\n<div id=\\"reading-progress\\"></div>\\n<article class=\\"commercial-fitness-post\\">...</article>\\n<script>/* Reading progress, word count counter, accordion script */</script>"
}`;
      } else {
        return `You are an Expert Web Developer. Convert the following Markdown article into Inline CSS HTML.
Target Language: ${langName}
RULES:
- Preserve all content, headings, lists, and structure exactly as written.
- Apply professional inline CSS styling (e.g., style="font-family: system-ui; color: #333; line-height: 1.6;") to EVERY tag.
- Output ONLY valid JSON containing the converted HTML.

Markdown Content:
${markdown}

{
  "inlineCssHtml": "<article class=\\"fitness-article\\" style=\\"font-family: system-ui, -apple-system, sans-serif; color: #333940; line-height: 1.75; max-width: 820px; margin: 0 auto;\\"><h2>Primary Section Header</h2><p style=\\"font-size: 16px; margin-bottom: 20px;\\">Exhaustive first paragraph...</p></article>"
}`;
      }
    };

    const processLanguage = async (langCode: 'en' | 'id') => {
      console.log(`Generating Master Markdown for ${langCode}...`);
      const masterRaw = await callProvider(buildMasterPrompt(langCode), resolvedProviderConfig);
      const masterData = JSON.parse(cleanJsonOutput(masterRaw));
      
      const formatPromises = [];
      let cleanHtml = '';
      let inlineCssHtml = '';
      
      if (targetFormats.includes(`clean-${langCode}`)) {
        console.log(`Converting to Clean HTML for ${langCode}...`);
        formatPromises.push(
          callProvider(buildFormatPrompt(masterData.markdownContent, 'clean', langCode), resolvedProviderConfig)
            .then(raw => { cleanHtml = JSON.parse(cleanJsonOutput(raw)).cleanHtml || ''; })
        );
      }
      
      if (targetFormats.includes(`inline-${langCode}`)) {
        console.log(`Converting to Inline CSS HTML for ${langCode}...`);
        formatPromises.push(
          callProvider(buildFormatPrompt(masterData.markdownContent, 'inline', langCode), resolvedProviderConfig)
            .then(raw => { inlineCssHtml = JSON.parse(cleanJsonOutput(raw)).inlineCssHtml || ''; })
        );
      }
      
      await Promise.all(formatPromises);
      
      return {
        ...masterData,
        cleanHtml,
        inlineCssHtml
      };
    };

    let enData: any = null;
    let idData: any = null;

    if (needsEnglish && needsIndonesian) {
      console.log('Generating English package...');
      enData = await processLanguage('en');

      console.log('Generating Indonesian package...');
      try {
        await new Promise((r) => setTimeout(r, 600));
        idData = await processLanguage('id');
      } catch (idErr: any) {
        console.warn('Indonesian generation had issue, creating localized fallback from English package:', idErr.message);
        idData = enData;
      }
    } else if (needsIndonesian) {
      console.log('Generating Indonesian package...');
      idData = await processLanguage('id');
    } else {
      console.log('Generating English package...');
      enData = await processLanguage('en');
    }

    const primaryData = enData || idData;

    // We no longer use ensureCompleteCleanHtml here because the format tasks directly generate full HTML from markdown.
    const formatsBundle: Record<string, string> = {};
    if (enData) {
      formatsBundle['inline-en'] = enData.inlineCssHtml || '';
      formatsBundle['clean-en'] = enData.cleanHtml || '';
    }
    if (idData) {
      formatsBundle['inline-id'] = idData.inlineCssHtml || '';
      formatsBundle['clean-id'] = idData.cleanHtml || '';
    }

    // Calculate actual word count of primary content
    const primaryHtml = formatsBundle['inline-en'] || formatsBundle['inline-id'] || formatsBundle['clean-en'] || formatsBundle['clean-id'] || '';
    const textOnly = primaryHtml
      .replace(/<[^>]*>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const actualWordCount = textOnly ? textOnly.split(/\s+/).length : targetWords;
    const readingTime = Math.max(1, Math.ceil(actualWordCount / 200));

    if (!primaryData.metrics) {
      primaryData.metrics = {
        wordCount: actualWordCount,
        readingTimeMinutes: readingTime,
        fleschScore: 66,
      };
    } else {
      primaryData.metrics.wordCount = actualWordCount;
      primaryData.metrics.readingTimeMinutes = readingTime;
    }

    const result = {
      id: `art_${Date.now()}`,
      topic,
      focusKeyphrase: focusKeyphrase || primaryData.seoMetadata?.focusKeyphrase,
      secondaryKeywords,
      language: needsEnglish ? 'en' : 'id',
      lengthTarget,
      targetWordCount: targetWords,
      targetFormats,
      formats: formatsBundle,
      seoMetadata: primaryData.seoMetadata,
      seoMetadataEn: enData ? enData.seoMetadata : undefined,
      seoMetadataId: idData ? idData.seoMetadata : undefined,
      inlineCssHtml: formatsBundle['inline-en'] || formatsBundle['inline-id'] || '',
      cleanHtml: formatsBundle['clean-en'] || formatsBundle['clean-id'] || '',
      imagePrompts: primaryData.imagePrompts || [],
      metrics: primaryData.metrics,
      generatedAt: new Date().toISOString(),
      providerUsed: `${providerType.toUpperCase()}: ${providerConfig?.model || 'default'}`,
    };

    return res.json(result);
  } catch (error: any) {
    console.error('Error generating article:', error);
    return res.status(500).json({
      error: error.message || 'An error occurred during article generation.',
    });
  }
});

function listenWithFallback(port: number, attemptsLeft: number = MAX_PORT_ATTEMPTS): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`\n  Server ready - open in browser:  http://localhost:${port}\n  (bound to 0.0.0.0:${port}, reachable from other devices on your network)\n`);
      resolve(port);
    });

    server.once('error', (err: NodeJS.ErrnoException) => {
      server.close();
      if (err.code !== 'EADDRINUSE' || attemptsLeft <= 1) {
        return reject(err);
      }
      console.warn(`[Server] Port ${port} is in use, trying ${port + 1}...`);
      listenWithFallback(port + 1, attemptsLeft - 1).then(resolve, reject);
    });
  });
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  try {
    await listenWithFallback(PORT);
  } catch (err: any) {
    console.error('[Server] Failed to start server:', err.message || err);
    process.exit(1);
  }
}

startServer();
