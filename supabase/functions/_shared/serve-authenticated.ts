import { authenticatedUserId } from './auth.ts';
import { asHttpError } from './http-errors.ts';
import { jsonResponse, readJsonBody } from './http.ts';
import { serve } from './serve.ts';

export function serveAuthenticated<Payload>(
  parse: (body: unknown) => Payload,
  handle: (userId: string, payload: Payload) => Promise<unknown>,
): void {
  serve(async (request) => {
    const userId = await authenticatedUserId(request);
    const payload = parse(await readJsonBody(request));
    return jsonResponse(await handle(userId, payload));
  }, asHttpError);
}
