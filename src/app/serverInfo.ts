/**
 * What /api/health reports about the server answering this tab.
 *
 * Port and instance are shown in the nav so a tab is never ambiguous: when
 * several local dev servers are running, or a browser restored a stale tab,
 * the number under "server connected" says exactly which process is live.
 */
export interface ServerInfo {
  app?: string;
  instance?: string;
  port?: number;
  pid?: number;
  startedAt?: string;
}

/** Tolerant parse: an older server without these fields must not break the nav. */
export function parseServerInfo(payload: unknown): ServerInfo | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const data = payload as Record<string, unknown>;
  const port = typeof data.port === 'number' && Number.isInteger(data.port) ? data.port : undefined;
  return {
    app: typeof data.app === 'string' ? data.app : undefined,
    instance: typeof data.instance === 'string' ? data.instance : undefined,
    port,
    pid: typeof data.pid === 'number' ? data.pid : undefined,
    startedAt: typeof data.startedAt === 'string' ? data.startedAt : undefined,
  };
}
