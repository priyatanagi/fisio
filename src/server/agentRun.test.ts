import { describe, expect, it, vi } from 'vitest';
import { AgentRunError, executeAgentRun, parseRunAgentRequest } from './agentRun';
import { ProviderCallError, type ProviderCallResult } from './providerCore';
import type { PublishInput } from '../types/agentEvents';
import type { ProviderConfig } from '../types/provider';

const validJudge = {
  refinedTopic: 'Choosing a commercial treadmill',
  searchIntent: 'commercial',
  audienceAngle: 'for owners',
  subtopics: ['a'],
  rejectedAngles: [],
};

const validCreator = { markdownContent: '# Body' };

function okResult(text: string, provider: 'gemini' | 'ollama' = 'gemini'): ProviderCallResult {
  return { text, model: 'm', provider, attempts: 1, requestedModel: 'm' };
}

function collect() {
  const events: PublishInput[] = [];
  return { events, emit: (e: PublishInput) => events.push(e) };
}

const baseRequest = {
  role: 'judge',
  input: {},
  userProfile: {},
  providerConfig: { provider: 'gemini', model: 'm' } as ProviderConfig,
  runId: 'r1',
};

describe('parseRunAgentRequest', () => {
  it('rejects a request with no role using a 400', () => {
    try {
      parseRunAgentRequest({ userProfile: {}, providerConfig: { provider: 'gemini' } });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(AgentRunError);
      expect((err as AgentRunError).status).toBe(400);
      expect((err as AgentRunError).message).toBe('role is required');
    }
  });

  it('rejects a request with no provider', () => {
    expect(() => parseRunAgentRequest({ role: 'judge', userProfile: {} })).toThrowError(
      'providerConfig is required'
    );
  });

  it('rejects a request with no profile', () => {
    expect(() =>
      parseRunAgentRequest({ role: 'judge', providerConfig: { provider: 'gemini' } })
    ).toThrowError('userProfile is required');
  });

  it('rejects Ollama with a message pointing at the browser', () => {
    try {
      parseRunAgentRequest({
        role: 'judge',
        userProfile: {},
        providerConfig: { provider: 'ollama', model: 'q' },
      });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect((err as AgentRunError).status).toBe(400);
      expect((err as AgentRunError).message).toContain('browser');
    }
  });

  it('accepts a well-formed request and trims the runId', () => {
    const parsed = parseRunAgentRequest({
      role: 'judge',
      input: { a: 1 },
      userProfile: { x: true },
      providerConfig: { provider: 'gemini', model: 'm' },
      runId: '  job_7  ',
    });
    expect(parsed.runId).toBe('job_7');
    expect(parsed.input).toEqual({ a: 1 });
  });
});

describe('executeAgentRun', () => {
  it('emits call-start then completed and returns validated data', async () => {
    const bus = collect();
    const callProvider = vi.fn(async () => okResult(JSON.stringify(validJudge)));

    const result = await executeAgentRun(baseRequest, { emit: bus.emit, callProvider });

    expect(result.data).toEqual(validJudge);
    expect(result.telemetry.provider).toBe('gemini');
    expect(bus.events.map((e) => e.type)).toEqual(['call-start', 'completed']);
    expect(bus.events[1].model).toBe('m');
    expect(callProvider).toHaveBeenCalledTimes(1);
  });

  it('emits nothing when the request carries no runId', async () => {
    const bus = collect();
    await executeAgentRun(
      { ...baseRequest, runId: undefined },
      { emit: bus.emit, callProvider: vi.fn(async () => okResult(JSON.stringify(validJudge))) }
    );
    expect(bus.events).toEqual([]);
  });

  it('emits a repair event and revalidates after an invalid first response', async () => {
    const bus = collect();
    const callProvider = vi
      .fn()
      .mockResolvedValueOnce(okResult('not json at all'))
      .mockResolvedValueOnce(okResult(JSON.stringify(validJudge)));

    const result = await executeAgentRun(baseRequest, { emit: bus.emit, callProvider });

    expect(result.data).toEqual(validJudge);
    expect(bus.events.map((e) => e.type)).toEqual(['call-start', 'repair', 'completed']);
    expect(callProvider).toHaveBeenCalledTimes(2);
  });

  it('fails with a closing failed event when repair does not fix the shape', async () => {
    const bus = collect();
    const callProvider = vi.fn(async () => okResult('still not json'));

    await expect(
      executeAgentRun(baseRequest, { emit: bus.emit, callProvider })
    ).rejects.toMatchObject({ name: 'AgentRunError', status: 502, recoverable: false });
    expect(bus.events.map((e) => e.type)).toEqual(['call-start', 'repair', 'failed']);
  });

  it('retries in sections with the chunked fallback for Ollama', async () => {
    const bus = collect();
    const callProvider = vi.fn(async () => okResult('garbage', 'ollama'));
    const callOllamaChunked = vi.fn(async () => okResult(JSON.stringify(validCreator), 'ollama'));

    const result = await executeAgentRun(
      { ...baseRequest, role: 'creator', providerConfig: { provider: 'ollama', model: 'q' } },
      { emit: bus.emit, callProvider, callOllamaChunked }
    );

    expect(result.data).toEqual(validCreator);
    expect(bus.events.map((e) => e.type)).toEqual(['call-start', 'repair', 'chunk', 'completed']);
    expect(callOllamaChunked).toHaveBeenCalledTimes(1);
    expect(bus.events.find((e) => e.type === 'chunk')?.message).toContain('sections');
  });

  it('wraps a recoverable provider failure and reports it once', async () => {
    const bus = collect();
    const callProvider = vi.fn(async () => {
      throw new ProviderCallError('quota reached', true);
    });

    await expect(
      executeAgentRun(baseRequest, { emit: bus.emit, callProvider })
    ).rejects.toMatchObject({ name: 'AgentRunError', recoverable: true, message: 'quota reached' });
    expect(bus.events.map((e) => e.type)).toEqual(['call-start', 'failed']);
    expect(bus.events.filter((e) => e.type === 'failed')).toHaveLength(1);
  });
});
