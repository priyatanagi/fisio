import express from 'express';
import { createServer, type Server } from 'node:http';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { callProvider, cleanJsonOutput } from './src/server/providers.js';
import { ProviderConfig } from './src/types/provider.js';
import { validateRoleOutput, buildRepairPrompt } from './src/server/roleSchemas.js';
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

const DEFAULT_PORT = 3000;
const MAX_PORT_ATTEMPTS = 10;

const PORT: number = (() => {
  const raw = process.env.PORT;
  if (!raw || !raw.trim()) return DEFAULT_PORT;
  const parsed = Number.parseInt(raw.trim(), 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    console.warn(`[Server] Invalid PORT="${raw}", falling back to ${DEFAULT_PORT}.`);
    return DEFAULT_PORT;
  }
  return parsed;
})();

app.use(express.json({ limit: '25mb' }));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
});

// Test connection endpoint for any provider
app.post('/api/test-provider', async (req, res) => {
  try {
    const { provider = 'gemini', model, apiKey, baseUrl } = req.body;
    const testConfig: ProviderConfig = { provider, model, apiKey, baseUrl };

    if (provider === 'ollama') {
      const url = (
        testConfig.baseUrl?.trim() ||
        process.env.OLLAMA_BASE_URL ||
        'http://localhost:11434'
      ).replace(/\/+$/, '');

      const response = await fetch(`${url}/api/tags`);
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Ollama returned status ${response.status}: ${errText}`);
      }

      const data = await response.json();
      const names: string[] = (data.models ?? []).map((m: any) => m.name);
      const requested = testConfig.model?.trim();
      const missing = requested && !names.includes(requested);

      return res.json({
        success: true,
        message: missing
          ? `Ollama is reachable at ${url}, but model "${requested}" is not pulled. Available: ${names.join(', ') || 'none'}.`
          : `Successfully connected! Found ${names.length} local model(s): ${names.join(', ')}.`,
      });
    }

    if (provider === 'openai') {
      const apiKey = testConfig.apiKey?.trim() || process.env.OPENAI_API_KEY?.trim();
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not configured in server environment or provider settings.');
      }
      const urlBase =
        testConfig.baseUrl?.trim() ||
        process.env.OPENAI_BASE_URL ||
        'https://api.openai.com/v1';
      const modelsUrl = `${urlBase.replace(/\/+$/, '')}/models`;

      const response = await fetch(modelsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
        }
      });
      
      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenAI-compatible endpoint returned status ${response.status}: ${errText}`);
      }
      
      const data = await response.json();
      const modelsCount = data.data ? data.data.length : 0;
      
      return res.json({
        success: true,
        message: `Successfully connected! Found ${modelsCount} models. Base URL & API Key are valid.`,
      });
    }

    const testPrompt = 'Respond strictly with valid JSON: {"status": "ok", "message": "connection successful"}';

    const result = await callProvider(testPrompt, testConfig);

    const cleaned = cleanJsonOutput(result);
    JSON.parse(cleaned);

    return res.json({
      success: true,
      message: `Successfully connected to ${provider.toUpperCase()} (${model || 'default'})!`,
    });
  } catch (error: any) {
    return res.status(400).json({
      success: false,
      error: error.message || 'Connection test failed',
    });
  }
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
  try {
    const { role, input = {}, userProfile, providerConfig } = req.body;

    if (!role) return res.status(400).json({ ok: false, error: 'role is required' });
    if (!providerConfig?.provider) {
      return res.status(400).json({ ok: false, error: 'providerConfig is required' });
    }
    if (!userProfile) {
      return res.status(400).json({ ok: false, error: 'userProfile is required' });
    }

    const prompt = promptForRole(role, input, userProfile);

    let raw = await callProvider(prompt, providerConfig);
    let result = validateRoleOutput(role as any, raw);

    // One repair attempt for shape problems. Transport failures already
    // exhausted the 429 ladder inside callProvider, so this is the only extra
    // call a bad response can cost.
    if (!result.ok) {
      console.warn(`[run-agent] ${role} returned invalid output, repairing:`, result.error);
      raw = await callProvider(buildRepairPrompt(role as any, raw), providerConfig);
      result = validateRoleOutput(role as any, raw);
    }

    if (!result.ok) {
      return res.status(502).json({ ok: false, error: result.error, recoverable: false });
    }
    return res.json({ ok: true, data: result.data });
  } catch (error: any) {
    console.error('[run-agent] failed:', error);
    return res.status(502).json({
      ok: false,
      error: error?.message || 'Agent call failed',
      recoverable: error?.recoverable === true,
    });
  }
});

function listenWithFallback(
  port: number,
  server: Server,
  attemptsLeft: number = MAX_PORT_ATTEMPTS
): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    server.once('listening', () => {
      console.log(`\n  Server ready - open in browser:  http://localhost:${port}\n  (bound to 0.0.0.0:${port}, reachable from other devices on your network)\n`);
      resolve(port);
    });

    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EADDRINUSE' || attemptsLeft <= 1) {
        return reject(err);
      }
      console.warn(`[Server] Port ${port} is in use, trying ${port + 1}...`);
      listenWithFallback(port + 1, server, attemptsLeft - 1).then(resolve, reject);
    });
    server.listen(port, '0.0.0.0');
  });
}

async function startServer() {
  const httpServer = createServer(app);
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
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
    await listenWithFallback(PORT, httpServer);
  } catch (err: any) {
    console.error('[Server] Failed to start server:', err.message || err);
    process.exit(1);
  }
}

startServer();
