import { describe, it, expect, vi, afterEach } from 'vitest';
import { startAgentEventPolling } from './agentEvents';
import type { AgentEvent } from '../types/agentEvents';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function makeEvent(id: number, role = 'creator'): AgentEvent {
  return { id, runId: 'run_1', at: Date.now(), type: 'call-start', role, model: 'gpt-4o' };
}

describe('startAgentEventPolling', () => {
  it('delivers only new events and advances the cursor', async () => {
    let page = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        page += 1;
        const events = page === 1 ? [makeEvent(1), makeEvent(2)] : page === 2 ? [makeEvent(3)] : [];
        return { ok: true, json: async () => ({ ok: true, events, cursor: page * 3 }) };
      })
    );

    const seen: AgentEvent[] = [];
    const stop = startAgentEventPolling({
      runId: 'run_1',
      onEvents: (batch) => seen.push(...batch),
      intervalMs: 5,
    });

    await vi.waitFor(() => expect(seen).toHaveLength(3));
    stop();
    const count = seen.length;
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(seen).toHaveLength(count);
  });

  it('stops quietly when the run is aborted', async () => {
    const fetchSpy = vi.fn(async () => ({ ok: true, json: async () => ({ events: [], cursor: 0 }) }));
    vi.stubGlobal('fetch', fetchSpy);

    const controller = new AbortController();
    startAgentEventPolling({ runId: 'run_1', onEvents: () => {}, signal: controller.signal, intervalMs: 5 });
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    controller.abort();
    const calls = fetchSpy.mock.calls.length;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fetchSpy).toHaveBeenCalledTimes(calls);
  });
});
