import { AgentRunError, parseRunAgentRequest, runAgentStream } from '../src/server/handlers';
import { callProvider } from '../src/server/providers';
import { callOllamaChunked } from '../src/server/providers/ollama';
import { json, readJsonBody } from './_shared';

// A single generation can outlive the default 10s function budget; vercel.json
// raises maxDuration to the Hobby ceiling.
export default async function handler(req: Request): Promise<Response> {
  let request;
  try {
    request = parseRunAgentRequest(await readJsonBody(req));
  } catch (error) {
    const err =
      error instanceof AgentRunError
        ? error
        : new AgentRunError('Invalid run request', false, 400);
    return json({ ok: false, error: err.message }, err.status);
  }

  const encoder = new TextEncoder();
  let safeWrite: (chunk: string) => void = () => {};
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      safeWrite = (line: string) => {
        try {
          controller.enqueue(encoder.encode(line));
        } catch {
          // Client disconnected mid-run; the provider call finishes and the
          // remaining lines are dropped.
        }
      };
      void runAgentStream(request, { callProvider, callOllamaChunked }, safeWrite)
        .catch(() => {})
        .finally(() => {
          try {
            controller.close();
          } catch {
            // Already errored/closed — nothing further to do.
          }
        });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, must-revalidate',
      // Nginx on the platform buffers by default; ask it not to.
      'X-Accel-Buffering': 'no',
    },
  });
}
