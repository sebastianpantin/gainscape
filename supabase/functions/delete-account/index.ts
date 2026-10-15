import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';
import { z } from 'npm:zod@4.6.5';
import { publishableKey, secretKey } from '../_shared/api-keys.ts';
import { clientOptions } from '../_shared/auth.ts';
import { sql } from '../_shared/db.ts';
import { HttpError } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serveAuthenticated } from '../_shared/serve-authenticated.ts';
import { parseOr422 } from '../_shared/session-payload.ts';
import { authServiceFailure, passwordMatchesAfterSignIn } from './password-check.ts';

const deleteAccountSchema = z
  .object({ confirmUsername: z.string().min(1).max(40), password: z.string().min(1).max(200) })
  .strict();

type DeleteAccountPayload = z.infer<typeof deleteAccountSchema>;

let adminClient: SupabaseClient | undefined;

function admin(): SupabaseClient {
  adminClient ??= createClient(Deno.env.get('SUPABASE_URL')!, secretKey(), clientOptions);
  return adminClient;
}

async function passwordMatches(email: string, password: string): Promise<boolean> {
  const verifier = createClient(Deno.env.get('SUPABASE_URL')!, publishableKey(), clientOptions);
  const { data, error } = await verifier.auth.signInWithPassword({ email, password });
  if (data.session) await verifier.auth.signOut({ scope: 'local' });
  return passwordMatchesAfterSignIn(error, data.session !== null);
}

async function deleteAccount(
  userId: string,
  { confirmUsername, password }: DeleteAccountPayload,
): Promise<{ deleted: true }> {
  await takeRateLimit(sql, 'delete_account_hour', userId);
  const [account] = await sql`
    select p.username, u.email
    from public.profiles p join auth.users u on u.id = p.id
    where p.id = ${userId}`;
  if (!account) throw new HttpError(404, 'profile_not_found');
  if (account.username !== confirmUsername.trim().toLowerCase()) throw new HttpError(403, 'confirmation_mismatch');
  if (!account.email || !(await passwordMatches(account.email, password))) throw new HttpError(403, 'wrong_password');
  const { error } = await admin().auth.admin.deleteUser(userId);
  if (error) throw authServiceFailure(error);
  return { deleted: true };
}

serveAuthenticated((body) => parseOr422(deleteAccountSchema, body), deleteAccount);
