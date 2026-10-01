import { createClient } from '@supabase/supabase-js';
import { authStorageKey, needsAuthTimeout, REQUEST_TIMEOUT_MS } from './auth-restore.ts';

export { REQUEST_TIMEOUT_MS };

const sameOriginSupabaseProxy = `${window.location.origin}/sb`;

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? sameOriginSupabaseProxy;
export const AUTH_STORAGE_KEY = authStorageKey(supabaseUrl);

function fetchWithAuthTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.signal || input instanceof Request || !needsAuthTimeout(String(input))) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

export const supabase = createClient(supabaseUrl, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { storageKey: AUTH_STORAGE_KEY },
  global: { fetch: fetchWithAuthTimeout },
});
