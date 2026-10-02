import { authenticatedUserId } from './auth.ts';
import { asHttpError } from './http-errors.ts';
import { corsHeaders, errorResponse, HttpError, jsonResponse, readJsonBody } from './http.ts';

export function serve(
  handler: (request: Request) => Promise<Response>,
  mapError: (error: unknown) => unknown = (error) => error,
): void {
  Deno.serve(async (request) => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
    try {
      if (request.method !== 'POST') throw new HttpError(405, 'method_not_allowed');
      return await handler(request);
    } catch (error) {
      return errorResponse(mapError(error));
    }
  });
}

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
