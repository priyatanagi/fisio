import { useEffect, useState } from 'react';
import type { AgentEvent } from '../types/agentEvents';
import { subscribeAgentEvents } from './agentEvents';

const MAX_EVENTS = 300;

/**
 * Live activity for one background run, fed by the client event bus. The run
 * itself (server stream or browser Ollama call) publishes into the bus, so
 * this hook only subscribes — no polling, no final flush, and events that
 * arrived before the component mounted stay visible via the bus buffer.
 */
export function useAgentEvents(runId: string | null, active: boolean): AgentEvent[] {
  const [events, setEvents] = useState<AgentEvent[]>([]);

  useEffect(() => {
    setEvents([]);
    if (!runId) return;
    return subscribeAgentEvents(runId, (batch) => {
      setEvents((previous) => [...previous, ...batch].slice(-MAX_EVENTS));
    });
  }, [runId]);

  return events;
}

/** Re-renders on an interval while work is active, so live timers stay honest. */
export function useTicker(active: boolean, intervalMs = 250): number {
  const [stamp, setStamp] = useState(() => Date.now());

  useEffect(() => {
    // Re-stamp on every transition, including going idle, so the last duration
    // freezes at the moment work stops instead of mid-flight.
    setStamp(Date.now());
    if (!active) return;
    const id = setInterval(() => setStamp(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs]);

  // Browsers throttle intervals in background tabs, so an event-driven render
  // must not display a clock that is older than the activity it just received.
  return active ? Math.max(stamp, Date.now()) : stamp;
}
