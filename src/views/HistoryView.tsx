import React from 'react';
import { HistoryTable } from '../components/HistoryTable';
import { UnfinishedRuns } from '../components/UnfinishedRuns';
import type { GeneratedArticle } from '../types/article';
import type { RunRecord } from '../types/run';

interface HistoryViewProps {
  articles: GeneratedArticle[];
  runs: RunRecord[];
  isLoaded: boolean;
  onDelete: (id: string) => void;
  onOpen: (article: GeneratedArticle) => void;
  onRetryRun: (run: RunRecord) => void;
  onForgetRun: (runId: string) => void;
}

export const HistoryView: React.FC<HistoryViewProps> = ({
  articles,
  runs,
  isLoaded,
  onDelete,
  onOpen,
  onRetryRun,
  onForgetRun,
}) => (
  <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto space-y-4">
    <div>
      <h2 className="text-sm font-semibold text-zinc-100">Generation history</h2>
      <p className="text-[11px] text-zinc-400">
        Stored in IndexedDB, one record per article, plus a journal of every run that was attempted.
      </p>
    </div>
    {!isLoaded ? (
      <div className="py-16 text-center text-xs text-zinc-500">Loading...</div>
    ) : (
      <>
        <UnfinishedRuns runs={runs} onRetry={onRetryRun} onForget={onForgetRun} />
        <HistoryTable articles={articles} onOpen={onOpen} onDelete={onDelete} />
      </>
    )}
  </div>
);