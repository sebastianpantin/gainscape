import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { publishableKey } from './api-keys.ts';
import { bearerToken, HttpError } from './http.ts';

export const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

let tokenVerifier: SupabaseClient | undefined;

function verifier(): SupabaseClient {
  tokenVerifier ??= createClient(Deno.env.get('SUPABASE_URL')!, publishableKey(), clientOptions);
  return tokenVerifier;
}

export async function authenticatedUserId(request: Request): Promise<string> {
  const token = bearerToken(request);
  if (!token) throw new HttpError(401, 'missing_token');
  const { data, error } = await verifier().auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId || data?.claims?.role !== 'authenticated') throw new HttpError(401, 'invalid_token');
  return userId;
}
