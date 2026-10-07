import { createClient } from '@supabase/supabase-js';
import { authStorageKey, needsAuthTimeout, REQUEST_TIMEOUT_MS, storedSessionFrom } from './auth-restore.ts';

const sameOriginSupabaseProxy = `${window.location.origin}/sb`;

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? sameOriginSupabaseProxy;
export const AUTH_STORAGE_KEY = authStorageKey(supabaseUrl);

export function readStoredSession() {
  try {
    return storedSessionFrom(localStorage.getItem(AUTH_STORAGE_KEY));
  } catch {
    return null;
  }
}

function fetchWithAuthTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.signal || input instanceof Request || !needsAuthTimeout(String(input))) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

export const supabase = createClient(supabaseUrl, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: { storageKey: AUTH_STORAGE_KEY },
  global: { fetch: fetchWithAuthTimeout },
});
