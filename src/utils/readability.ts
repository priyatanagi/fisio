export interface ReadabilityMetrics {
  fleschReadingEase: number;
  gradeLevel: number;
  wordCount: number;
  sentenceCount: number;
  syllableCount: number;
  averageSentenceLength: number;
  shortSentencePercentage: number;
  transitionWordCount: number;
  statusLabel: string;
  statusColor: string;
  isYoastCompliant: boolean;
}

// Common transition words in English & Indonesian
const ENGLISH_TRANSITIONS = [
  'therefore', 'as a result', 'on the other hand', 'furthermore', 'moreover',
  'consequently', 'in addition', 'for example', 'however', 'similarly',
  'specifically', 'subsequently', 'in contrast', 'ultimately', 'likewise'
];

const INDONESIAN_TRANSITIONS = [
  'oleh karena itu', 'sebagai hasilnya', 'di sisi lain', 'selain itu', 'bahkan',
  'akibatnya', 'sebagai contoh', 'namun demikian', 'dengan demikian', 'khususnya',
  'selanjutnya', 'sebaliknya', 'pada akhirnya', 'di samping itu', 'sementara itu'
];

// Helper to count syllables in an English word
function countEnglishSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;

  let count = 0;
  const vowels = 'aeiouy';
  let prevVowel = false;

  for (let i = 0; i < clean.length; i++) {
    const isVowel = vowels.includes(clean[i]);
    if (isVowel && !prevVowel) {
      count++;
    }
    prevVowel = isVowel;
  }

  // Adjust for silent 'e' at end
  if (clean.endsWith('e') && !clean.endsWith('le') && count > 1) {
    count--;
  }

  return Math.max(1, count);
}

// Helper to count syllables in an Indonesian word (regular vowel grouping)
function countIndonesianSyllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!clean) return 0;
  if (clean.length <= 3) return 1;

  let count = 0;
  const vowels = 'aiueo';
  let prevVowel = false;

  for (let i = 0; i < clean.length; i++) {
    const isVowel = vowels.includes(clean[i]);
    if (isVowel && !prevVowel) {
      count++;
    }
    prevVowel = isVowel;
  }

  return Math.max(1, count);
}

export function readabilityFromText(
  text: string,
  language: 'en' | 'id' | string = 'en'
): ReadabilityMetrics {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) {
    return {
      fleschReadingEase: 0,
      gradeLevel: 0,
      wordCount: 0,
      sentenceCount: 0,
      syllableCount: 0,
      averageSentenceLength: 0,
      shortSentencePercentage: 0,
      transitionWordCount: 0,
      statusLabel: 'No content',
      statusColor: 'text-zinc-500',
      isYoastCompliant: false,
    };
  }

  const isIndo = language.toLowerCase() === 'id';
  const lowerText = clean.toLowerCase();

  // Split into sentences (handles . ! ? followed by space or boundary)
  const rawSentences = clean
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 5);

  const sentenceCount = Math.max(1, rawSentences.length);

  // Split into words
  const words = clean
    .split(/\s+/)
    .map((w) => w.replace(/[^\w-]/g, '').trim())
    .filter((w) => w.length > 0);

  const wordCount = Math.max(1, words.length);

  // Count syllables
  let totalSyllables = 0;
  for (const w of words) {
    totalSyllables += isIndo ? countIndonesianSyllables(w) : countEnglishSyllables(w);
  }
  const syllableCount = Math.max(1, totalSyllables);

  // Short sentences (< 20 words)
  let shortSentences = 0;
  rawSentences.forEach((sentence) => {
    const sWordCount = sentence.split(/\s+/).filter(Boolean).length;
    if (sWordCount < 20) {
      shortSentences++;
    }
  });
  const shortSentencePercentage = Math.round((shortSentences / sentenceCount) * 100);

  // Transition words
  const transitionList = isIndo ? INDONESIAN_TRANSITIONS : ENGLISH_TRANSITIONS;
  let transitionWordCount = 0;
  transitionList.forEach((phrase) => {
    const matches = lowerText.match(new RegExp(`\\b${phrase}\\b`, 'g'));
    if (matches) {
      transitionWordCount += matches.length;
    }
  });

  // Flesch Reading Ease Formula:
  // 206.835 - 1.015 * (words / sentences) - 84.6 * (syllables / words)
  const asl = wordCount / sentenceCount;
  const asw = syllableCount / wordCount;

  let flesch = 206.835 - (1.015 * asl) - (84.6 * asw);
  flesch = Math.max(0, Math.min(100, Math.round(flesch * 10) / 10));

  // Flesch-Kincaid Grade Level Formula:
  // 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59
  let gradeLevel = (0.39 * asl) + (11.8 * asw) - 15.59;
  gradeLevel = Math.max(1, Math.min(18, Math.round(gradeLevel * 10) / 10));

  // Status mapping
  let statusLabel = 'Standard';
  let statusColor = 'text-emerald-400';
  let isYoastCompliant = false;

  if (flesch >= 60 && flesch <= 75) {
    statusLabel = 'Optimal Yoast & Flesch (60–75)';
    statusColor = 'text-emerald-400';
    isYoastCompliant = true;
  } else if (flesch > 75) {
    statusLabel = 'Very Easy to Read (75+)';
    statusColor = 'text-blue-400';
    isYoastCompliant = true;
  } else if (flesch >= 50 && flesch < 60) {
    statusLabel = 'Fairly Complex (50–59)';
    statusColor = 'text-amber-400';
    isYoastCompliant = false;
  } else {
    statusLabel = 'Difficult / Academic (< 50)';
    statusColor = 'text-rose-400';
    isYoastCompliant = false;
  }

  return {
    fleschReadingEase: flesch,
    gradeLevel,
    wordCount,
    sentenceCount,
    syllableCount,
    averageSentenceLength: Math.round(asl * 10) / 10,
    shortSentencePercentage,
    transitionWordCount,
    statusLabel,
    statusColor,
    isYoastCompliant,
  };
}

export function calculateReadability(
  htmlContent: string,
  language: 'en' | 'id' | string = 'en'
): ReadabilityMetrics {
  const text = (htmlContent || '')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ');
  return readabilityFromText(text, language);
}
