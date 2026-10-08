import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgentError, runAgent } from './runAgent';
import { getAgentEvents, resetAgentEvents } from './agentEvents';
import { encodeChunk } from '../server/handlers';
import { DEFAULT_UNIVERSAL_RULES } from '../config/universalRules';
import type { ProviderConfig } from '../types/provider';
import type { UserProfile } from '../types/profile';

const signal = new AbortController().signal;

function ndjsonResponse(lines: string[]): Response {
  const bytes = new TextEncoder().encode(lines.join(''));
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'application/x-ndjson' },
  });
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const geminiConfig: ProviderConfig = { provider: 'gemini', model: 'm', apiKey: 'k' };

function options(overrides: Record<string, unknown> = {}) {
  return {
    role: 'creator' as const,
    input: { seedTopic: 'Treadmill' },
    userProfile: {} as UserProfile,
    providerConfig: geminiConfig,
    universalRules: DEFAULT_UNIVERSAL_RULES,
    signal,
    ...overrides,
  };
}

beforeEach(() => resetAgentEvents());
afterEach(() => vi.unstubAllGlobals());

describe('runAgent against the NDJSON stream', () => {
  it('publishes streamed events to the local bus and resolves the result line', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ndjsonResponse([
          encodeChunk({
            kind: 'event',
            event: { runId: 'r1', role: 'creator', type: 'call-start' },
          }),
          encodeChunk({
            kind: 'event',
            event: { runId: 'r1', role: 'creator', type: 'completed', model: 'm' },
          }),
          encodeChunk({
            kind: 'result',
            ok: true,
            data: { markdownContent: '# Body' },
            telemetry: {
              provider: 'gemini',
              model: 'm',
              requestedModel: 'm',
              attempts: 1,
              ms: 12,
            },
          }),
        ])
      )
    );

    const data = await runAgent(options({ runId: 'r1' }));
    expect(data).toEqual({ markdownContent: '# Body' });
    expect(getAgentEvents('r1').map((e) => e.type)).toEqual(['call-start', 'completed']);
    expect(getAgentEvents('r1')[0].id).toBe(1);
    expect(getAgentEvents('r1')[1].id).toBe(2);
  });

  it('throws an AgentError carrying the failure result line', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ndjsonResponse([
          encodeChunk({
            kind: 'event',
            event: { runId: 'r1', role: 'creator', type: 'failed', message: 'bad' },
          }),
          encodeChunk({ kind: 'result', ok: false, error: 'schema mismatch', recoverable: true }),
        ])
      )
    );

    await expect(runAgent(options({ runId: 'r1' }))).rejects.toMatchObject({
      name: 'AgentError',
      message: 'schema mismatch',
      recoverable: true,
    });
    // The server already emitted the closing failed event — no duplicate.
    expect(getAgentEvents('r1').filter((e) => e.type === 'failed')).toHaveLength(1);
  });

  it('falls back to a plain JSON body when the response is not a stream', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: true, data: { markdownContent: 'x' } }))
    );
    await expect(runAgent(options())).resolves.toEqual({ markdownContent: 'x' });
  });

  it('maps a plain JSON error body to an AgentError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ok: false, error: 'quota hit', recoverable: false }))
    );
    await expect(runAgent(options())).rejects.toMatchObject({
      message: 'quota hit',
      recoverable: false,
    });
  });

  it('closes the log with a local failed event when the stream ends without a result', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ndjsonResponse([
          encodeChunk({
            kind: 'event',
            event: { runId: 'r1', role: 'creator', type: 'call-start' },
          }),
        ])
      )
    );

    await expect(runAgent(options({ runId: 'r1' }))).rejects.toBeInstanceOf(AgentError);
    const failed = getAgentEvents('r1').filter((e) => e.type === 'failed');
    expect(failed).toHaveLength(1);
    expect(failed[0].message).toContain('stream');
  });
});

describe('runAgent with the Ollama provider', () => {
  it('calls the local Ollama server from the browser instead of /api/run-agent', async () => {
    const fetchMock = vi.fn(async (url: unknown) => {
      const target = String(url);
      if (target.endsWith('/api/generate')) {
        return jsonResponse({
          response: JSON.stringify({ markdownContent: '# Body' }),
          done_reason: 'stop',
          model: 'qwen3:8b',
        });
      }
      throw new Error(`unexpected request: ${target}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const data = await runAgent(
      options({
        providerConfig: {
          provider: 'ollama',
          model: 'qwen3:8b',
          baseUrl: 'http://localhost:11434',
        } satisfies ProviderConfig,
        runId: 'r9',
      })
    );

    expect(data).toEqual({ markdownContent: '# Body' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('http://localhost:11434/api/generate');
    expect(getAgentEvents('r9').map((e) => e.type)).toEqual(['call-start', 'completed']);
  });

  it('reports an unreachable local server as a non-recoverable AgentError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );

    await expect(
      runAgent(
        options({
          providerConfig: { provider: 'ollama', model: 'qwen3:8b', baseUrl: 'http://localhost:11434' },
        })
      )
    ).rejects.toMatchObject({ name: 'AgentError', recoverable: false });
  });
});
