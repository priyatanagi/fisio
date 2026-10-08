import {
  AgentRunError,
  parseRunAgentRequest,
  runAgentStream,
} from '../src/server/handlers';
import { callProvider } from '../src/server/providers';
import { callOllamaChunked } from '../src/server/providers/ollama';
import { bodyOf, sendJson, type NodeRes } from './_shared';

export default async function handler(req: { body?: unknown }, res: NodeRes): Promise<void> {
  let request;
  try {
    request = parseRunAgentRequest(bodyOf(req));
  } catch (error) {
    // Nothing has executed yet, so a request-shape problem is a plain JSON 400.
    const err =
      error instanceof AgentRunError
        ? error
        : new AgentRunError('Invalid run request', false, 400);
    return sendJson(res, err.status, { ok: false, error: err.message });
  }

  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, must-revalidate');
  // Ask the platform's proxy not to buffer, or the events arrive only at the end.
  res.setHeader('X-Accel-Buffering', 'no');
  res.status(200);

  await runAgentStream(request, { callProvider, callOllamaChunked }, (line) => {
    try {
      res.write(line);
    } catch {
      // Client went away mid-run; the provider call finishes and the remaining
      // lines are dropped.
    }
  });
  res.end();
}
