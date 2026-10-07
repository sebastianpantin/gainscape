import { secretKey } from './api-keys.ts';
import { HttpError } from './http.ts';

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function assertSecretKey(request: Request): Promise<void> {
  const expected = await sha256(secretKey());
  if (!sameBytes(await sha256(request.headers.get('apikey') ?? ''), expected)) {
    throw new HttpError(403, 'secret_key_required');
  }
}
