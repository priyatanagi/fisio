import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CloudError,
  deleteRow,
  handshake,
  patchRow,
  selectAll,
  upsertRows,
  type CloudRestConfig,
} from './supabaseRest';

const config: CloudRestConfig = {
  url: 'https://demo.supabase.co',
  anonKey: 'anon-key',
  secret: 'workspace-secret',
};

function response(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}) {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('request shape', () => {
  it('sends the anon key plus the workspace secret header on every call', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => response([]));
    vi.stubGlobal('fetch', fetchMock);

    await selectAll(config, 'fisio_articles');

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('https://demo.supabase.co/rest/v1/fisio_articles');
    const headers = init.headers as Record<string, string>;
    expect(headers.apikey).toBe('anon-key');
    expect(headers.Authorization).toBe('Bearer anon-key');
    expect(headers['X-Workspace-Secret']).toBe('workspace-secret');
  });

  it('refuses to send anything when the secret is blank, instead of an anonymous read', async () => {
    await expect(selectAll({ ...config, secret: '' }, 'fisio_articles')).rejects.toMatchObject({
      kind: 'config',
    });
  });
});

describe('patchRow', () => {
  // Supabase does not merge on POST when the policies force RLS: an
  // already-existing row answers 409. Updates therefore go through a filtered
  // PATCH, which is proven to work against the live project.
  it('sends a PATCH scoped by the filter and asks for no body back', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await patchRow(config, 'fisio_settings', 'workspace_secret=eq.sec%2D1', { updated_at: 'x' });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://demo.supabase.co/rest/v1/fisio_settings?workspace_secret=eq.sec%2D1');
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>)['X-Workspace-Secret']).toBe('workspace-secret');
    expect(JSON.parse(init.body as string)).toEqual({ updated_at: 'x' });
  });
});

describe('selectAll', () => {
  it('asks for only the columns it needs', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => response([]));
    vi.stubGlobal('fetch', fetchMock);
    await selectAll(config, 'fisio_articles', { select: 'id' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('select=id');
  });

  it('walks Range pages until the reported total is collected', async () => {
    const page1 = Array.from({ length: 2 }, (_, i) => ({ id: `a${i}` }));
    const page2 = [{ id: 'a2' }];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(response(page1, { status: 206, headers: { 'Content-Range': '0-1/3' } }))
      .mockResolvedValueOnce(response(page2, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await selectAll(config, 'fisio_articles', { pageSize: 2 });

    expect(rows.map((r) => r.id)).toEqual(['a0', 'a1', 'a2']);
    const firstHeaders = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(firstHeaders.Range).toBe('items=0-1');
    expect((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].headers).toMatchObject({
      Range: 'items=2-3',
    });
  });

  it('orders by the column it is given', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => response([]));
    vi.stubGlobal('fetch', fetchMock);
    await selectAll(config, 'fisio_articles', { order: 'updated_at.desc' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('order=updated_at.desc');
  });

  it('maps an RLS rejection to an auth error that names the workspace secret', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ code: '42501', message: 'new row violates row-level security policy' }, { status: 403 }))
    );
    await expect(selectAll(config, 'fisio_articles')).rejects.toMatchObject({
      kind: 'auth',
      message: expect.stringContaining('workspace secret'),
    });
  });

  it('reports an unreachable host as a network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    await expect(selectAll(config, 'fisio_articles')).rejects.toBeInstanceOf(CloudError);
    await expect(selectAll(config, 'fisio_articles')).rejects.toMatchObject({ kind: 'network' });
  });
});

describe('upsertRows', () => {
  it('posts the rows with the conflict target and asks for no body back', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);

    await upsertRows(config, 'fisio_articles', [{ id: 'a1' }], { onConflict: 'id' });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('on_conflict=id');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Prefer).toBe('return=minimal');
    expect(JSON.parse(init.body as string)).toEqual([{ id: 'a1' }]);
  });

  it('splits a large queue so no single request grows unbounded', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: `a${i}` }));

    await upsertRows(config, 'fisio_articles', rows, { onConflict: 'id', chunkSize: 2 });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe('deleteRow', () => {
  it('targets the primary key in the query string', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    await deleteRow(config, 'fisio_articles', 'id', 'a1');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(String(url)).toContain('id=eq.a1');
    expect(init.method).toBe('DELETE');
  });
});

describe('handshake', () => {
  it('calls the RPC endpoint and returns what the policies could see', async () => {
    const fetchMock = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      response({
        header_present: true,
        headers_guc_present: true,
        articles_visible: 3,
        settings_visible: 1,
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await handshake(config);

    expect(String(fetchMock.mock.calls[0][0])).toContain('/rest/v1/rpc/fisio_cloud_handshake');
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].method).toBe('POST');
    expect(result).toEqual({
      secretSent: true,
      headersExposed: true,
      articlesVisible: 3,
      settingsVisible: 1,
      raw: {
        header_present: true,
        headers_guc_present: true,
        articles_visible: 3,
        settings_visible: 1,
      },
    });
  });

  it('flags a platform that does not expose the header set at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ header_present: false, headers_guc_present: false }))
    );
    const result = await handshake(config);
    expect(result.secretSent).toBe(false);
    expect(result.headersExposed).toBe(false);
  });

  it('surfaces a server error kind for a non-4xx failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => response({ message: 'boom' }, { status: 500 })));
    await expect(handshake(config)).rejects.toMatchObject({ kind: 'server' });
  });
});
