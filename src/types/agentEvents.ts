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

/**
 * An event as emitted by whoever produced it (server stream or browser run),
 * before the consumer stamps it with a cursor and timestamp: the id/at fields
 * are assigned by the client-side event bus on append.
 */
export type PublishInput = Pick<AgentEvent, 'runId' | 'type' | 'role'> &
  Partial<Omit<AgentEvent, 'id' | 'at' | 'runId' | 'type' | 'role'>>;

/** Where emitted events go: an NDJSON line on the server, the local bus in the browser. */
export type EventEmit = (input: PublishInput) => void;
