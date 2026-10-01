export interface UniversalRules {
  targetFleschMin: number;
  targetFleschMax: number;
  maxSentenceWords: number;
  minSentencesPerParagraph: number;
  minParagraphsPerH2: number;
  seoTitleMaxChars: number;
  metaDescriptionMaxChars: number;
  focusKeyphraseMaxChars: number;
  requireStats: boolean;
  requireFaq: boolean;
  allowInlineScripts: boolean;
  allowH1InArticle: boolean;
}

export const DEFAULT_UNIVERSAL_RULES: UniversalRules = {
  targetFleschMin: 60,
  targetFleschMax: 70,
  maxSentenceWords: 20,
  minSentencesPerParagraph: 3,
  minParagraphsPerH2: 2,
  seoTitleMaxChars: 55,
  metaDescriptionMaxChars: 155,
  focusKeyphraseMaxChars: 20,
  requireStats: true,
  requireFaq: true,
  allowInlineScripts: false,
  allowH1InArticle: false,
};

// The five B2B search-exclusion categories currently hardcoded in
// DEFAULT_NEGATIVE_PROMPT. Kept verbatim so default behaviour is unchanged, but
// now editable, because a physiotherapy clinic must not inherit
// "exclude clinical rehabilitation".
export const LEGACY_EXCLUSIONS: string[] = [
  'EXCLUDE consumer gym member searches ("gym terdekat", "membership gym", "gym harian", "daftar member gym"). Target the facility owner or buyer, not consumer gym-goers.',
  'EXCLUDE job and career searches ("lowongan kerja", "loker", "gaji personal trainer").',
  'EXCLUDE second-hand or scrap gear ("alat fitness bekas", "treadmill bekas", "second"). Positioning is exclusively premium new equipment.',
  'EXCLUDE DIY or amateur workout tutorials ("cara membuat alat gym", "tutorial latihan", "contoh gerakan").',
  'EXCLUDE clinical medical or therapy services ("biaya fisioterapi", "klinik fisioterapi", "terapi stroke").',
];
