import React, { useMemo } from 'react';
import { AlertTriangle, Check, Circle, Loader2, Minus, X } from 'lucide-react';
import type { AgentCall, StageTiming } from '../pipeline/agentActivity';
import { activityTotals, formatDuration } from '../pipeline/agentActivity';
import { useTicker } from '../pipeline/useAgentEvents';
import type { PipelineStage } from '../pipeline/stages';

interface ActivityPanelProps {
  expected: { stage: PipelineStage; label: string }[];
  timings: StageTiming[];
  calls: AgentCall[];
  running: boolean;
  stageMessage: string;
  onCancel?: () => void;
}

const STATUS_DOT: Record<RowStatus, string> = {
  running: 'text-sky-300',
  ok: 'text-emerald-400',
  failed: 'text-rose-400',
  stopped: 'text-zinc-600',
};

/** A call that never reported back because the run was cancelled. */
type RowStatus = AgentCall['status'] | 'stopped';

function StatusIcon({ status }: { status: RowStatus }) {
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-300" />;
  if (status === 'failed') return <X className="w-3.5 h-3.5 text-rose-400" />;
  if (status === 'stopped') return <Minus className="w-3.5 h-3.5 text-zinc-600" />;
  return <Check className="w-3.5 h-3.5 text-emerald-400" />;
}

/** One provider call with everything the server reported about it. */
export const AgentCallRow: React.FC<{
  call: AgentCall;
  origin: number;
  now: number;
  compact?: boolean;
  /** The owning run has ended, so an unanswered call is abandoned, not running. */
  stopped?: boolean;
}> = ({ call, origin, now, compact, stopped }) => {
  const status: RowStatus = call.status === 'running' && stopped ? 'stopped' : call.status;
  const elapsed = call.durationMs ?? (call.endedAt ?? 0) - call.startedAt;
  const live = status === 'running' || status === 'stopped' ? now - call.startedAt : 0;
  const fallbackNote =
    call.answeredBy && call.requestedModel && call.answeredBy !== call.requestedModel
      ? `answered by ${call.answeredBy}`
      : null;

  return (
    <div className="border-t border-zinc-800/80 py-1.5">
      <div className="flex items-center gap-2 text-[11px] font-mono">
        <span className="text-zinc-600 w-12 shrink-0">
          +{formatDuration(Math.max(0, call.startedAt - origin))}
        </span>
        <StatusIcon status={status} />
        <span className="uppercase tracking-wide text-zinc-300 w-16 shrink-0">{call.role}</span>
        <span className="text-zinc-500 truncate">
          {(call.provider ?? '?').toUpperCase()} · {call.requestedModel || 'model?'}
          {fallbackNote && <span className="text-amber-400"> {fallbackNote}</span>}
        </span>
        <span className={`ml-auto shrink-0 ${STATUS_DOT[status]}`}>
          {formatDuration(status === 'running' || status === 'stopped' ? live : elapsed)}
        </span>
        <span className="shrink-0 text-zinc-600 w-20 text-right">
          {status === 'stopped'
            ? 'cancelled'
            : call.usage
              ? `${call.usage.input ?? '?'}/${call.usage.output ?? '?'} tok`
              : call.attempts > 1
                ? `${call.attempts} tries`
                : ''}
        </span>
      </div>
      {!compact && call.notes.length > 0 && (
        <ul className="mt-1 ml-14 space-y-0.5">
          {call.notes.map((note, index) => (
            <li
              key={`${note.at}-${index}`}
              className={`text-[10px] font-mono leading-snug ${
                note.level === 'error'
                  ? 'text-rose-400'
                  : note.level === 'warn'
                    ? 'text-amber-400/90'
                    : 'text-zinc-500'
              }`}
            >
              {note.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export const ActivityPanel: React.FC<ActivityPanelProps> = ({
  expected,
  timings,
  calls,
  running,
  stageMessage,
  onCancel,
}) => {
  // A ticking clock only while work is in flight; every number shown is real.
  const now = useTicker(running);
  const currentStage = timings[timings.length - 1]?.stage;

  const origin = timings[0]?.startedAt ?? calls[0]?.startedAt ?? now;
  const totals = useMemo(() => activityTotals(calls, now), [calls, now]);
  const activeIndex = expected.findIndex((item) => item.stage === currentStage);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <h3 className="text-xs font-semibold text-zinc-200 flex items-center gap-2">
          {running ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-300" />
          ) : (
            <Circle className="w-2 h-2 fill-emerald-400 text-emerald-400" />
          )}
          Live pipeline activity
        </h3>
        <span className="text-[11px] text-zinc-400 font-mono truncate flex-1 min-w-[12rem]">
          {stageMessage || (running ? 'Working' : 'Idle')}
        </span>
        <div className="flex items-center gap-3 text-[10px] font-mono text-zinc-500">
          <span title="Wall-clock time for this run">
            elapsed <span className="text-zinc-300">{formatDuration(totals.wallMs)}</span>
          </span>
          <span title="Provider calls issued by the server">
            provider calls <span className="text-zinc-300">{totals.providerRequests}</span>
          </span>
          <span title="Tokens reported by the providers">
            tokens{' '}
            <span className="text-zinc-300">
              {totals.tokensIn || '-'}/{totals.tokensOut || '-'}
            </span>
          </span>
          {(totals.fallbacks > 0 || totals.repairs > 0) && (
            <span className="text-amber-400 flex items-center gap-1" title="Server had to retry or switch model">
              <AlertTriangle className="w-3 h-3" />
              {totals.fallbacks} fallback{totals.fallbacks === 1 ? '' : 's'}
              {totals.repairs > 0 && `, ${totals.repairs} repair${totals.repairs === 1 ? '' : 's'}`}
            </span>
          )}
        </div>
        {running && onCancel && (
          <button
            onClick={onCancel}
            className="px-2 py-1 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-600 text-[10px] font-mono"
          >
            Cancel
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {expected.map((item, index) => {
          const timing = timings.find((entry) => entry.stage === item.stage);
          const done = Boolean(timing?.endedAt) || index < activeIndex;
          const active = running && item.stage === currentStage;
          const duration = timing
            ? (timing.endedAt ?? (active ? now : 0)) - timing.startedAt
            : 0;
          return (
            <span
              key={item.stage}
              className={`px-2 py-1 rounded-md border text-[10px] font-mono flex items-center gap-1.5 ${
                active
                  ? 'border-sky-500/60 text-sky-200 bg-sky-950/40'
                  : done
                    ? 'border-emerald-800/60 text-emerald-300 bg-emerald-950/20'
                    : 'border-zinc-800 text-zinc-600'
              }`}
            >
              {done && <Check className="w-3 h-3" />}
              {active && <Loader2 className="w-3 h-3 animate-spin" />}
              {item.label}
              {timing && (
                <span className="opacity-70">{formatDuration(Math.max(0, duration))}</span>
              )}
            </span>
          );
        })}
      </div>

      <div className="max-h-64 overflow-y-auto pr-1">
        {calls.length === 0 ? (
          <p className="text-[11px] text-zinc-600 font-mono py-2">
            Waiting for the server to start the first provider call...
          </p>
        ) : (
          calls.map((call) => (
            <AgentCallRow key={call.callId} call={call} origin={origin} now={now} stopped={!running} />
          ))
        )}
      </div>
    </div>
  );
};
