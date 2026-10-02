import React from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import type { RunRecord } from '../types/run';
import { isRetryableRun } from '../types/run';

interface UnfinishedRunsProps {
  runs: RunRecord[];
  onRetry: (run: RunRecord) => void;
  onForget: (runId: string) => void;
}

const STATUS_STYLES: Record<string, string> = {
  failed: 'bg-rose-950/50 text-rose-300',
  interrupted: 'bg-amber-950/50 text-amber-300',
  running: 'bg-sky-950/50 text-sky-300',
};

/**
 * Runs that were attempted but never produced an article. They are journalled
 * separately from articles because there is no article record to show, and
 * losing them silently is exactly the failure this section exists to prevent.
 */
export const UnfinishedRuns: React.FC<UnfinishedRunsProps> = ({ runs, onRetry, onForget }) => {
  const pending = runs.filter((r) => r.status === 'running' || isRetryableRun(r));
  if (pending.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline gap-2">
        <h3 className="text-xs font-semibold text-amber-200">Unfinished runs</h3>
        <p className="text-[11px] text-zinc-400">
          Journalled before the run started, so a failed or interrupted generation is never lost.
        </p>
      </div>
      <div className="border border-amber-900/50 rounded-xl overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-3 py-2 font-medium">Topic</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Last update</th>
              <th className="px-3 py-2 font-medium w-24" />
            </tr>
          </thead>
          <tbody>
            {pending.map((record) => (
              <tr key={record.runId} className="border-t border-zinc-800 hover:bg-zinc-900/50">
                <td className="px-3 py-2 text-zinc-200 max-w-md">
                  <div className="truncate">{record.seedTopic}</div>
                  {record.focusKeyphrase && (
                    <div className="text-[10px] text-zinc-500 font-mono truncate">
                      {record.focusKeyphrase}
                    </div>
                  )}
                  {record.error && (
                    <div className="text-[10px] text-rose-400/80 truncate">{record.error}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      STATUS_STYLES[record.status] ?? 'bg-zinc-800 text-zinc-400'
                    }`}
                  >
                    {record.status}
                  </span>
                </td>
                <td className="px-3 py-2 font-mono text-[10px] text-zinc-500">
                  {new Date(record.updatedAt).toLocaleString()}
                </td>
                <td className="px-3 py-2">
                  <div className="flex gap-1 justify-end">
                    {isRetryableRun(record) && (
                      <button
                        onClick={() => onRetry(record)}
                        className="p-1 text-zinc-400 hover:text-emerald-300"
                        title="Retry this run"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => onForget(record.runId)}
                      className="p-1 text-zinc-500 hover:text-rose-400"
                      title="Remove this record"
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
    </div>
  );
};