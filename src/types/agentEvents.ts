import type { ProviderType } from './provider';

export type AgentEventType =
  | 'call-start'
  | 'attempt'
  | 'model-fallback'
  | 'repair'
  | 'chunk'
  | 'completed'
  | 'failed';

export interface TokenUsage {
  input?: number;
  output?: number;
}

/**
 * One observable step of a background agent call. These are published by the
 * server while the provider request is in flight and polled back by the UI, so
 * progress reflects real work instead of an invented percentage.
 */
export interface AgentEvent {
  /** Monotonic per-run cursor used for polling. */
  id: number;
  runId: string;
  /** One provider call; concurrent calls (e.g. the Designer fan-out) stay separate. */
  callId?: string;
  /** Optional sub-grouping within a run, e.g. a batch row id. */
  label?: string;
  at: number;
  type: AgentEventType;
  role: string;
  provider?: ProviderType;
  model?: string;
  /** The configured model, when a fallback answered instead. */
  requestedModel?: string;
  attempt?: number;
  totalAttempts?: number;
  /** Provider requests made before this call succeeded. */
  attempts?: number;
  durationMs?: number;
  promptChars?: number;
  outputChars?: number;
  usage?: TokenUsage;
  message?: string;
}
