import React, { useState, useMemo } from 'react';
import { SeoMetadata } from '../types/article';
import { evaluateSeoChecklist, SeoCheckItem } from '../utils/seoChecklist';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  Search,
  Filter,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface SeoChecklistPanelProps {
  htmlContent: string;
  metadata: SeoMetadata;
  focusKeyphraseInput?: string;
}

export const SeoChecklistPanel: React.FC<SeoChecklistPanelProps> = ({
  htmlContent,
  metadata,
  focusKeyphraseInput,
}) => {
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const report = useMemo(() => {
    return evaluateSeoChecklist(htmlContent, metadata, focusKeyphraseInput);
  }, [htmlContent, metadata, focusKeyphraseInput]);

  const filteredItems = useMemo(() => {
    if (filterCategory === 'all') return report.items;
    return report.items.filter((item) => item.category === filterCategory);
  }, [report.items, filterCategory]);

  return (
    <div className="bg-zinc-950 p-4 sm:p-6 space-y-6 text-zinc-200">
      {/* Overview & Progress Bar Banner */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-zinc-300" />
              <h3 className="font-semibold text-zinc-100 text-sm">
                Yoast & Commercial SEO Compliance Score
              </h3>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              Audits heading hierarchy, paragraph sentence rules, keyword density, and E-E-A-T stats.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <span className="text-xl font-bold font-mono text-zinc-100">{report.score}%</span>
              <span className="text-xs text-zinc-400 font-mono block">
                {report.passedCount}/{report.totalCount} Passed
              </span>
            </div>
            <div className="w-12 h-12 rounded-full border-4 border-zinc-800 flex items-center justify-center font-mono font-bold text-xs bg-zinc-950">
              <span
                className={
                  report.score >= 85
                    ? 'text-emerald-400'
                    : report.score >= 70
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }
              >
                {report.score}%
              </span>
            </div>
          </div>
        </div>

        {/* Linear Progress Bar */}
        <div className="w-full bg-zinc-800 rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full transition-all duration-500 rounded-full ${
              report.score >= 85
                ? 'bg-emerald-400'
                : report.score >= 70
                ? 'bg-amber-400'
                : 'bg-rose-500'
            }`}
            style={{ width: `${report.score}%` }}
          />
        </div>

        {/* Quick Metrics Strip */}
        <div className="pt-2 flex flex-wrap items-center justify-between text-xs font-mono text-zinc-400 border-t border-zinc-800/80 gap-2">
          <div>
            <span>Target Keyphrase: </span>
            <span className="text-zinc-200 font-semibold font-mono">
              "{metadata.focusKeyphrase || focusKeyphraseInput || 'Not specified'}"
            </span>
          </div>

          <div>
            <span>Density: </span>
            <span
              className={`font-semibold ${
                report.keyphraseDensityPercent >= 0.5 && report.keyphraseDensityPercent <= 2.0
                  ? 'text-emerald-400'
                  : 'text-amber-400'
              }`}
            >
              {report.keyphraseDensityPercent}% ({report.keyphraseOccurrences}x)
            </span>
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-zinc-800 pb-3">
        {[
          { id: 'all', label: `All Checks (${report.totalCount})` },
          { id: 'metadata', label: 'Meta Headers (6)' },
          { id: 'content', label: 'Keyphrase Flow (3)' },
          { id: 'structure', label: 'Structure & Paragraphs (4)' },
          { id: 'rich_media', label: 'Rich Media & EEAT (4)' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilterCategory(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterCategory === tab.id
                ? 'bg-zinc-800 text-zinc-100 border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Checklist Items List */}
      <div className="space-y-2.5">
        {filteredItems.map((item) => (
          <div
            key={item.id}
            className={`border rounded-xl p-3.5 transition-all ${
              item.passed
                ? 'bg-zinc-900/40 border-zinc-800/80 hover:border-zinc-700'
                : 'bg-zinc-900/80 border-rose-900/40 hover:border-rose-800/60'
            }`}
          >
            <div
              className="flex items-start justify-between gap-3 cursor-pointer select-none"
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              <div className="flex items-start gap-3">
                {item.passed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-zinc-200">{item.title}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-zinc-950 border border-zinc-800 text-zinc-400 uppercase">
                      {item.category.replace('_', ' ')}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-400 mt-0.5">{item.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {item.value && (
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                      item.passed
                        ? 'bg-zinc-950 text-zinc-300 border border-zinc-800'
                        : 'bg-rose-950/60 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {item.value}
                  </span>
                )}
                {expandedId === item.id ? (
                  <ChevronUp className="w-3.5 h-3.5 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                )}
              </div>
            </div>

            {/* Expandable Recommendation Details */}
            {expandedId === item.id && item.recommendation && (
              <div className="mt-3 pt-2.5 border-t border-zinc-800 text-xs text-amber-300/90 flex items-start gap-2 bg-amber-950/20 p-2.5 rounded-lg border border-amber-900/30">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold text-amber-300">Action Required: </span>
                  <span>{item.recommendation}</span>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
