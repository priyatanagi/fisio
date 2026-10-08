/**
 * Vercel function adapters. Each file in `api/` becomes a route at the same
 * path, and each one is a Node-runtime handler: it takes the parsed request and
 * answers through `res`, then delegates every decision to the same
 * framework-agnostic cores the Express app uses (src/server/handlers.ts).
 * One logic, two transports.
 */

/** `any` on purpose: the Node runtime types live in @vercel/node, which this
 *  project does not depend on, and the sandbox cannot resolve ambient types. */
export interface NodeRes {
  status(code: number): NodeRes;
  setHeader(name: string, value: string): NodeRes;
  json(payload: unknown): void;
  write(chunk: string): boolean;
  end(): void;
}

const NO_STORE = 'no-store, must-revalidate';

export function sendJson(res: NodeRes, status: number, payload: unknown): void {
  res.setHeader('Cache-Control', NO_STORE);
  res.status(status).json(payload);
}

/** Vercel parses JSON bodies for Node functions; a bad body arrives as undefined. */
export function bodyOf(req: { body?: unknown }): unknown {
  return req.body;
}
