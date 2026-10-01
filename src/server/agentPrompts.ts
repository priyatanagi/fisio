import type { UserProfile, DesignRules } from '../types/profile';
import { resolveProfile } from '../types/profile';
import { DEFAULT_UNIVERSAL_RULES, type UniversalRules } from '../config/universalRules';
import type { SeoBrief } from '../pipeline/stages';

export function buildBrandBlock(profile: UserProfile): string {
  const brand = resolveProfile(profile);
  const lines = [
    `Brand name: ${brand.businessName}`,
    `Industry / niche: ${brand.niche}`,
    `Location: ${brand.location}`,
    `Target market: ${brand.targetMarket}`,
    `Unique selling proposition: ${brand.usp}`,
    `Tone of voice: ${brand.toneOfVoice}`,
    `Default call to action: ${brand.defaultCta}`,
  ];
  if (profile.exclusions.length > 0) {
    lines.push('', 'SEARCH EXCLUSIONS (must be respected):');
    for (const rule of profile.exclusions) lines.push(`- ${rule}`);
  }
  return lines.join('\n');
}

export function buildUniversalRulesBlock(rules: UniversalRules): string {
  return [
    'UNIVERSAL WRITING AND SEO RULES:',
    `- Target Flesch Reading Ease between ${rules.targetFleschMin} and ${rules.targetFleschMax}.`,
    `- Keep sentences under ${rules.maxSentenceWords} words; at least 25% of sentences must be shorter.`,
    `- Every paragraph must contain at least ${rules.minSentencesPerParagraph} full sentences. No single-sentence paragraphs.`,
    `- Every H2 must be followed by at least ${rules.minParagraphsPerH2} paragraphs.`,
    `- SEO title at most ${rules.seoTitleMaxChars} characters, containing the focus keyphrase.`,
    `- Meta description at most ${rules.metaDescriptionMaxChars} characters, containing the focus keyphrase.`,
    `- Focus keyphrase at most ${rules.focusKeyphraseMaxChars} characters.`,
    rules.allowH1InArticle
      ? '- H1 tags are permitted.'
      : '- Do not use <h1> tags in the article body; the CMS supplies the H1.',
    rules.allowInlineScripts
      ? '- Inline scripts are permitted.'
      : '- Do not use <script> tags in inline-CSS output.',
    '- Never use emojis anywhere.',
    '- Avoid generic AI cliches: "delve into", "tapestry", "in a world where", "game-changer", "unleash", "embark".',
    rules.requireStats
      ? '- Include one or two specific authoritative statistics, emphasised or in a callout.'
      : '- Statistics are optional.',
    rules.requireFaq
      ? '- Include two or three FAQs as details/summary elements; in clean HTML also emit FAQPage JSON-LD.'
      : '- FAQs are optional.',
    '- Insert native <figure> and <img> tags in place with src, alt, title, loading="lazy", width, and height.',
    '- Include at least two internal and two external contextual links within the text flow.',
  ].join('\n');
}

export function buildDesignTokenBlock(rules: DesignRules): string {
  return [
    'BRAND DESIGN TOKENS (use exactly these, never substitute):',
    `- Primary colour: ${rules.primaryColor}`,
    `- Secondary colour (headers, accordions): ${rules.secondaryColor}`,
    `- Accent colour (highlights, badges): ${rules.accentColor}`,
    `- Background / neutral surface: ${rules.backgroundColor}`,
    `- Body text colour: ${rules.textColor}`,
    `- Heading font stack: ${rules.headingFont}`,
    `- Body font stack: ${rules.bodyFont}`,
    `- Button style: ${rules.buttonStyle}`,
    `- Blockquote style: ${rules.blockquoteStyle}`,
  ].join('\n');
}

export function buildJudgePrompt(
  input: { seedTopic: string; focusKeyphrase?: string },
  profile: UserProfile
): string {
  const keyphrase = input.focusKeyphrase?.trim();
  return `You are the Judge: an editorial strategist who decides which single article angle best serves a business's target market.

${buildBrandBlock(profile)}

SEED TOPIC: "${input.seedTopic}"
${keyphrase ? `PREFERRED FOCUS KEYPHRASE: "${keyphrase}"` : ''}

Evaluate the seed topic against the target market above. Choose ONE angle and reject the alternatives, explaining why each was rejected.

Respond with ONLY this JSON shape:
{
  "refinedTopic": "the specific angle this article will take",
  "searchIntent": "informational | commercial | transactional | navigational",
  "audienceAngle": "how this framing differs for this specific business",
  "subtopics": ["4 to 6 subtopics"],
  "rejectedAngles": [{ "angle": "...", "reason": "..." }]
}`;
}

export function buildKeywordResearchPrompt(topic: string, profile: UserProfile): string {
  return `You are a keyword research specialist.

${buildBrandBlock(profile)}

TOPIC: "${topic}"

Respond with ONLY this JSON shape:
{
  "primaryKeyword": "...",
  "secondaryKeywords": ["..."],
  "lsiEntities": ["..."],
  "questionQueries": ["..."],
  "intentModifiers": ["..."]
}
Provide up to 20 LSI entities and up to 10 question queries.`;
}

