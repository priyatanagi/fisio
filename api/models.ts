import { handleModels } from '../src/server/handlers';
import { json, readJsonBody } from './_shared';

export default async function handler(req: Request): Promise<Response> {
  const result = await handleModels(await readJsonBody(req));
  return json(result.payload, result.status);
}
