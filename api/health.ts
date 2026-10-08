import { json } from './_shared';

// pid/port/instance from the local Express health route are meaningless per
// request here, so the serverless answer stays minimal.
export default function handler(req: Request): Response {
  return json({
    status: 'ok',
    app: 'Fisio Architect',
    hasKey: Boolean(process.env.GEMINI_API_KEY),
    time: new Date().toISOString(),
  });
}
