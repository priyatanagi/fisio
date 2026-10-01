import type { AgentEvent } from '../types/agentEvents';

const RUN_TTL_MS = 10 * 60 * 1000;
const MAX_EVENTS_PER_RUN = 400;

interface RunBuffer {
  events: AgentEvent[];
  cursor: number;
  lastTouched: number;
}

const runs = new Map<string, RunBuffer>();

function bufferFor(runId: string): RunBuffer {
  const existing = runs.get(runId);
  if (existing) {
    existing.lastTouched = Date.now();
    return existing;
  }
  const created: RunBuffer = { events: [], cursor: 0, lastTouched: Date.now() };
  runs.set(runId, created);
  return created;
}

/** Drops runs nobody is polling any more so a long-lived server cannot grow unbounded. */
function prune(now: number): void {
  for (const [runId, buffer] of runs) {
    if (now - buffer.lastTouched > RUN_TTL_MS) runs.delete(runId);
  }
}

export type PublishInput = Pick<AgentEvent, 'runId' | 'type' | 'role'> &
  Partial<Omit<AgentEvent, 'id' | 'at' | 'runId' | 'type' | 'role'>>;

export function publishAgentEvent(input: PublishInput): AgentEvent {
  const buffer = bufferFor(input.runId);
  const event: AgentEvent = {
    ...input,
    id: ++buffer.cursor,
    at: Date.now(),
  };
  buffer.events.push(event);
  if (buffer.events.length > MAX_EVENTS_PER_RUN) {
    buffer.events.splice(0, buffer.events.length - MAX_EVENTS_PER_RUN);
  }
  prune(event.at);
  return event;
}

export function readAgentEvents(
  runId: string,
  since: number
): { events: AgentEvent[]; cursor: number } {
  const buffer = runs.get(runId);
  if (!buffer) return { events: [], cursor: since };
  buffer.lastTouched = Date.now();
  return {
    events: buffer.events.filter((event) => event.id > since),
    cursor: buffer.cursor,
  };
}

export function clearAgentEvents(runId: string): void {
  runs.delete(runId);
}

/** Test hook. */
export function resetAgentEventBus(): void {
  runs.clear();
}
