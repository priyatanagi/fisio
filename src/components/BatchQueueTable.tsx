import React, { useState } from 'react';
import { Play, Pause, X, RotateCcw, Download, ChevronDown, ChevronRight } from 'lucide-react';
import type { BatchJob, BatchRow } from '../pipeline/useBatchQueue';
import type { GeneratedArticle } from '../types/article';
import type { AgentCall } from '../pipeline/agentActivity';
import { activityTotals, formatDuration } from '../pipeline/agentActivity';
import { useTicker } from '../pipeline/useAgentEvents';
import { AgentCallRow } from './ActivityPanel';

interface BatchQueueTableProps {
  job: BatchJob;
  articles: GeneratedArticle[];
  allCalls: AgentCall[];
  callsByRow: Record<string, AgentCall[]>;
  live: boolean;
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

interface RowPairProps {
  row: BatchRow;
  rowCalls: AgentCall[];
  activeCall?: AgentCall;
  now: number;
  origin: number;
  /** The queue is not running, so an unanswered call for this row is abandoned. */
  stopped: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onRetry: (rowId: string) => void;
  onExportRow: (row: BatchRow) => void;
}

const RowPair: React.FC<RowPairProps> = ({
  row,
  rowCalls,
  activeCall,
  now,
  origin,
  stopped,
  isOpen,
  onToggle,
  onRetry,
  onExportRow,
}) => (
  <>
    <tr className="border-t border-zinc-800">
      <td className="px-3 py-2 font-mono text-[11px] text-zinc-600">{row.index + 1}</td>
      <td className="px-3 py-2 text-zinc-200 max-w-xs truncate">{row.seedTopic}</td>
      <td className={`px-3 py-2 font-mono text-[11px] ${STATUS_STYLE[row.status]}`}>{row.status}</td>
      <td className="px-3 py-2 text-[11px] text-zinc-500 max-w-md">
        {activeCall && !stopped ? (
          <span className="flex items-center gap-2 font-mono truncate">
            <span className="text-sky-300 uppercase text-[10px]">{activeCall.role}</span>
            <span className="text-zinc-300 truncate">
              {activeCall.answeredBy ?? activeCall.requestedModel}
            </span>
            <span className="text-zinc-600">
              {formatDuration(Math.max(0, now - activeCall.startedAt))}
            </span>
            {activeCall.attempts > 1 && (
              <span className="text-amber-400">{activeCall.attempts} tries</span>
            )}
          </span>
        ) : (
          <span className="truncate block">
            {row.error ?? row.stageMessage ?? ''}
            {row.status === 'needs_attention' && row.reviewReport && (
              <span className="ml-2 text-amber-500">
                {row.reviewReport.issues.length} issue
                {row.reviewReport.issues.length === 1 ? '' : 's'}
              </span>
            )}
          </span>
        )}
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1 justify-end items-center">
          {rowCalls.length > 0 && (
            <button
              onClick={onToggle}
              className="p-1 text-zinc-500 hover:text-zinc-100"
              title={isOpen ? 'Hide provider calls' : `Show ${rowCalls.length} provider calls`}
            >
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          )}
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
    {isOpen && (
      <tr className="bg-zinc-950/60 border-t border-zinc-900">
        <td colSpan={5} className="px-4 py-2">
          {rowCalls.map((call) => (
            <AgentCallRow
              key={call.callId}
              call={call}
              origin={origin}
              now={now}
              compact
              stopped={stopped}
            />
          ))}
        </td>
      </tr>
    )}
  </>
);

export const BatchQueueTable: React.FC<BatchQueueTableProps> = ({
  job,
  articles,
  allCalls,
  callsByRow,
  live,
  onStart,
  onPause,
  onCancel,
  onRetry,
  onConcurrency,
  onExportRow,
  onExportAll,
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const now = useTicker(live);
  const totals = activityTotals(allCalls, now);

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
        {allCalls.length > 0 && (
          <span className="ml-auto flex gap-3">
            <span title="Provider requests the server actually issued">
              provider calls:{' '}
              <span className="text-zinc-300">{totals.providerRequests}</span>
            </span>
            <span title="Tokens reported by the providers">
              tokens: <span className="text-zinc-300">{totals.tokensIn || 0}/{totals.tokensOut || 0}</span>
            </span>
            <span>
              elapsed: <span className="text-zinc-300">{formatDuration(totals.wallMs)}</span>
            </span>
            {(totals.fallbacks > 0 || totals.repairs > 0) && (
              <span className="text-amber-400">
                {totals.fallbacks} fallback{totals.fallbacks === 1 ? '' : 's'} · {totals.repairs}{' '}
                repair{totals.repairs === 1 ? '' : 's'}
              </span>
            )}
          </span>
        )}
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
            {job.rows.map((row) => {
              const rowCalls = callsByRow[row.rowId] ?? [];
              const activeCall = [...rowCalls].reverse().find((call) => call.status === 'running');
              const origin = rowCalls[0]?.startedAt ?? now;
              const isOpen = Boolean(expanded[row.rowId]);

              return (
                <RowPair
                  key={row.rowId}
                  row={row}
                  rowCalls={rowCalls}
                  activeCall={activeCall}
                  now={now}
                  origin={origin}
                  stopped={!live}
                  isOpen={isOpen}
                  onToggle={() => setExpanded((prev) => ({ ...prev, [row.rowId]: !isOpen }))}
                  onRetry={onRetry}
                  onExportRow={onExportRow}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
