import { handleTestProvider } from '../src/server/handlers';
import { bodyOf, sendJson, type NodeRes } from './_shared';

export default async function handler(req: { body?: unknown }, res: NodeRes): Promise<void> {
  const result = await handleTestProvider(bodyOf(req));
  sendJson(res, result.status, result.payload);
}
