import express from 'express';
import { createServer, type Server } from 'node:http';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { callProvider, callOllamaChunked, cleanJsonOutput } from './src/server/providers.js';
import { ProviderConfig } from './src/types/provider.js';
import { validateRoleOutput, buildRepairPrompt } from './src/server/roleSchemas.js';
import { isChunkableRole } from './src/server/chunked.js';
import { publishAgentEvent, readAgentEvents } from './src/server/agentEvents.js';
import type { AgentEvent } from './src/types/agentEvents.js';
import { listModels } from './src/server/modelCatalog.js';
import {
  buildJudgePrompt,
  buildImpowerPrompt,
  buildKeywordResearchPrompt,
  buildCreatorPrompt,
  buildReviewerPrompt,
  buildDesignerPrompt,
} from './src/server/agentPrompts.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

// 5177 rather than 3000: several local Node dev servers squat on 3000, and a
// collision is silent for the user — the browser opens localhost:3000 and
// lands in someone else's app instead of this one.
const DEFAULT_PORT = 5177;
const MAX_PORT_ATTEMPTS = 10;

const PORT: number = (() => {
  const raw = process.env.PORT;
  if (!raw || !raw.trim()) return DEFAULT_PORT;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 65535) return parsed;

  // PORT=0 is the conventional "let the OS pick" value, and launchers that
  // start this server export it — so it is expected, not a typo in .env. A
  // stable port is kept anyway because the UI is browsed and bookmarked; an
  // ephemeral one would change on every restart.
  const reason =
    parsed === 0
      ? 'PORT=0 requests an ephemeral port, which a bookmarked dev URL cannot use'
      : `"${raw}" is not a usable port`;
  console.warn(`[Server] ${reason}; using ${DEFAULT_PORT}.`);
  return DEFAULT_PORT;
})();

app.use(express.json({ limit: '25mb' }));

// Identity of this process. `instance` is what makes two dev servers on the
// same machine tellable apart at a glance: both answer /api/health, but they
// report different ports and different instance tags.
const INSTANCE = randomUUID().slice(0, 4).toUpperCase();
const STARTED_AT = new Date().toISOString();
let boundPort = PORT;

// Firefox restores session tabs from bfcache without re-contacting the
// server, so a stale `localhost:3000` tab can keep showing a page from
// whichever app owned that port earlier. Chrome tends to revalidate, which is
// why the two browsers disagreed. Only `no-store` keeps a page out of bfcache
// -- `no-cache` still permits an instant offline restore.
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'Fisio Architect',
    instance: INSTANCE,
    port: boundPort,
    pid: process.pid,
    startedAt: STARTED_AT,
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// Test connection endpoint for any provider
app.post('/api/test-provider', async (req, res) => {
  try {
    const { provider = 'gemini', model, apiKey, baseUrl } = req.body;
    const testConfig: ProviderConfig = { provider, model, apiKey, baseUrl };

    // Listing the real catalog first means the message names models the
    // provider actually offers, instead of only confirming the endpoint.
    const catalog = await listModels(
      { provider, apiKey, baseUrl },
      { refresh: true }
    );
    const requested = typeof model === 'string' ? model.trim() : '';
    const known = catalog.models.some((m) => m.id === requested);
    const catalogLine = catalog.live
      ? `Found ${catalog.models.length} model(s) available to this credential.`
      : `Could not list models (${catalog.error}).`;
    const missingLine =
      requested && !known
        ? ` "${requested}" is not in that list — it may still work if the provider hides it.`
        : '';

    if (provider === 'ollama' || provider === 'openai') {
      if (!catalog.live) throw new Error(catalog.error ?? 'Model listing failed.');
      return res.json({
        success: true,
        message: `Successfully connected to ${provider.toUpperCase()}! ${catalogLine}${missingLine}`,
        modelCount: catalog.models.length,
      });
    }

    const testPrompt = 'Respond strictly with valid JSON: {"status": "ok", "message": "connection successful"}';

    const result = await callProvider(testPrompt, testConfig);

    const cleaned = cleanJsonOutput(result.text);
    JSON.parse(cleaned);

    return res.json({
      success: true,
      message: `Successfully connected to ${provider.toUpperCase()}! "${result.model}" answered the probe. ${catalogLine}${missingLine}`,
      model: result.model,
      modelCount: catalog.models.length,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Connection test failed',
    });
  }
});

