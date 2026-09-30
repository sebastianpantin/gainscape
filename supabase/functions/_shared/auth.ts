import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { HttpError } from './http.ts';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function authenticatedUserId(request: Request): Promise<string> {
  const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'missing_token');
  const { data, error } = await supabase.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId || data?.claims?.role !== 'authenticated') throw new HttpError(401, 'invalid_token');
  return userId;
}
