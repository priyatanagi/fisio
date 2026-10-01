import React from 'react';
import { HistoryTable } from '../components/HistoryTable';
import type { GeneratedArticle } from '../types/article';

interface HistoryViewProps {
  articles: GeneratedArticle[];
  isLoaded: boolean;
  onDelete: (id: string) => void;
  onOpen: (article: GeneratedArticle) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  articles,
  isLoaded,
  onDelete,
  onOpen,
}) => (
  <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-4">
    <div>
      <h2 className="text-sm font-semibold text-zinc-100">Generation history</h2>
      <p className="text-[11px] text-zinc-400">
        Stored in IndexedDB, one record per article. Safe for hundreds of batch results.
      </p>
    </div>
    {!isLoaded ? (
      <div className="py-16 text-center text-xs text-zinc-500">Loading...</div>
    ) : (
      <HistoryTable articles={articles} onOpen={onOpen} onDelete={onDelete} />
    )}
  </div>
);
