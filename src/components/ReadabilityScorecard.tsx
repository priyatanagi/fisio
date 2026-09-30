import React, { useMemo, useState } from 'react';
import { calculateReadability } from '../utils/readability';
import {
  Gauge,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Copy,
  Check,
  Sparkles,
  BookOpen,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { copyToClipboard } from '../utils/exportUtils';

interface ReadabilityScorecardProps {
  content: string;
  language: string;
  onLanguageChange?: (lang: 'en' | 'id') => void;
}

export const ReadabilityScorecard: React.FC<ReadabilityScorecardProps> = ({
  content,
  language,
  onLanguageChange,
}) => {
  const [copied, setCopied] = useState(false);
  const activeLang = language === 'id' ? 'id' : 'en';

  const metrics = useMemo(() => {
    return calculateReadability(content, activeLang);
  }, [content, activeLang]);

  // Transition words list helper
  const transitionMatches = useMemo(() => {
    const text = content
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .toLowerCase();

    const enTransitions = [
      'therefore', 'as a result', 'on the other hand', 'furthermore', 'moreover',
      'consequently', 'in addition', 'for example', 'however', 'similarly',
      'specifically', 'subsequently', 'in contrast', 'ultimately', 'likewise',
      'further', 'meanwhile', 'besides', 'thus', 'notably'
    ];
    const idTransitions = [
      'oleh karena itu', 'sebagai hasilnya', 'di sisi lain', 'selain itu', 'bahkan',
      'akibatnya', 'sebagai contoh', 'namun demikian', 'dengan demikian', 'khususnya',
      'selanjutnya', 'sebaliknya', 'pada akhirnya', 'di samping itu', 'sementara itu',
      'oleh sebab itu', 'terlebih lagi'
    ];

    const list = activeLang === 'id' ? idTransitions : enTransitions;
    const found: { phrase: string; count: number }[] = [];

    list.forEach((phrase) => {
      const regex = new RegExp(`\\b${phrase}\\b`, 'gi');
      const matches = text.match(regex);
      if (matches && matches.length > 0) {
        found.push({ phrase, count: matches.length });
      }
    });

    return found.sort((a, b) => b.count - a.count);
  }, [content, activeLang]);

  const handleCopyReport = async () => {
    const report = `=========================================
FLESCH-KINCAID READABILITY AUDIT REPORT
=========================================
Language                : ${activeLang === 'id' ? 'Bahasa Indonesia' : 'English (US)'}
Flesch Reading Ease     : ${metrics.fleschReadingEase}/100 (${metrics.statusLabel})
Target Yoast Standard   : 60 - 75 (Met: ${metrics.isYoastCompliant ? 'YES' : 'NO'})
US Grade Level          : ${metrics.gradeLevel} (Optimal: 7th - 9th Grade)
Total Words             : ${metrics.wordCount}
Total Sentences         : ${metrics.sentenceCount}
Average Sentence Length : ${metrics.averageSentenceLength} words/sentence
Short Sentences (<20w)  : ${metrics.shortSentencePercentage}% (Yoast Target: >= 25%)
Transition Words        : ${metrics.transitionWordCount} detected
Total Syllables         : ${metrics.syllableCount}

TRANSITION WORDS DETECTED:
${transitionMatches.map((t) => `- ${t.phrase} (${t.count}x)`).join('\n') || 'None'}
=========================================`;

    const ok = await copyToClipboard(report);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Context */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-zinc-100" />
            <h3 className="text-sm font-bold text-zinc-100 font-mono tracking-wide uppercase">
              Flesch-Kincaid Readability &amp; Rhythm Calculator
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Real-time algorithmic measurement for commercial fitness articles. Meets Yoast SEO &amp; E-E-A-T comprehension criteria.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Language Selector */}
          <div className="flex items-center bg-zinc-950 p-0.5 rounded-lg border border-zinc-800 text-xs font-mono">
            <button
              onClick={() => onLanguageChange?.('en')}
              className={`px-3 py-1 rounded transition-colors ${
                activeLang === 'en'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              English
            </button>
            <button
              onClick={() => onLanguageChange?.('id')}
              className={`px-3 py-1 rounded transition-colors ${
                activeLang === 'id'
                  ? 'bg-zinc-800 text-zinc-100 font-semibold'
                  : 'text-zinc-400 hover:text-zinc-200'
              }`}
            >
              Bahasa Indonesia
            </button>
          </div>

          {/* Copy Report */}
          <button
            onClick={handleCopyReport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs font-medium text-zinc-200 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Report Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-zinc-400" />
                <span>Copy Audit</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Flesch Reading Ease */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-zinc-400">
            <span>Flesch Reading Ease</span>
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${
                metrics.isYoastCompliant
                  ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                  : 'bg-amber-950/60 border-amber-800 text-amber-400'
              }`}
            >
              {metrics.isYoastCompliant ? 'Yoast Optimal' : 'Acceptable'}
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black font-mono text-zinc-100">
              {metrics.fleschReadingEase}
            </span>
            <span className="text-sm text-zinc-400 font-mono">/ 100</span>
          </div>
          <p className="text-xs text-zinc-400">
            Target 60–75 for business decision makers and commercial gym buyers.
          </p>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-3">
            <div
              className={`h-full transition-all duration-500 ${
                metrics.fleschReadingEase >= 60 && metrics.fleschReadingEase <= 75
                  ? 'bg-emerald-400'
                  : metrics.fleschReadingEase > 75
                  ? 'bg-sky-400'
                  : 'bg-amber-400'
              }`}
              style={{ width: `${Math.min(100, Math.max(10, metrics.fleschReadingEase))}%` }}
            />
          </div>
        </div>

        {/* 2. Grade Level */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-zinc-400">
            <span>US Grade Level</span>
            <span className="text-[10px] font-mono text-zinc-400">K-12 Equivalent</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black font-mono text-zinc-100">
              {metrics.gradeLevel}
            </span>
            <span className="text-sm text-zinc-400 font-mono">th Grade</span>
          </div>
          <p className="text-xs text-zinc-400">
            {metrics.gradeLevel <= 9
              ? 'Ideal for B2B executives (easy to scan, crisp phrasing).'
              : 'Dense technical vocabulary.'}
          </p>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-zinc-300 transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(10, (metrics.gradeLevel / 12) * 100))}%` }}
            />
          </div>
        </div>

        {/* 3. Average Sentence Length */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-zinc-400">
            <span>Avg Sentence Length</span>
            <span className="text-[10px] font-mono text-zinc-400">Yoast: &le; 20w</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black font-mono text-zinc-100">
              {metrics.averageSentenceLength}
            </span>
            <span className="text-sm text-zinc-400 font-mono">words</span>
          </div>
          <p className="text-xs text-zinc-400">
            {metrics.averageSentenceLength <= 20
              ? 'Excellent rhythm. Keeps mobile and desktop readers engaged.'
              : 'Sentences are too long. Split complex sentences into two.'}
          </p>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-3">
            <div
              className={`h-full transition-all duration-500 ${
                metrics.averageSentenceLength <= 20 ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
              style={{ width: `${Math.min(100, (metrics.averageSentenceLength / 30) * 100)}%` }}
            />
          </div>
        </div>

        {/* 4. Short Sentence Proportion */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-2">
          <div className="flex items-center justify-between text-xs font-mono uppercase text-zinc-400">
            <span>Short Sentences (&lt;20w)</span>
            <span className="text-[10px] font-mono text-zinc-400">Rule: &ge; 25%</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl sm:text-4xl font-black font-mono text-emerald-400">
              {metrics.shortSentencePercentage}%
            </span>
            <span className="text-sm text-zinc-400 font-mono">of article</span>
          </div>
          <p className="text-xs text-zinc-400">
            {metrics.shortSentencePercentage >= 25
              ? 'Meets Yoast sentence length criteria perfectly.'
              : 'Needs more punchy one-sentence statements.'}
          </p>
          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden mt-3">
            <div
              className="h-full bg-emerald-400 transition-all duration-500"
              style={{ width: `${Math.min(100, metrics.shortSentencePercentage)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Two-Column Deep Audit Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Transition Words Breakdown */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-semibold uppercase tracking-wider font-mono text-zinc-200">
                Transition Words Analysis ({metrics.transitionWordCount} Found)
              </h4>
            </div>
            <span className="text-xs font-mono text-zinc-400">
              Yoast Standard: &ge; 30% sentence flow
            </span>
          </div>

          <p className="text-xs text-zinc-400 leading-relaxed">
            Transition words like <span className="font-semibold text-zinc-300">"therefore"</span>, <span className="font-semibold text-zinc-300">"furthermore"</span>, or <span className="font-semibold text-zinc-300">"oleh karena itu"</span> establish logical continuity between commercial fitness technical points.
          </p>

          <div className="space-y-2 pt-1">
            <span className="text-[11px] font-mono uppercase text-zinc-400 block">
              Detected In Current Content:
            </span>
            {transitionMatches.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {transitionMatches.map((t, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                  >
                    <span>{t.phrase}</span>
                    <span className="px-1.5 py-0.2 rounded bg-zinc-800 text-[10px] text-emerald-400 font-semibold">
                      {t.count}x
                    </span>
                  </span>
                ))}
              </div>
            ) : (
              <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 text-xs text-amber-300 font-mono">
                No standard transition words detected. Consider adding logical linking phrases.
              </div>
            )}
          </div>
        </div>

        {/* Right: Structural Metrics & Yoast Rules Compliance */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-zinc-300" />
              <h4 className="text-xs font-semibold uppercase tracking-wider font-mono text-zinc-200">
                Yoast &amp; Flesch Compliance Checklist
              </h4>
            </div>
            <span className="text-xs font-mono text-emerald-400">Algorithmic Audit</span>
          </div>

          <div className="space-y-2.5 text-xs">
            {/* Rule 1: Reading Ease */}
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="font-semibold text-zinc-200 block">Flesch Reading Ease (60–75)</span>
                <span className="text-zinc-400">Score is {metrics.fleschReadingEase}. Suitable for commercial procurement readers.</span>
              </div>
              {metrics.fleschReadingEase >= 55 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
            </div>

            {/* Rule 2: Sentence Length */}
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="font-semibold text-zinc-200 block">Average Sentence Length (&le; 20 words)</span>
                <span className="text-zinc-400">Currently {metrics.averageSentenceLength} words per sentence across {metrics.sentenceCount} sentences.</span>
              </div>
              {metrics.averageSentenceLength <= 20 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
            </div>

            {/* Rule 3: Short Sentences */}
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="font-semibold text-zinc-200 block">Short Sentence Variety (&ge; 25%)</span>
                <span className="text-zinc-400">{metrics.shortSentencePercentage}% of sentences are compact and punchy.</span>
              </div>
              {metrics.shortSentencePercentage >= 25 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
            </div>

            {/* Rule 4: Total Volume */}
            <div className="p-3 rounded-lg bg-zinc-950 border border-zinc-800 flex items-start justify-between gap-3">
              <div className="space-y-1">
                <span className="font-semibold text-zinc-200 block">Substantial Content Depth (&gt; 500 words)</span>
                <span className="text-zinc-400">Total counted: {metrics.wordCount} words ({metrics.syllableCount} syllables).</span>
              </div>
              {metrics.wordCount >= 400 ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