export function buildImpowerPrompt(
  input: { topic: string; targetWords: number; research?: unknown },
  profile: UserProfile
): string {
  const research = input.research
    ? `\nKEYWORD RESEARCH:\n${JSON.stringify(input.research, null, 2)}\n`
    : '';
  return `You are Impower: an SEO strategist who produces the content brief an article will be written from.

${buildBrandBlock(profile)}
${buildUniversalRulesBlock(DEFAULT_UNIVERSAL_RULES)}

TOPIC: "${input.topic}"
TARGET LENGTH: ~${input.targetWords} words
${research}
Respond with ONLY this JSON shape:
{
  "seoMetadata": {
    "seoTitle": "max 55 chars, contains the focus keyphrase",
    "headline": "click-magnet headline",
    "focusKeyphrase": "max 20 chars",
    "metaDescription": "max 155 chars, contains the focus keyphrase",
    "urlSlug": "kebab-case-slug",
    "tags": ["5 tags"]
  },
  "secondaryKeywords": ["..."],
  "outline": [{ "heading": "H2 text", "mustCover": ["what this section must include"] }],
  "faqPlan": [{ "question": "...", "answerShape": "what the answer should cover" }],
  "statPlan": ["specific authoritative figures to cite"],
  "internalLinkTargets": ["suggested internal link anchors"]
}`;
}

export function buildCreatorPrompt(
  input: {
    seedTopic: string;
    targetWords: number;
    brief: SeoBrief | null;
    toneOverride?: string;
    extraInstructions?: string;
  },
  profile: UserProfile
): string {
  const briefBlock = input.brief
    ? `\nCONTENT BRIEF (follow it exactly):\n${JSON.stringify(input.brief, null, 2)}\n`
    : '';
  const selfPlan = input.brief
    ? ''
    : '\nNo brief was supplied, so plan it yourself. After the markdown, emit a "selfPlanned" object with the same keys as the brief: seoMetadata, secondaryKeywords, outline, faqPlan, statPlan, internalLinkTargets.\n';
  const tone = input.toneOverride?.trim()
    ? `\nTONE OVERRIDE for this article: ${input.toneOverride.trim()}\n`
    : '';
  const extra = input.extraInstructions?.trim()
    ? `\nADDITIONAL INSTRUCTIONS:\n${input.extraInstructions.trim()}\n`
    : '';
  const shape = input.brief
    ? '{ "markdownContent": "# First section\\n\\nFull article markdown..." }'
    : '{ "markdownContent": "# First section\\n\\nFull article markdown...", "selfPlanned": { "seoMetadata": {}, "secondaryKeywords": [], "outline": [], "faqPlan": [], "statPlan": [], "internalLinkTargets": [] } }';

  return `You are the Creator: a long-form article writer.

${buildBrandBlock(profile)}
${buildUniversalRulesBlock(DEFAULT_UNIVERSAL_RULES)}

TOPIC: "${input.seedTopic}"
TARGET LENGTH: ~${input.targetWords} words
${briefBlock}${selfPlan}${tone}${extra}
Write the article as Markdown. Do not write HTML. Do not write a preamble or a closing note.

Respond with ONLY this JSON shape:
${shape}`;
}

export function buildReviewerPrompt(
  input: { markdown: string; brief: SeoBrief | null; revisedAfterIssues: boolean },
  profile: UserProfile
): string {
  return `You are the Reviewer: an independent auditor. You did not write this article. Fact-check it and audit its SEO against the brief.

${buildBrandBlock(profile)}

${input.brief ? `CONTENT BRIEF:\n${JSON.stringify(input.brief, null, 2)}\n` : ''}

ARTICLE MARKDOWN:
${input.markdown}

Judge "pass" only if there are no blocker issues. Use "revise" for fixable SEO or structure problems and "fail" for factual errors or off-brand content.

Respond with ONLY this JSON shape:
{
  "verdict": "pass | revise | fail",
  "seoScore": 0,
  "issues": [{ "severity": "blocker | warning | nit", "category": "fact | seo | readability | structure | brand", "message": "...", "suggestedFix": "..." }]
}`;
}

export function buildDesignerPrompt(
  input: { markdown: string; language: 'en' | 'id'; cssMode: 'inline' | 'clean' },
  profile: UserProfile
): string {
  const langName = input.language === 'id' ? 'Bahasa Indonesia' : 'English (US)';
  const modeRules =
    input.cssMode === 'inline'
      ? '- Apply inline CSS via a style attribute on EVERY tag, for example style="font-family: system-ui; line-height: 1.75;".\n- Do NOT include a <style> block.\n- Do NOT include <script> tags.'
      : '- Emit semantic HTML with NO inline styles at all. No style attributes.\n- Include one <style> block at the top defining CSS custom properties, then style everything through those properties and classes.\n- Include a JSON-LD FAQPage script block and a small accordion script.';

  const example =
    input.cssMode === 'inline'
      ? '{ "html": "<article style=\\"...\\">...</article>" }'
      : `{ "html": "<style>:root{--primary:${profile.designRules.primaryColor};}</style><article>...</article>" }`;

  return `You are the Designer: a front-end developer converting Markdown into publish-ready HTML.

${buildBrandBlock(profile)}
${buildDesignTokenBlock(profile.designRules)}

TARGET LANGUAGE: ${langName}. Write all visible text, headings and metadata natively in this language.
CSS MODE: ${input.cssMode.toUpperCase()}

RULES:
${modeRules}
- Preserve all content, headings, lists and structure exactly as written.
- Never introduce a colour that is not in the brand design tokens above.

MARKDOWN:
${input.markdown}

Respond with ONLY this JSON shape:
${example}`;
}
