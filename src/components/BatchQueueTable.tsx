import React from 'react';
import { Play, Pause, X, RotateCcw, Download } from 'lucide-react';
import type { BatchJob, BatchRow } from '../pipeline/useBatchQueue';
import type { GeneratedArticle } from '../types/article';

interface BatchQueueTableProps {
  job: BatchJob;
  articles: GeneratedArticle[];
  onStart: () => void;
  onPause: () => void;
  onCancel: () => void;
  onRetry: (rowId: string) => void;
  onConcurrency: (value: number) => void;
  onExportRow: (row: BatchRow) => void;
  onExportAll: () => void;
}

const STATUS_STYLE: Record<BatchRow['status'], string> = {
  pending: 'text-zinc-500',
  running: 'text-zinc-200',
  judging: 'text-sky-300',
  impowering: 'text-sky-300',
  creating: 'text-sky-300',
  reviewing: 'text-violet-300',
  designing: 'text-emerald-300',
  done: 'text-emerald-400',
  failed: 'text-rose-400',
  needs_attention: 'text-amber-400',
};

export const BatchQueueTable: React.FC<BatchQueueTableProps> = ({
  job,
  articles,
  onStart,
  onPause,
  onCancel,
  onRetry,
  onConcurrency,
  onExportRow,
  onExportAll,
}) => {
  const counts = job.rows.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = (acc[row.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={onStart}
          disabled={job.isPaused}
          className="px-3 py-2 rounded-lg bg-zinc-100 text-zinc-950 hover:bg-white disabled:opacity-40 disabled:hover:bg-zinc-100 text-xs font-semibold flex items-center gap-1.5"
        >
          <Play className="w-3.5 h-3.5" />
          Generate All
        </button>
        <button
          onClick={onPause}
          className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs flex items-center gap-1.5"
        >
          <Pause className="w-3.5 h-3.5" />
          Pause
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-400 text-xs flex items-center gap-1.5"
        >
          <X className="w-3.5 h-3.5" />
          Cancel Job
        </button>
        <button
          onClick={onExportAll}
          disabled={articles.length === 0}
          className="px-3 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs flex items-center gap-1.5 disabled:opacity-40"
        >
          <Download className="w-3.5 h-3.5" />
          Download Batch ZIP
        </button>

        <div className="ml-auto flex items-center gap-2">
          <label className="text-[11px] text-zinc-400">Concurrency</label>
          <select
            value={job.concurrency}
            onChange={(e) => onConcurrency(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-800 rounded-lg p-1.5 text-[11px] text-zinc-200 outline-none"
          >
            <option value={1}>1</option>
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap text-[10px] font-mono text-zinc-500">
        {Object.entries(counts).map(([status, count]) => (
          <span key={status}>
            {status}: <span className={STATUS_STYLE[status as BatchRow['status']]}>{count}</span>
          </span>
        ))}
      </div>

      <div className="border border-zinc-800 rounded-xl overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium w-10">#</th>
              <th className="px-3 py-2 font-medium">Topic</th>
              <th className="px-3 py-2 font-medium w-36">Status</th>
              <th className="px-3 py-2 font-medium">Detail</th>
              <th className="px-3 py-2 font-medium w-28" />
            </tr>
          </thead>
          <tbody>
            {job.rows.map((row) => (
              <tr key={row.rowId} className="border-t border-zinc-800">
                <td className="px-3 py-2 font-mono text-[11px] text-zinc-600">{row.index + 1}</td>
                <td className="px-3 py-2 text-zinc-200 max-w-xs truncate">{row.seedTopic}</td>
                <td className={`px-3 py-2 font-mono text-[11px] ${STATUS_STYLE[row.status]}`}>
                  {row.status}
                </td>
                <td className="px-3 py-2 text-[11px] text-zinc-500 max-w-md truncate">
                  {row.error ?? row.stageMessage ?? ''}
                  {row.status === 'needs_attention' && row.reviewReport && (
                    <span className="ml-2 text-amber-500">
                      {row.reviewReport.issues.length} issue
                      {row.reviewReport.issues.length === 1 ? '' : 's'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    {(row.status === 'failed' || row.status === 'needs_attention') && (
                      <button
                        onClick={() => onRetry(row.rowId)}
                        className="p-1 text-zinc-400 hover:text-zinc-100"
                        title="Retry this row"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {row.status === 'done' && (
                      <button
                        onClick={() => onExportRow(row)}
                        className="p-1 text-zinc-400 hover:text-zinc-100"
                        title="Download this article"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
