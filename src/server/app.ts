/**
 * The Express application: API routes only. Local dev wraps this with Vite
 * middleware (server.ts); the Vercel deployment exposes the same handler
 * cores through native functions in `api/`.
 */
import express from 'express';
import { handleModels, handleTestProvider, parseRunAgentRequest, runAgentStream } from './handlers';
import { AgentRunError } from './agentRun';
import { callProvider } from './providers';
import { callOllamaChunked } from './providers/ollama';

export interface ServerIdentity {
  instance: string;
  startedAt: string;
  /** Bound port, once known — health reports it for local instances. */
  getPort?: () => number;
}

export function createApp(identity: ServerIdentity): express.Express {
  const app = express();

  app.use(express.json({ limit: '25mb' }));

  // Firefox restores session tabs from bfcache without re-contacting the
  // server, so a stale tab can keep showing a page from whichever app owned
  // that port earlier. Only `no-store` keeps a page out of bfcache —
  // `no-cache` still permits an instant offline restore.
  //
  // The header is re-asserted in `writeHead` because Vite's dev middleware sets
  // its own `Cache-Control: no-cache` on HTML, which would otherwise win.
  function shouldNeverCache(req: express.Request): boolean {
    return req.path.startsWith('/api/') || (req.headers.accept ?? '').includes('text/html');
  }

  app.use((req, res, next) => {
    const writeHead = res.writeHead.bind(res);
    res.writeHead = ((...args: Parameters<typeof writeHead>) => {
      if (shouldNeverCache(req)) res.setHeader('Cache-Control', 'no-store, must-revalidate');
      return writeHead(...args);
    }) as typeof res.writeHead;
    next();
  });

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      app: 'Fisio Architect',
      instance: identity.instance,
      port: identity.getPort?.() ?? null,
      pid: process.pid,
      startedAt: identity.startedAt,
      hasKey: Boolean(process.env.GEMINI_API_KEY),
      time: new Date().toISOString(),
    });
  });

  app.post('/api/test-provider', async (req, res) => {
    const result = await handleTestProvider(req.body);
    res.status(result.status).json(result.payload);
  });

  app.post('/api/models', async (req, res) => {
    const result = await handleModels(req.body);
    res.status(result.status).json(result.payload);
  });

  // Buffered background activity for a run now streams inside the run-agent
  // response itself; the old GET /api/events polling endpoint is gone because
  // serverless instances do not share an in-memory buffer.
  app.post('/api/run-agent', async (req, res) => {
    let request;
    try {
      request = parseRunAgentRequest(req.body);
    } catch (error) {
      const err =
        error instanceof AgentRunError
          ? error
          : new AgentRunError('Invalid run request', false, 400);
      return res.status(err.status).json({ ok: false, error: err.message });
    }

    res.status(200);
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    await runAgentStream(
      request,
      { callProvider, callOllamaChunked },
      (line) => {
        if (res.writableEnded || res.destroyed) return;
        try {
          res.write(line);
        } catch {
          // Client went away mid-run; the provider call finishes and the
          // remaining lines are dropped.
        }
      }
    );
    if (!res.writableEnded && !res.destroyed) res.end();
  });

  return app;
}
