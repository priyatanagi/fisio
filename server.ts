import { createServer, type Server } from 'node:http';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { randomUUID } from 'node:crypto';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createApp, type ServerIdentity } from './src/server/app.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// Identity of this process. `instance` is what makes two dev servers on the
// same machine tellable apart at a glance: both answer /api/health, but they
// report different ports and different instance tags.
const INSTANCE = randomUUID().slice(0, 4).toUpperCase();
const STARTED_AT = new Date().toISOString();
let boundPort = PORT;

const identity: ServerIdentity = {
  instance: INSTANCE,
  startedAt: STARTED_AT,
  getPort: () => boundPort,
};

const app = createApp(identity);

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
      if (err.code === 'EADDRINUSE' && attemptsLeft > 1) {
        console.warn(`[Server] Port ${port} is in use (another app owns it), trying ${port + 1}...`);
        listenWithFallback(server, port + 1, attemptsLeft - 1).then(resolve, reject);
        return;
      }
      reject(err);
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
    await listenWithFallback(httpServer, PORT);
  } catch (err: any) {
    console.error('[Server] Failed to start server:', err.message || err);
    process.exit(1);
  }
}

startServer();
