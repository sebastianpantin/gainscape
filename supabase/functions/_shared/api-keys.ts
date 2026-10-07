import { HttpError } from './http.ts';

function defaultKey(variable: string, shape: RegExp): string {
  let keys: unknown;
  try {
    keys = JSON.parse(Deno.env.get(variable) ?? 'null');
  } catch {
    keys = null;
  }
  const key = typeof keys === 'object' && keys !== null ? (keys as Record<string, unknown>).default : undefined;
  if (typeof key !== 'string' || !shape.test(key)) throw new HttpError(500, 'api_key_missing');
  return key;
}

export function secretKey(): string {
  return defaultKey('SUPABASE_SECRET_KEYS', /^sb_secret_[A-Za-z0-9_-]{16,}$/);
}

export function publishableKey(): string {
  return defaultKey('SUPABASE_PUBLISHABLE_KEYS', /^sb_publishable_[A-Za-z0-9_-]{16,}$/);
}
