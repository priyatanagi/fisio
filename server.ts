import express from 'express';
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

    if (provider === 'openai') {
      let url = testConfig.baseUrl?.trim() || 'https://api.openai.com/v1';
      url = url.replace(/\/+$/, '');
      const modelsUrl = `${url}/models`;
      
      const response = await fetch(modelsUrl, {
        headers: {
          Authorization: `Bearer ${testConfig.apiKey}`,
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

function listenWithFallback(port: number, attemptsLeft: number = MAX_PORT_ATTEMPTS): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = app.listen(port, '0.0.0.0', () => {
      console.log(`\n  Server ready - open in browser:  http://localhost:${port}\n  (bound to 0.0.0.0:${port}, reachable from other devices on your network)\n`);
      resolve(port);
    });

    server.once('error', (err: NodeJS.ErrnoException) => {
      server.close();
      if (err.code !== 'EADDRINUSE' || attemptsLeft <= 1) {
        return reject(err);
      }
      console.warn(`[Server] Port ${port} is in use, trying ${port + 1}...`);
      listenWithFallback(port + 1, attemptsLeft - 1).then(resolve, reject);
    });
  });
}

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
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
    await listenWithFallback(PORT);
  } catch (err: any) {
    console.error('[Server] Failed to start server:', err.message || err);
    process.exit(1);
  }
}

startServer();
