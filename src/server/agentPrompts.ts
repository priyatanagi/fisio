import type { UserProfile, DesignRules } from '../types/profile';
import { resolveProfile } from '../types/profile';
import { DEFAULT_UNIVERSAL_RULES, type UniversalRules } from '../config/universalRules';
import { withTokenDefaults, readToken, type Token } from '../config/designTokens';
import { validateContrast } from '../config/tokenContrast';
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
  const r = withTokenDefaults(rules);
  const t = (key: string) =>
    readToken(r, { key, label: key, hint: '', fallback: '', kind: 'choice' } as Token);
  const issues = validateContrast(r);
  // Compact two-column form: the model reads this the same as prose but it
  // costs roughly half the lines, which matters once the block is 20+ entries.
  const line = (label: string, value: string) => `- ${label}: ${value}`;
  const rows = [
    line('Primary', r.primaryColor),
    line('Secondary (headings)', r.secondaryColor),
    line('Accent', r.accentColor),
    line('Background', r.backgroundColor),
    line('Body text', r.textColor),
    line('Heading font', r.headingFont),
    line('Body font', r.bodyFont),
    line('Body copy', `${t('bodyStyle')}; line-height ${t('lineHeight')}; width ${t('measureWidth')}`),
    line('Headings', `${t('headingStyle')}; weight ${t('headingWeight')}; h1 ${t('h1Size')}; tracking ${t('letterSpacing')}`),
    line('Link', t('hyperlinkStyle')),
    line('Bullets', t('bulletStyle')),
    line('Numbering', t('numberingStyle')),
    line('Image frame', t('imageStyle')),
    line('Code', t('codeStyle')),
    line('Table', t('tableStyle')),
    line('FAQ', t('faqStyle')),
    line('Blockquote', t('blockquoteStyle')),
    line('Button', t('buttonStyle')),
  ];
  return [
    'BRAND DESIGN TOKENS — use exactly these values, never substitute a colour or font:',
    ...rows,
    issues.length
      ? `CONTRAST: keep body text at least 4.5:1 against the background. These pairings are already verified: ${issues
          .map((i) => `${i.label} ${i.ratio}:1`)
          .join(', ')}.`
      : 'CONTRAST: keep all body text at or above 4.5:1 against the background.',
    '',
    'Apply every element style above as a concrete CSS decision, written as inline `style`',
    'declarations on the element itself. Do not rely on classes or an external stylesheet.',
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

SUBJECT LOCK: refinedTopic must stay on the exact subject of SEED TOPIC. You may narrow the angle, add the audience, or sharpen the framing, but you must NOT swap in a different subject, product, industry, or subject matter. If the seed topic sits outside this business's niche, keep the seed topic's subject and choose the angle that best connects them — never answer a different question instead.

Respond with ONLY this JSON shape:
{
  "refinedTopic": "the specific angle this article will take, same subject as the seed topic",
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
  input: { topic: string; seedTopic?: string; focusKeyphrase?: string; targetWords: number; research?: unknown },
  profile: UserProfile
): string {
  const research = input.research
    ? `\nKEYWORD RESEARCH:\n${JSON.stringify(input.research, null, 2)}\n`
    : '';
  const sourceTopic =
    input.seedTopic?.trim() && input.seedTopic.trim() !== input.topic.trim()
      ? `\nORIGINAL USER TOPIC (authoritative subject, the article must stay on this): "${input.seedTopic.trim()}"\nTOPIC is only the angle chosen for it. Never replace the subject above.\n`
      : '';
  const pinnedKeyword = input.focusKeyphrase?.trim()
    ? `\nPINNED FOCUS KEYPHRASE (the user chose this; use it verbatim, do not substitute): "${input.focusKeyphrase.trim()}"\n`
    : '';
  return `You are Impower: an SEO strategist who produces the content brief an article will be written from.

${buildBrandBlock(profile)}
${buildUniversalRulesBlock(DEFAULT_UNIVERSAL_RULES)}

TOPIC: "${input.topic}"
${sourceTopic}${pinnedKeyword}TARGET LENGTH: ~${input.targetWords} words
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
    originalTopic?: string;
    focusKeyphrase?: string;
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

  const sourceTopic =
    input.originalTopic?.trim() && input.originalTopic.trim() !== input.seedTopic.trim()
      ? `\nORIGINAL USER TOPIC (the authoritative subject of this article): "${input.originalTopic.trim()}"\nTOPIC above is only the angle chosen for it. Write about the ORIGINAL USER TOPIC. Do not drift into the brand's own products, industry, or any other subject.\n`
      : '\nThe article must stay exactly on the TOPIC above. Do not substitute a different subject, product, or industry from the brand block above.\n';
  const pinnedKeyword = input.focusKeyphrase?.trim()
    ? `\nPINNED FOCUS KEYPHRASE (use this exact phrase; it overrides any other keyphrase from the brief): "${input.focusKeyphrase.trim()}"\n`
    : '';

  return `You are the Creator: a long-form article writer.

${buildBrandBlock(profile)}
${buildUniversalRulesBlock(DEFAULT_UNIVERSAL_RULES)}

TOPIC: "${input.seedTopic}"
${sourceTopic}${pinnedKeyword}TARGET LENGTH: ~${input.targetWords} words
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