// Real model catalog for the provider/baseURL/key currently in the form.
app.post('/api/models', async (req, res) => {
  const { provider, apiKey, baseUrl, refresh } = req.body ?? {};
  const supported = ['gemini', 'openai', 'anthropic', 'ollama'];
  if (!supported.includes(provider)) {
    return res.status(400).json({ ok: false, error: `Unsupported provider: ${provider}` });
  }
  const catalog = await listModels(
    { provider, apiKey, baseUrl },
    { refresh: Boolean(refresh) }
  );
  return res.json({ ok: true, ...catalog });
});

// Buffered background activity for a run, consumed by the UI as a live log.
app.get('/api/events', (req, res) => {
  const runId = String(req.query.runId ?? '');
  const since = Number.parseInt(String(req.query.since ?? '0'), 10) || 0;
  if (!runId) return res.status(400).json({ ok: false, error: 'runId is required' });
  const { events, cursor } = readAgentEvents(runId, since);
  return res.json({ ok: true, events, cursor });
});

function promptForRole(role: string, input: any, profile: any): string {
  switch (role) {
    case 'judge':
      return buildJudgePrompt(input, profile);
    case 'impower':
      return buildImpowerPrompt(input, profile);
    case 'research':
      return buildKeywordResearchPrompt(input.topic, profile);
    case 'creator':
      return buildCreatorPrompt(input, profile);
    case 'reviewer':
      return buildReviewerPrompt(input, profile);
    case 'designer':
      return buildDesignerPrompt(input, profile);
    default:
      throw new Error(`Unsupported role: ${role}`);
  }
}

