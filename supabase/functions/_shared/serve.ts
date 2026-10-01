import { corsHeaders, errorResponse, HttpError } from './http.ts';

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
