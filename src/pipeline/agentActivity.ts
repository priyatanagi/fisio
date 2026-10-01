import type { AgentEvent, TokenUsage } from '../types/agentEvents';
import type { ProviderType } from '../types/provider';
import type { PipelineConfig, PipelineStage } from './stages';

export interface AgentNote {
  at: number;
  text: string;
  level: 'info' | 'warn' | 'error';
}

export interface AgentCall {
  callId: string;
  role: string;
  label?: string;
  provider?: ProviderType;
  requestedModel: string;
  answeredBy?: string;
  status: 'running' | 'ok' | 'failed';
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  /** Provider requests actually issued for this call, including retries. */
  attempts: number;
  fallbacks: number;
  repairs: number;
  usage?: TokenUsage;
  promptChars?: number;
  outputChars?: number;
  notes: AgentNote[];
}

export interface ActivityTotals {
  calls: number;
  running: number;
  providerRequests: number;
  tokensIn: number;
  tokensOut: number;
  fallbacks: number;
  repairs: number;
  wallMs: number;
}

const MAX_NOTES_PER_CALL = 6;

function attemptNote(event: AgentEvent): string {
  const tokens = event.usage
    ? `${event.usage.input ?? '?'}→${event.usage.output ?? '?'} tok`
    : null;
  return [
    `${event.model ?? 'model'}${event.attempt && event.attempt > 1 ? ` try ${event.attempt}` : ''}`,
    event.durationMs != null ? `${(event.durationMs / 1000).toFixed(1)}s` : null,
    event.promptChars != null ? `${event.promptChars}p` : null,
    tokens,
    event.message && event.message !== 'answered' ? event.message : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

function noteFor(event: AgentEvent): AgentNote | null {
  switch (event.type) {
    case 'attempt': {
      const troubled = Boolean(event.message) && event.message !== 'answered';
      return { at: event.at, text: attemptNote(event), level: troubled ? 'warn' : 'info' };
    }
    case 'model-fallback':
      return { at: event.at, text: event.message ?? 'model fallback', level: 'warn' };
    case 'repair':
      return { at: event.at, text: event.message ?? 'output failed validation, repairing', level: 'warn' };
    case 'failed':
      return { at: event.at, text: event.message ?? 'call failed', level: 'error' };
    default:
      return null;
  }
}

function pushNote(call: AgentCall, note: AgentNote): void {
  call.notes.push(note);
  if (call.notes.length > MAX_NOTES_PER_CALL) {
    call.notes.splice(0, call.notes.length - MAX_NOTES_PER_CALL);
  }
}

/**
 * Rebuilds one call record per provider request group, so the UI can show what
 * the server really did (which model answered, how many tries, token usage)
 * rather than a generic loading state.
 */
export function groupAgentCalls(events: AgentEvent[]): AgentCall[] {
  const calls = new Map<string, AgentCall>();
  const order: string[] = [];

  for (const event of events) {
    const key = event.callId ?? `${event.role}|${event.label ?? ''}|open`;
    let call = calls.get(key);

    if (!call) {
      call = {
        callId: key,
        role: event.role,
        label: event.label,
        provider: event.provider,
        requestedModel: event.model ?? event.requestedModel ?? '',
        status: 'running',
        startedAt: event.at,
        attempts: 0,
        fallbacks: 0,
        repairs: 0,
        notes: [],
      };
      calls.set(key, call);
      order.push(key);
    }

    if (event.provider) call.provider = event.provider;
    if (event.type === 'call-start') {
      call.requestedModel = event.requestedModel ?? event.model ?? call.requestedModel;
    }
    if (event.type === 'attempt') {
      call.attempts += 1;
      if (event.promptChars != null) call.promptChars = event.promptChars;
    }
    if (event.type === 'model-fallback') call.fallbacks += 1;
    if (event.type === 'repair') call.repairs += 1;

    if (event.type === 'completed') {
      call.status = 'ok';
      call.answeredBy = event.model;
      call.durationMs = event.durationMs;
      call.usage = event.usage;
      call.outputChars = event.outputChars;
      call.endedAt = event.at;
      if (event.attempts != null) call.attempts = event.attempts;
    }
    if (event.type === 'failed') {
      call.status = 'failed';
      call.durationMs = event.durationMs;
      call.endedAt = event.at;
    }

    const note = noteFor(event);
    if (note) pushNote(call, note);
  }

  return order.map((key) => calls.get(key)!);
}

export function activityTotals(calls: AgentCall[], now: number): ActivityTotals {
  let providerRequests = 0;
  let tokensIn = 0;
  let tokensOut = 0;
  let running = 0;
  let fallbacks = 0;
  let repairs = 0;
  let earliest = Infinity;

  for (const call of calls) {
    providerRequests += Math.max(call.attempts, call.status === 'running' ? 1 : 0);
    tokensIn += call.usage?.input ?? 0;
    tokensOut += call.usage?.output ?? 0;
    fallbacks += call.fallbacks;
    repairs += call.repairs;
    if (call.status === 'running') running += 1;
    earliest = Math.min(earliest, call.startedAt);
  }

  return {
    calls: calls.length,
    running,
    providerRequests,
    tokensIn,
    tokensOut,
    fallbacks,
    repairs,
    wallMs: calls.length > 0 && Number.isFinite(earliest) ? Math.max(0, now - earliest) : 0,
  };
}

export interface StageTiming {
  stage: PipelineStage;
  message: string;
  startedAt: number;
  endedAt?: number;
}

/** Closes the current stage and opens the next one, using real clock time. */
export function appendStage(
  timings: StageTiming[],
  stage: PipelineStage,
  message: string,
  now: number
): StageTiming[] {
  const last = timings[timings.length - 1];
  if (!last) return [{ stage, message, startedAt: now }];
  if (last.stage === stage && !last.endedAt) {
    return [...timings.slice(0, -1), { ...last, message }];
  }
  if (!last.endedAt) {
    return [
      ...timings.slice(0, -1),
      { ...last, endedAt: now },
      { stage, message, startedAt: now },
    ];
  }
  return [...timings, { stage, message, startedAt: now }];
}

export function closeStages(timings: StageTiming[], now: number): StageTiming[] {
  const last = timings[timings.length - 1];
  if (!last || last.endedAt) return timings;
  return [...timings.slice(0, -1), { ...last, endedAt: now }];
}

const STAGE_LABEL: Record<string, string> = {
  judging: 'Judge',
  impowering: 'Brief',
  creating: 'Write',
  reviewing: 'Audit',
  designing: 'Render',
};

export function expectedStages(config: PipelineConfig): { stage: PipelineStage; label: string }[] {
  const stages: { stage: PipelineStage; label: string }[] = [];
  if (config.judge) stages.push({ stage: 'judging', label: STAGE_LABEL.judging });
  if (config.impower !== 'off') stages.push({ stage: 'impowering', label: STAGE_LABEL.impowering });
  stages.push({ stage: 'creating', label: STAGE_LABEL.creating });
  if (config.reviewer !== 'off') stages.push({ stage: 'reviewing', label: STAGE_LABEL.reviewing });
  stages.push({ stage: 'designing', label: STAGE_LABEL.designing });
  return stages;
}

export function stageLabel(stage: PipelineStage): string {
  return STAGE_LABEL[stage] ?? stage;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0.0s';
  if (ms < 1000) return `${ms}ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)}s`;
}