app.post('/api/run-agent', async (req, res) => {
  const { role, input = {}, userProfile, providerConfig, runId, eventLabel, callId } =
    req.body ?? {};
  const trace =
    typeof runId === 'string' && runId.trim() && role
      ? {
          runId: runId.trim(),
          role,
          label: typeof eventLabel === 'string' ? eventLabel : undefined,
          callId: typeof callId === 'string' ? callId : undefined,
        }
      : undefined;
  const startedAt = Date.now();

  const report = (type: 'completed' | 'failed', extra: Partial<AgentEvent> = {}) => {
    if (!trace) return;
    publishAgentEvent({
      runId: trace.runId,
      role: trace.role,
      label: trace.label,
      callId: trace.callId,
      type,
      provider: providerConfig?.provider,
      model: extra.model ?? providerConfig?.model ?? '',
      durationMs: Date.now() - startedAt,
      ...extra,
    });
  };

  try {
    if (!role) return res.status(400).json({ ok: false, error: 'role is required' });
    if (!providerConfig?.provider) {
      return res.status(400).json({ ok: false, error: 'providerConfig is required' });
    }
    if (!userProfile) {
      return res.status(400).json({ ok: false, error: 'userProfile is required' });
    }

    if (trace) {
      publishAgentEvent({
        runId: trace.runId,
        role: trace.role,
        label: trace.label,
        callId: trace.callId,
        type: 'call-start',
        provider: providerConfig.provider,
        model: providerConfig.model,
        requestedModel: providerConfig.model,
      });
    }

    const prompt = promptForRole(role, input, userProfile);

    let call = await callProvider(prompt, providerConfig, trace);
    let result = validateRoleOutput(role as any, call.text);

    // One repair attempt for shape problems. Transport failures already
    // exhausted the 429 ladder inside callProvider, so this is the only extra
    // call a bad response can cost.
    if (!result.ok) {
      console.warn(`[run-agent] ${role} returned invalid output, repairing:`, result.error);
      if (trace) {
        publishAgentEvent({
          runId: trace.runId,
          role: trace.role,
          label: trace.label,
          callId: trace.callId,
          type: 'repair',
          provider: providerConfig.provider,
          model: call.model,
          message: `Invalid output — ${result.error}`.slice(0, 200),
        });
      }
      call = await callProvider(buildRepairPrompt(role as any, call.text), providerConfig, trace);
      result = validateRoleOutput(role as any, call.text);
    }

    // The repair pass is a resend of the same shape, so a response that was cut
    // short by the output ceiling will be cut short again. Only then is it worth
    // asking for the body a section at a time. Ollama-only: the other providers
    // keep their current behaviour.
    if (
      !result.ok &&
      providerConfig.provider === 'ollama' &&
      isChunkableRole(role as string)
    ) {
      console.warn(`[run-agent] ${role} still invalid after repair, trying chunked generation:`);
      if (trace) {
        publishAgentEvent({
          runId: trace.runId,
          role: trace.role,
          label: trace.label,
          callId: trace.callId,
          type: 'chunk',
          provider: 'ollama',
          model: call.model,
          message: 'Retrying in sections — the single response did not fit.',
        });
      }
      try {
        call = await callOllamaChunked(prompt, role as any, providerConfig, trace);
        result = validateRoleOutput(role as any, call.text);
      } catch (chunkErr) {
        const message =
          chunkErr instanceof Error ? chunkErr.message : 'Chunked generation failed.';
        report('failed', { model: call.model, message });
        return res.status(502).json({ ok: false, error: message, recoverable: false });
      }
    }

    if (!result.ok) {
      report('failed', { model: call.model, message: result.error });
      return res.status(502).json({ ok: false, error: result.error, recoverable: false });
    }
    report('completed', {
      model: call.model,
      requestedModel: call.requestedModel,
      attempts: call.attempts,
      outputChars: call.text.length,
      usage: call.usage,
    });
    return res.json({
      ok: true,
      data: result.data,
      telemetry: {
        provider: call.provider,
        model: call.model,
        requestedModel: call.requestedModel,
        attempts: call.attempts,
        usage: call.usage,
        ms: Date.now() - startedAt,
      },
    });
  } catch (error: any) {
    console.error('[run-agent] failed:', error);
    report('failed', { message: error?.message || 'Agent call failed' });
    return res.status(502).json({
      ok: false,
      error: error?.message || 'Agent call failed',
      recoverable: error?.recoverable === true,
    });
  }
});

function listenWithFallback(
  server: Server,
  port: number,
  attemptsLeft: number = MAX_PORT_ATTEMPTS
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const onListening = () => {
      server.removeListener('error', onError);
      boundPort = port;
      const hostUrl = `http://localhost:${port}`;
      if (port !== PORT) {
        console.warn(
          `\n  NOTE: http://localhost:${PORT} is already used by another program.\n` +
            `        This app is running on ${hostUrl} instead — use that exact address.\n`
        );
      }
      console.log(`\n  Server ready - open in browser:  ${hostUrl}\n  (bound to 0.0.0.0:${port}, reachable from other devices on your network)\n`);
      resolve(port);
    };

    function onError(err: NodeJS.ErrnoException) {
      server.removeListener('listening', onListening);
      if (err.code !== 'EADDRINUSE' || attemptsLeft <= 1) {
        return reject(err);
      }
      console.warn(`[Server] Port ${port} is in use (another app owns it), trying ${port + 1}...`);
      listenWithFallback(server, port + 1, attemptsLeft - 1).then(resolve, reject);
    }

    server.once('listening', onListening);
    server.once('error', onError);
    server.listen(port, '0.0.0.0');
  });
}

async function startServer() {
  // One shared HTTP server: Vite runs in middleware mode, so without this it would
  // open its own WebSocket on the fixed default port 24678 and collide with any
  // other running instance.
  const httpServer = createServer(app);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  try {
    await listenWithFallback(httpServer, PORT);
  } catch (err: any) {
    console.error('[Server] Failed to start server:', err.message || err);
    process.exit(1);
  }
}

startServer();
