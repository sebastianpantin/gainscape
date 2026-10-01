import { createClient } from '@supabase/supabase-js';

export const REQUEST_TIMEOUT_MS = 20_000;

const AUTH_PATH = '/auth/v1/';
const sameOriginSupabaseProxy = `${window.location.origin}/sb`;

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? sameOriginSupabaseProxy;

function fetchWithAuthTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (init?.signal || input instanceof Request || !String(input).includes(AUTH_PATH)) return fetch(input, init);
  return fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

export const supabase = createClient(supabaseUrl, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  global: { fetch: fetchWithAuthTimeout },
});
