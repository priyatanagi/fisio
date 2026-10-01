import type { AgentEvent } from '../types/agentEvents';

export interface EventPage {
  events: AgentEvent[];
  cursor: number;
}

export async function fetchAgentEvents(
  runId: string,
  since: number,
  signal?: AbortSignal
): Promise<EventPage> {
  const response = await fetch(
    `/api/events?runId=${encodeURIComponent(runId)}&since=${since}`,
    { signal }
  );
  if (!response.ok) return { events: [], cursor: since };
  const payload = await response.json().catch(() => ({}));
  return {
    events: Array.isArray(payload.events) ? payload.events : [],
    cursor: typeof payload.cursor === 'number' ? payload.cursor : since,
  };
}

export interface PollingOptions {
  runId: string;
  onEvents: (events: AgentEvent[]) => void;
  /** Stops the loop; a final flush still runs so trailing events are not lost. */
  signal?: AbortSignal;
  intervalMs?: number;
  since?: number;
}

/**
 * Pulls the server's buffered activity for a run. Polling (rather than a socket)
 * keeps the existing plain-fetch pipeline intact while still surfacing events
 * while a provider call is in flight.
 */
export function startAgentEventPolling(options: PollingOptions): () => void {
  const { runId, onEvents, signal } = options;
  const intervalMs = options.intervalMs ?? 400;
  let cursor = options.since ?? 0;
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const stop = () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
  signal?.addEventListener('abort', stop);

  const tick = async () => {
    if (stopped) return;
    try {
      const page = await fetchAgentEvents(runId, cursor, signal);
      if (page.events.length > 0) {
        cursor = page.cursor;
        onEvents(page.events);
      } else if (page.cursor > cursor) {
        cursor = page.cursor;
      }
    } catch {
      // A dropped poll is not an error worth surfacing; the next tick retries.
    }
    if (!stopped && !signal?.aborted) {
      timer = setTimeout(tick, intervalMs);
    }
  };

  void tick();
  return stop;
}
