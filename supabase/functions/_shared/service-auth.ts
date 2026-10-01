import { bearerToken, HttpError } from './http.ts';

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function assertServiceRole(request: Request): Promise<void> {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const presented = bearerToken(request) ?? '';
  if (!serviceRoleKey || !sameBytes(await sha256(presented), await sha256(serviceRoleKey))) {
    throw new HttpError(403, 'service_role_required');
  }
}
