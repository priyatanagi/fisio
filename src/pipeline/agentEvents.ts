/**
 * Client-side event bus for agent runs. Events arrive from two transports —
 * NDJSON lines streamed inside the /api/run-agent response, and direct emits
 * from Ollama runs executing in this browser — and both append here. Ids are
 * stamped on append, so parallel batch streams that share one runId still get
 * a single, gap-free numbering.
 */
import type { AgentEvent, PublishInput } from '../types/agentEvents';

const MAX_EVENTS_PER_RUN = 400;

interface RunBuffer {
  events: AgentEvent[];
  nextId: number;
}

const runs = new Map<string, RunBuffer>();
const subscribers = new Map<string, Set<(batch: AgentEvent[]) => void>>();

export function publishLocalEvent(input: PublishInput): AgentEvent {
  let buffer = runs.get(input.runId);
  if (!buffer) {
    buffer = { events: [], nextId: 1 };
    runs.set(input.runId, buffer);
  }
  const event: AgentEvent = { ...input, id: buffer.nextId++, at: Date.now() };
  buffer.events.push(event);
  if (buffer.events.length > MAX_EVENTS_PER_RUN) {
    buffer.events.splice(0, buffer.events.length - MAX_EVENTS_PER_RUN);
  }
  const listeners = subscribers.get(input.runId);
  if (listeners && listeners.size > 0) {
    for (const notify of listeners) notify([event]);
  }
  return event;
}

export function getAgentEvents(runId: string): AgentEvent[] {
  return runs.get(runId)?.events.slice() ?? [];
}

/** Receives only events published after subscribing; returns the stop fn. */
export function subscribeAgentEvents(
  runId: string,
  notify: (batch: AgentEvent[]) => void
): () => void {
  let listeners = subscribers.get(runId);
  if (!listeners) {
    listeners = new Set();
    subscribers.set(runId, listeners);
  }
  listeners.add(notify);
  return () => {
    listeners?.delete(notify);
    if (listeners && listeners.size === 0) subscribers.delete(runId);
  };
}

/** Test hook — drops every buffer and subscription. */
export function resetAgentEvents(): void {
  runs.clear();
  subscribers.clear();
}
