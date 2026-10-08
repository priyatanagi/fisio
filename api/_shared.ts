/**
 * Vercel Edge/Node function adapters. Each file in `api/` becomes a route at
 * the same path, so these stay deliberately thin: they translate Web-standard
 * Request/Response to the same framework-agnostic handler cores the Express
 * app uses (src/server/handlers.ts). One logic, two transports.
 */
export function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, must-revalidate',
    },
  });
}

export async function readJsonBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
