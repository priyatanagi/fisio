import { handleTestProvider } from '../src/server/handlers';
import { json, readJsonBody } from './_shared';

export default async function handler(req: Request): Promise<Response> {
  const result = await handleTestProvider(await readJsonBody(req));
  return json(result.payload, result.status);
}
