import { describe, it, expect } from 'vitest';
import type { AgentEvent } from '../types/agentEvents';
import {
  activityTotals,
  appendStage,
  closeStages,
  expectedStages,
  formatDuration,
  groupAgentCalls,
} from './agentActivity';
import { DEFAULT_PIPELINE_CONFIG, type PipelineStage } from './stages';

let seq = 0;

function event(partial: Partial<AgentEvent> & { type: AgentEvent['type']; role: string }): AgentEvent {
  seq += 1;
  return {
    id: seq,
    runId: 'run_1',
    at: 1000 + seq * 100,
    ...partial,
  } as AgentEvent;
}

describe('groupAgentCalls', () => {
  it('keeps concurrent calls of the same role separate', () => {
    const calls = groupAgentCalls([
      event({ type: 'call-start', role: 'designer', callId: 'a', model: 'gemini-x' }),
      event({ type: 'call-start', role: 'designer', callId: 'b', model: 'gemini-x' }),
      event({ type: 'attempt', role: 'designer', callId: 'b', model: 'gemini-x', durationMs: 900 }),
      event({ type: 'completed', role: 'designer', callId: 'b', model: 'gemini-x', durationMs: 900 }),
      event({ type: 'attempt', role: 'designer', callId: 'a', model: 'gemini-x', durationMs: 1200 }),
      event({ type: 'completed', role: 'designer', callId: 'a', model: 'gemini-x', durationMs: 1200 }),
    ]);
    expect(calls).toHaveLength(2);
    expect(calls.every((call) => call.status === 'ok')).toBe(true);
    expect(calls.map((call) => call.durationMs)).toEqual([1200, 900]);
  });

  it('counts real attempts, fallbacks and repairs from the server', () => {
    const calls = groupAgentCalls([
      event({ type: 'call-start', role: 'creator', callId: 'c', model: 'gemini-3.1-flash-lite' }),
      event({ type: 'attempt', role: 'creator', callId: 'c', model: 'gemini-3.1-flash-lite', message: 'rate limited: 429' }),
      event({ type: 'model-fallback', role: 'creator', callId: 'c', model: 'gemini-2.5-flash' }),
      event({ type: 'attempt', role: 'creator', callId: 'c', model: 'gemini-2.5-flash', usage: { input: 10, output: 20 } }),
      event({ type: 'repair', role: 'creator', callId: 'c', model: 'gemini-2.5-flash', message: 'Invalid output' }),
      event({ type: 'attempt', role: 'creator', callId: 'c', model: 'gemini-2.5-flash' }),
      event({
        type: 'completed',
        role: 'creator',
        callId: 'c',
        model: 'gemini-2.5-flash',
        requestedModel: 'gemini-3.1-flash-lite',
        attempts: 3,
        usage: { input: 30, output: 400 },
        durationMs: 4200,
      }),
    ]);
    const [call] = calls;
    expect(call.attempts).toBe(3);
    expect(call.fallbacks).toBe(1);
    expect(call.repairs).toBe(1);
    expect(call.answeredBy).toBe('gemini-2.5-flash');
    expect(call.requestedModel).toBe('gemini-3.1-flash-lite');
    expect(call.notes.map((note) => note.level)).toEqual([
      'warn',
      'warn',
      'info',
      'warn',
      'info',
    ]);
  });

  it('marks a call running until the server reports completion', () => {
    const calls = groupAgentCalls([
      event({ type: 'call-start', role: 'reviewer', callId: 'r', model: 'gpt-4o' }),
      event({ type: 'attempt', role: 'reviewer', callId: 'r', model: 'gpt-4o' }),
    ]);
    expect(calls[0].status).toBe('running');
    expect(calls[0].attempts).toBe(1);
  });

  it('records failures with their message', () => {
    const calls = groupAgentCalls([
      event({ type: 'call-start', role: 'judge', callId: 'j', model: 'm' }),
      event({ type: 'failed', role: 'judge', callId: 'j', model: 'm', message: 'quota reached' }),
    ]);
    expect(calls[0].status).toBe('failed');
    expect(calls[0].notes[0].text).toBe('quota reached');
    expect(calls[0].notes[0].level).toBe('error');
  });
});

describe('activityTotals', () => {
  it('sums provider requests and tokens across calls', () => {
    const calls = groupAgentCalls([
      event({ type: 'call-start', role: 'creator', callId: '1', model: 'm' }),
      event({ type: 'completed', role: 'creator', callId: '1', model: 'm', attempts: 2, usage: { input: 5, output: 6 }, durationMs: 10 }),
      event({ type: 'call-start', role: 'designer', callId: '2', model: 'm' }),
      event({ type: 'completed', role: 'designer', callId: '2', model: 'm', attempts: 1, usage: { input: 1, output: 1 }, durationMs: 10 }),
    ]);
    const totals = activityTotals(calls, 60_000);
    expect(totals.providerRequests).toBe(3);
    expect(totals.tokensIn).toBe(6);
    expect(totals.tokensOut).toBe(7);
    expect(totals.running).toBe(0);
  });

  it('counts an in-flight call as one request already issued', () => {
    const calls = groupAgentCalls([event({ type: 'call-start', role: 'creator', callId: 'x', model: 'm' })]);
    expect(activityTotals(calls, Date.now()).providerRequests).toBe(1);
  });
});

describe('stage timings', () => {
  it('closes the previous stage when a new one starts', () => {
    let timings = appendStage([], 'creating' as PipelineStage, 'Writing', 1000);
    timings = appendStage(timings, 'reviewing' as PipelineStage, 'Auditing', 2500);
    expect(timings).toHaveLength(2);
    expect(timings[0].endedAt).toBe(2500);
    expect(timings[1].endedAt).toBeUndefined();
  });

  it('updates the message when the same stage re-announces', () => {
    let timings = appendStage([], 'creating' as PipelineStage, 'Writing', 1000);
    timings = appendStage(timings, 'creating' as PipelineStage, 'Revision 1 of 1', 1500);
    expect(timings).toHaveLength(1);
    expect(timings[0].message).toBe('Revision 1 of 1');
    expect(timings[0].startedAt).toBe(1000);
  });

  it('closeStages is idempotent', () => {
    const timings = closeStages(closeStages([{ stage: 'creating' as PipelineStage, message: 'm', startedAt: 1 }], 50), 90);
    expect(timings[0].endedAt).toBe(50);
  });
});

describe('expectedStages', () => {
  it('skips optional stages that are turned off', () => {
    const stages = expectedStages({
      ...DEFAULT_PIPELINE_CONFIG,
      judge: false,
      impower: 'off',
      reviewer: 'off',
    });
    expect(stages.map((stage) => stage.stage)).toEqual(['creating', 'designing']);
  });

  it('lists every stage when the full pipeline is on', () => {
    const stages = expectedStages(DEFAULT_PIPELINE_CONFIG);
    expect(stages.map((stage) => stage.stage)).toEqual([
      'judging',
      'impowering',
      'creating',
      'reviewing',
      'designing',
    ]);
  });
});

describe('formatDuration', () => {
  it('scales units', () => {
    expect(formatDuration(950)).toBe('950ms');
    expect(formatDuration(4200)).toBe('4.2s');
    expect(formatDuration(95_000)).toBe('1m 35s');
  });
});
