import { describe, expect, it, vi } from 'vitest';
import { encodeChunk, handleModels, handleTestProvider, runAgentStream } from './handlers';
import { ProviderCallError, type ProviderCallResult } from './providerCore';
import type { RunAgentRequest } from './agentRun';

function okResult(text: string): ProviderCallResult {
  return { text, model: 'm', provider: 'gemini', attempts: 1, requestedModel: 'm' };
}

const validJudge = {
  refinedTopic: 'Choosing a commercial treadmill',
  searchIntent: 'commercial',
  audienceAngle: 'for owners',
  subtopics: ['a'],
  rejectedAngles: [],
};

const request: RunAgentRequest = {
  role: 'judge',
  input: {},
  userProfile: {},
  providerConfig: { provider: 'gemini', model: 'm' },
  runId: 'r1',
};

function parseLines(lines: string[]): any[] {
  return lines.map((line) => {
    expect(line.endsWith('\n')).toBe(true);
    return JSON.parse(line);
  });
}

describe('encodeChunk', () => {
  it('emits one newline-terminated JSON object per line', () => {
    const line = encodeChunk({
      kind: 'event',
      event: { runId: 'r1', role: 'creator', type: 'call-start' },
    });
    expect(line.endsWith('\n')).toBe(true);
    expect(JSON.parse(line)).toEqual({
      kind: 'event',
      event: { runId: 'r1', role: 'creator', type: 'call-start' },
    });
  });
});

describe('runAgentStream', () => {
  it('streams the call-start event first and finishes with exactly one result line', async () => {
    const lines: string[] = [];
    await runAgentStream(
      request,
      { callProvider: vi.fn(async () => okResult(JSON.stringify(validJudge))) },
      (line) => lines.push(line)
    );

    const parsed = parseLines(lines);
    expect(parsed[0].kind).toBe('event');
    expect(parsed[0].event.type).toBe('call-start');
    const results = parsed.filter((chunk) => chunk.kind === 'result');
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(true);
    expect(results[0].data).toEqual(validJudge);
    expect(results[0].telemetry.provider).toBe('gemini');
    expect(parsed[parsed.length - 1].kind).toBe('result');
  });

  it('ends with a failed result line when the provider call fails', async () => {
    const lines: string[] = [];
    await runAgentStream(
      request,
      {
        callProvider: vi.fn(async () => {
          throw new ProviderCallError('quota reached', true);
        }),
      },
      (line) => lines.push(line)
    );

    const parsed = parseLines(lines);
    const failed = parsed.find((chunk) => chunk.kind === 'event' && chunk.event.type === 'failed');
    expect(failed).toBeDefined();
    const result = parsed[parsed.length - 1];
    expect(result).toMatchObject({ kind: 'result', ok: false, error: 'quota reached', recoverable: true });
  });
});

describe('handleTestProvider', () => {
  it('refuses Ollama and points the caller at the browser', async () => {
    const result = await handleTestProvider({ provider: 'ollama', model: 'q' });
    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ success: false });
    expect((result.payload as any).error).toContain('browser');
  });
});

describe('handleModels', () => {
  it('refuses Ollama because the catalog is fetched by the browser', async () => {
    const result = await handleModels({ provider: 'ollama' });
    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({ ok: false });
    expect((result.payload as any).error).toContain('browser');
  });

  it('rejects an unknown provider', async () => {
    const result = await handleModels({ provider: 'nope' });
    expect(result.status).toBe(400);
    expect((result.payload as any).error).toContain('Unsupported provider');
  });
});
