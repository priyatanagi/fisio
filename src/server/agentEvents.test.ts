import { describe, it, expect, beforeEach } from 'vitest';
import {
  clearAgentEvents,
  publishAgentEvent,
  readAgentEvents,
  resetAgentEventBus,
} from './agentEvents';

beforeEach(() => resetAgentEventBus());

describe('agent event bus', () => {
  it('numbers events per run so a poller can ask for only what is new', () => {
    publishAgentEvent({ runId: 'job_1', role: 'creator', type: 'call-start', model: 'gpt-4o' });
    publishAgentEvent({ runId: 'job_1', role: 'creator', type: 'completed', model: 'gpt-4o' });
    const first = readAgentEvents('job_1', 0);
    expect(first.events.map((event) => event.id)).toEqual([1, 2]);
    expect(first.cursor).toBe(2);
    expect(readAgentEvents('job_1', 2).events).toHaveLength(0);
    expect(readAgentEvents('job_1', 1).events.map((event) => event.id)).toEqual([2]);
  });

  it('keeps runs apart', () => {
    publishAgentEvent({ runId: 'job_1', role: 'creator', type: 'call-start' });
    publishAgentEvent({ runId: 'job_2', role: 'creator', type: 'call-start' });
    expect(readAgentEvents('job_2', 0).events).toHaveLength(1);
    expect(readAgentEvents('job_2', 0).events[0].runId).toBe('job_2');
  });

  it('returns nothing for an unknown run instead of throwing', () => {
    expect(readAgentEvents('nope', 0)).toEqual({ events: [], cursor: 0 });
  });

  it('carries the call and row grouping the UI needs', () => {
    publishAgentEvent({
      runId: 'job_1',
      role: 'designer',
      type: 'attempt',
      callId: 'call_9',
      label: 'row_3',
      provider: 'ollama',
      model: 'gemma3:4b',
      usage: { input: 10, output: 20 },
    });
    const [event] = readAgentEvents('job_1', 0).events;
    expect(event).toMatchObject({
      callId: 'call_9',
      label: 'row_3',
      provider: 'ollama',
      model: 'gemma3:4b',
      usage: { input: 10, output: 20 },
    });
  });

  it('clears a run when asked', () => {
    publishAgentEvent({ runId: 'job_1', role: 'creator', type: 'call-start' });
    clearAgentEvents('job_1');
    expect(readAgentEvents('job_1', 0).events).toHaveLength(0);
  });
});
