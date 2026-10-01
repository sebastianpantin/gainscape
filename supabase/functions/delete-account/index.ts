import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { z } from 'npm:zod@4.6.5';
import { authenticatedUserId, clientOptions } from '../_shared/auth.ts';
import { sql } from '../_shared/db.ts';
import { HttpError, jsonResponse } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serve } from '../_shared/serve.ts';

const bodySchema = z.object({ confirmUsername: z.string().min(1).max(40), password: z.string().min(1).max(200) });

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, clientOptions);

async function passwordMatches(email: string, password: string): Promise<boolean> {
  const verifier = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, clientOptions);
  const { data, error } = await verifier.auth.signInWithPassword({ email, password });
  if (data.session) await verifier.auth.signOut({ scope: 'local' });
  return !error && data.session !== null;
}

async function deleteAccount(userId: string, confirmUsername: string, password: string): Promise<void> {
  await takeRateLimit(sql, 'delete_account_hour', userId);
  const [account] = await sql`
    select p.username, u.email
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = ${userId}`;
  if (!account) throw new HttpError(404, 'profile_not_found');
  if (account.username !== confirmUsername.trim().toLowerCase()) throw new HttpError(403, 'confirmation_mismatch');
  if (!account.email || !(await passwordMatches(account.email, password))) throw new HttpError(403, 'wrong_password');
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
}

serve(async (request) => {
  const userId = await authenticatedUserId(request);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(422, 'invalid_body');
  await deleteAccount(userId, parsed.data.confirmUsername, parsed.data.password);
  return jsonResponse({ deleted: true });
});
