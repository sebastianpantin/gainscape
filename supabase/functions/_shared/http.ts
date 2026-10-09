export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Expose-Headers': 'retry-after',
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
  }
}

export function bearerToken(request: Request): string | undefined {
  return request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

function retryAfterHeader(error: HttpError): Record<string, string> {
  const retryAfterSeconds = (error.details as { retryAfterSeconds?: unknown } | undefined)?.retryAfterSeconds;
  if (error.status !== 429 || typeof retryAfterSeconds !== 'number') return {};
  return { 'Retry-After': String(retryAfterSeconds) };
}

export function logUnexpectedError(error: unknown): void {
  console.error(error);
}

export function errorResponse(error: unknown): Response {
  if (error instanceof HttpError) {
    return jsonResponse({ error: error.code, details: error.details }, error.status, retryAfterHeader(error));
  }
  logUnexpectedError(error);
  return jsonResponse({ error: 'internal_error' }, 500);
}

export async function readJsonBody(request: Request): Promise<unknown> {
  return await request.json().catch(() => {
    throw new HttpError(400, 'invalid_json');
  });
}
