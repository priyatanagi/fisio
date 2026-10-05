import React, { useMemo, useState } from 'react';
import { Trash2, ExternalLink } from 'lucide-react';
import type { GeneratedArticle } from '../types/article';

interface HistoryTableProps {
  articles: GeneratedArticle[];
  onOpen: (article: GeneratedArticle) => void;
  onDelete: (id: string) => void;
}

export const HistoryTable: React.FC<HistoryTableProps> = ({ articles, onOpen, onDelete }) => {
  const [query, setQuery] = useState('');
  const [language, setLanguage] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return articles.filter((article) => {
      if (language && article.language !== language) return false;
      if (!q) return true;
      return (
        article.topic.toLowerCase().includes(q) ||
        (article.seoMetadata?.seoTitle ?? '').toLowerCase().includes(q) ||
        (article.focusKeyphrase ?? '').toLowerCase().includes(q)
      );
    });
  }, [articles, query, language]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search topics, titles, keyphrases..."
          className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-100 outline-none focus:border-zinc-500"
        />
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="bg-zinc-950 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 outline-none focus:border-zinc-500"
        >
          <option value="">All languages</option>
          <option value="en">English</option>
          <option value="id">Bahasa Indonesia</option>
        </select>
        <span className="text-[11px] font-mono text-zinc-500">{filtered.length} articles</span>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center text-xs text-zinc-500">
          No articles yet. Generate one, or run a batch.
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-3 py-2 font-medium">Topic</th>
                <th className="px-3 py-2 font-medium">Language</th>
                <th className="px-3 py-2 font-medium">Words</th>
                <th className="px-3 py-2 font-medium">Review</th>
                <th className="px-3 py-2 font-medium">Created</th>
                <th className="px-3 py-2 font-medium w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((article) => (
                <tr
                  key={article.id}
                  className="border-t border-zinc-800 hover:bg-zinc-900/50 transition-colors"
                >
                  <td className="px-3 py-2 text-zinc-200 max-w-md">
                    <div className="truncate">{article.topic}</div>
                    {article.seoMetadata?.seoTitle && (
                      <div className="text-[10px] text-zinc-500 truncate">{article.seoMetadata.seoTitle}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400 uppercase">
                    {article.language}
                  </td>
                  <td className="px-3 py-2 font-mono text-[11px] text-zinc-400">
                    {article.metrics?.wordCount ?? 0}
                  </td>
                  <td className="px-3 py-2">
                    {article.score ? (
                      <span className="flex items-center gap-1">
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                            article.score.passed
                              ? 'bg-emerald-950/50 text-emerald-300'
                              : 'bg-amber-950/50 text-amber-300'
                          }`}
                          title={`Score ${article.score.total}/${article.score.target} across ${article.score.scoredCount} measured checks`}
                        >
                          {article.score.total}
                        </span>
                        {article.belowTarget && (
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-950/50 text-amber-300">
                            below target
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-[10px] text-zinc-600">not scored</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                    {new Date(article.generatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => onOpen(article)}
                        className="p-1 text-zinc-400 hover:text-zinc-100"
                        title="Open in Generate"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete(article.id)}
                        className="p-1 text-zinc-500 hover:text-rose-400"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
