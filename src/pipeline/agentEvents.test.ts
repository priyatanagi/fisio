import { beforeEach, describe, expect, it } from 'vitest';
import {
  getAgentEvents,
  publishLocalEvent,
  resetAgentEvents,
  subscribeAgentEvents,
} from './agentEvents';
import type { AgentEvent } from '../types/agentEvents';

beforeEach(() => resetAgentEvents());

describe('client event bus', () => {
  it('stamps an id and timestamp when an event is appended', () => {
    const event = publishLocalEvent({ runId: 'r1', role: 'creator', type: 'call-start' });
    expect(event.id).toBe(1);
    expect(typeof event.at).toBe('number');
    expect(getAgentEvents('r1')).toHaveLength(1);
  });

  it('assigns strictly increasing ids within a run', () => {
    const ids = [1, 2, 3].map(
      (n) => publishLocalEvent({ runId: 'r1', role: 'creator', type: 'attempt', attempt: n }).id
    );
    expect(ids).toEqual([1, 2, 3]);
  });

  it('keeps ids unique when concurrent streams write the same run', () => {
    // A batch fans out several run-agent requests that share one runId; every
    // stream appends into the same buffer, so no two events may collide.
    const first = publishLocalEvent({ runId: 'job', role: 'creator', type: 'call-start' });
    const second = publishLocalEvent({ runId: 'job', role: 'designer', type: 'call-start' });
    const third = publishLocalEvent({ runId: 'job', role: 'reviewer', type: 'completed' });
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
  });

  it('isolates runs from each other', () => {
    publishLocalEvent({ runId: 'job_1', role: 'creator', type: 'call-start' });
    publishLocalEvent({ runId: 'job_2', role: 'creator', type: 'call-start' });
    publishLocalEvent({ runId: 'job_2', role: 'creator', type: 'completed' });
    expect(getAgentEvents('job_1')).toHaveLength(1);
    expect(getAgentEvents('job_2')).toHaveLength(2);
  });

  it('notifies subscribers with only the new events', () => {
    publishLocalEvent({ runId: 'r1', role: 'creator', type: 'call-start' });
    const batches: AgentEvent[][] = [];
    const stop = subscribeAgentEvents('r1', (batch) => batches.push(batch));

    publishLocalEvent({ runId: 'r1', role: 'creator', type: 'completed' });
    expect(batches).toHaveLength(1);
    expect(batches[0].map((e) => e.type)).toEqual(['completed']);

    stop();
    publishLocalEvent({ runId: 'r1', role: 'creator', type: 'call-start' });
    expect(batches).toHaveLength(1);
  });

  it('caps the retained buffer per run without reusing ids', () => {
    for (let i = 0; i < 450; i++) {
      publishLocalEvent({ runId: 'r1', role: 'creator', type: 'attempt', attempt: i });
    }
    expect(getAgentEvents('r1')).toHaveLength(400);
    const next = publishLocalEvent({ runId: 'r1', role: 'creator', type: 'completed' });
    expect(next.id).toBe(451);
    expect(getAgentEvents('r1')).toHaveLength(400);
  });

  it('returns an empty list for a run nobody has published', () => {
    expect(getAgentEvents('nope')).toEqual([]);
  });
});
