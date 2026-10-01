import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentEvent } from '../types/agentEvents';
import { fetchAgentEvents, startAgentEventPolling } from './agentEvents';

const MAX_EVENTS = 300;
/** Trailing events (repair/completed) can land just after the fetch resolves. */
const FINAL_FLUSH_MS = 700;

/**
 * Live activity for one background run. `runId` changes start a fresh feed;
 * when `active` goes false a last flush captures events still in flight.
 */
export function useAgentEvents(runId: string | null, active: boolean): AgentEvent[] {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const cursorRef = useRef(0);

  const append = useCallback((batch: AgentEvent[]) => {
    if (batch.length === 0) return;
    cursorRef.current = Math.max(cursorRef.current, ...batch.map((event) => event.id));
    setEvents((previous) => [...previous, ...batch].slice(-MAX_EVENTS));
  }, []);

  useEffect(() => {
    cursorRef.current = 0;
    setEvents([]);
    if (!runId) return;
    return startAgentEventPolling({ runId, onEvents: append });
  }, [runId, append]);

  useEffect(() => {
    if (active || !runId) return;
    const timer = setTimeout(() => {
      void fetchAgentEvents(runId, cursorRef.current)
        .then((page) => append(page.events))
        .catch(() => {});
    }, FINAL_FLUSH_MS);
    return () => clearTimeout(timer);
  }, [active, runId, append]);

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
