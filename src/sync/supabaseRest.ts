/**
 * Minimal PostgREST client for Supabase, deliberately hand-rolled: the project
 * already talks plain `fetch` everywhere else, the SDK would add ~30 kB to the
 * bundle for four requests, and keeping this small means the workspace secret
 * handling is visible in one place.
 */

export interface CloudRestConfig {
  /** https://<ref>.supabase.co — normalized by cloudConfig. */
  url: string;
  /** Public anon key. Grants nothing by itself: the RLS policies decide. */
  anonKey: string;
  /** The workspace secret, compared against every row by those policies. */
  secret: string;
}

export type CloudErrorKind = 'config' | 'auth' | 'network' | 'server';

export class CloudError extends Error {
  constructor(
    message: string,
    public readonly kind: CloudErrorKind
  ) {
    super(message);
    this.name = 'CloudError';
  }
}

export type CloudRow = Record<string, unknown>;

const PAGE_SIZE = 500;
/** A workspace should never approach this; it bounds a paging loop regardless. */
const MAX_ROWS = 20_000;

function baseHeaders(config: CloudRestConfig, extra: Record<string, string> = {}) {
  return {
    apikey: config.anonKey,
    Authorization: `Bearer ${config.anonKey}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // The only credential that opens any row: RLS compares it to the value
    // stored in the `workspace_secret` column.
    'X-Workspace-Secret': config.secret,
    ...extra,
  };
}

function assertConfig(config: CloudRestConfig): void {
  if (!config.url || !config.anonKey) {
    throw new CloudError(
      'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then rebuild.',
      'config'
    );
  }
  // Without the header every select answers "zero rows" and every write is
  // rejected, which looks like empty data rather than a missing secret. Fail
  // loudly instead.
  if (!config.secret) {
    throw new CloudError(
      'No workspace secret entered. Paste it in Providers -> Cloud storage before syncing.',
      'config'
    );
  }
}

function restUrl(config: CloudRestConfig, table: string, query?: string): string {
  const base = `${config.url}/rest/v1/${encodeURIComponent(table)}`;
  return query ? `${base}?${query}` : base;
}

interface ErrorBody {
  message?: string;
  code?: string;
  hint?: string;
}

/**
 * PostgREST reports an RLS rejection as 403/42501 and a bad JWT as 401; both
 * mean "this workspace secret does not open that row", which the user can act
 * on. Anything else is either the platform or the connection.
 */
function errorFromResponse(status: number, body: ErrorBody | null): CloudError {
  const detail = body?.message || body?.code || 'unexpected response';
  if (status === 401 || status === 403 || body?.code === '42501' || body?.code === 'PGRST301') {
    return new CloudError(
      `The server rejected the workspace secret (${detail}). Check the secret matches the one ` +
        'this data was uploaded with, and that supabase/schema.sql has been run on the project.',
      'auth'
    );
  }
  if (status >= 500) {
    return new CloudError(`Supabase returned ${status}: ${detail}`, 'server');
  }
  return new CloudError(`Supabase returned ${status}: ${detail}`, 'server');
}

async function send(
  config: CloudRestConfig,
  path: string,
  init: RequestInit,
  signal?: AbortSignal
): Promise<Response> {
  assertConfig(config);
  let response: Response;
  try {
    response = await fetch(path, { ...init, signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new CloudError(
      `Could not reach ${config.url} (${String((err as Error)?.message || err)}). Cloud sync will retry once you are back online.`,
      'network'
    );
  }
  if (response.status === 204) return response;
  if (!response.ok) {
    const body = await response.json().catch(() => null as ErrorBody | null);
    throw errorFromResponse(response.status, body as ErrorBody | null);
  }
  return response;
}

function parseTotal(contentRange: string | null): number | null {
  const match = /^[\d*]+-[\d*]+\/(\d+|\*)$/.exec(contentRange ?? '');
  if (!match || match[1] === '*') return null;
  return Number.parseInt(match[1], 10);
}

export interface SelectOptions {
  order?: string;
  /** Restrict the columns, e.g. 'id' when only the keys are needed. */
  select?: string;
  pageSize?: number;
  signal?: AbortSignal;
}

/** Reads every row the workspace secret can see, a page at a time. */
export async function selectAll(
  config: CloudRestConfig,
  table: string,
  options: SelectOptions = {}
): Promise<CloudRow[]> {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? PAGE_SIZE, MAX_ROWS));
  const collected: CloudRow[] = [];
  let start = 0;

  while (start < MAX_ROWS) {
    const end = start + pageSize - 1;
    const query = [
      options.order ? `order=${encodeURIComponent(options.order)}` : '',
      options.select ? `select=${encodeURIComponent(options.select)}` : '',
    ]
      .filter(Boolean)
      .join('&');
    const response = await send(
      config,
      restUrl(config, table, query),
      {
        method: 'GET',
        headers: baseHeaders(config, {
          Range: `items=${start}-${end}`,
          'Range-Unit': 'items',
          Prefer: 'count=exact',
        }),
        signal: options.signal,
      },
      options.signal
    );
    const page = (await response.json().catch(() => [])) as CloudRow[];
    const rows = Array.isArray(page) ? page : [];
    collected.push(...rows);

    const total = parseTotal(response.headers.get('content-range'));
    start += rows.length;
    if (rows.length < pageSize) break;
    if (total !== null && start >= total) break;
  }

  return collected;
}

export interface UpsertOptions {
  onConflict?: string;
  chunkSize?: number;
  signal?: AbortSignal;
}

/**
 * Updates the rows matching `filter`. PostgREST's POST-with-on_conflict merge is
 * NOT usable here: against a table whose policies are forced, re-posting an
 * existing row answers 409 `duplicate key value` instead of updating it, so the
 * engine decides between this and a fresh insert by looking first.
 */
export async function patchRow(
  config: CloudRestConfig,
  table: string,
  filter: string,
  patch: CloudRow,
  signal?: AbortSignal
): Promise<void> {
  await send(
    config,
    restUrl(config, table, filter),
    {
      method: 'PATCH',
      headers: baseHeaders(config, { Prefer: 'return=minimal' }),
      body: JSON.stringify(patch),
    },
    signal
  );
}

/**
 * Inserts or replaces rows. `return=minimal` keeps the response empty, so a
 * full article history does not travel back down just to be discarded.
 */
export async function upsertRows(
  config: CloudRestConfig,
  table: string,
  rows: CloudRow[],
  options: UpsertOptions = {}
): Promise<void> {
  if (rows.length === 0) return;
  const chunkSize = Math.max(1, options.chunkSize ?? 100);
  const query = options.onConflict
    ? `on_conflict=${encodeURIComponent(options.onConflict)}`
    : '';
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    await send(
      config,
      restUrl(config, table, query),
      {
        method: 'POST',
        headers: baseHeaders(config, { Prefer: 'return=minimal' }),
        body: JSON.stringify(rows.slice(offset, offset + chunkSize)),
      },
      options.signal
    );
  }
}

export async function deleteRow(
  config: CloudRestConfig,
  table: string,
  column: string,
  value: string,
  signal?: AbortSignal
): Promise<void> {
  await send(
    config,
    restUrl(config, table, `${encodeURIComponent(column)}=eq.${encodeURIComponent(value)}`),
    { method: 'DELETE', headers: baseHeaders(config, { Prefer: 'return=minimal' }) },
    signal
  );
}

export interface HandshakeResult {
  /** The extraction the policies use saw a non-empty secret. */
  secretSent: boolean;
  /** PostgREST published `request.headers` at all — separates a stripped proxy
   *  header from a secret that simply does not match any row. */
  headersExposed: boolean;
  articlesVisible: number;
  settingsVisible: number;
  raw: CloudRow;
}

/**
 * A read-only RPC the policies can answer without any stored rows, so "Test
 * connection" can tell an empty workspace apart from a wrong secret — with RLS,
 * a plain select returns an empty list in both cases.
 */
export async function handshake(config: CloudRestConfig, signal?: AbortSignal): Promise<HandshakeResult> {
  const response = await send(
    config,
    `${config.url}/rest/v1/rpc/fisio_cloud_handshake`,
    { method: 'POST', headers: baseHeaders(config), body: JSON.stringify({}) },
    signal
  );
  const raw = (await response.json().catch(() => ({}))) as CloudRow;
  return {
    secretSent: Boolean(raw.header_present),
    headersExposed: raw.headers_guc_present !== false,
    articlesVisible: Number(raw.articles_visible ?? 0),
    settingsVisible: Number(raw.settings_visible ?? 0),
    raw,
  };
}
