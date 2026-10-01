import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import { AUTH_MESSAGES, authErrorMessage, parseAuthCallback } from '../../web/src/lib/auth-links.ts';
import { createTestUser, db, env } from './local-stack.ts';
import { authLinkFrom, listEmailsTo, waitForEmail } from './mailbox.ts';

const SITE_ORIGIN = 'https://localhost:5173';
const CALLBACK = `${SITE_ORIGIN}/auth/confirm`;
const CONFIRM_SUBJECT = 'Confirm your Gainscape account';
const RECOVERY_SUBJECT = 'Reset your Gainscape password';
const EMAIL_CHANGE_SUBJECT = 'Confirm your new Gainscape email';
const PASSWORD = 'correct-horse-battery';
const MAX_FREQUENCY_WAIT_MS = 1_500;

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

function freshClient(): SupabaseClient {
  return createClient(env.API_URL, env.ANON_KEY, clientOptions);
}

function freshIdentity(prefix = 'ae') {
  const username = `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 14)}`;
  return { username, email: `${username}@example.test` };
}

async function signUp(
  client: SupabaseClient,
  identity: { username: string; email: string },
  emailRedirectTo = CALLBACK,
  password = PASSWORD,
) {
  return await client.auth.signUp({
    email: identity.email,
    password,
    options: { emailRedirectTo, data: { username: identity.username, timezone: 'UTC' } },
  });
}

function tokenOf(link: string) {
  const callback = parseAuthCallback(link);
  if (!callback) throw new Error(`Not an auth link: ${link}`);
  return callback;
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

afterAll(async () => {
  await db.end();
});

describe('signup confirmation', () => {
  it('sends a confirmation link and signs in only after it is verified', async () => {
    const identity = freshIdentity();
    const since = new Date();
    const client = freshClient();
    const signedUp = await signUp(client, identity);
    expect(signedUp.error).toBeNull();
    expect(signedUp.data.session).toBeNull();

    const message = await waitForEmail(identity.email, { subject: CONFIRM_SUBJECT, since });
    const link = authLinkFrom(message);
    expect(link.startsWith(`${CALLBACK}?token_hash=`)).toBe(true);
    expect(tokenOf(link).type).toBe('email');
    expect(await listEmailsTo(identity.email, since, CONFIRM_SUBJECT)).toHaveLength(1);

    const early = await freshClient().auth.signInWithPassword({ email: identity.email, password: PASSWORD });
    expect(early.error?.code).toBe('email_not_confirmed');
    expect(authErrorMessage(early.error!)).toBe(AUTH_MESSAGES.emailNotConfirmed);

    const verified = await client.auth.verifyOtp({ token_hash: tokenOf(link).tokenHash, type: 'email' });
    expect(verified.error).toBeNull();
    expect(verified.data.session).not.toBeNull();
    const chosen = await client.auth.updateUser({ password: 'a-chosen-password' });
    expect(chosen.error).toBeNull();

    const later = await freshClient().auth.signInWithPassword({ email: identity.email, password: 'a-chosen-password' });
    expect(later.error).toBeNull();
    const [profile] = await db`select username from public.profiles where id = ${later.data.user!.id}`;
    expect(profile.username).toBe(identity.username);
  });

  it('keeps loopback origins and falls back to site_url for LAN addresses and any other host', async () => {
    const loopback = freshIdentity();
    const loopbackSince = new Date();
    await signUp(freshClient(), loopback, 'https://127.0.0.1:5173/auth/confirm');
    const loopbackLink = authLinkFrom(
      await waitForEmail(loopback.email, { subject: CONFIRM_SUBJECT, since: loopbackSince }),
    );
    expect(loopbackLink.startsWith('https://127.0.0.1:5173/auth/confirm?token_hash=')).toBe(true);

    const redirects = [
      'https://192.168.1.20:5173/auth/confirm',
      'https://10.0.0.5:5173/auth/confirm',
      'https://evil.test/x',
      'https://a.b.evil.test:443/x',
      'https://192.168.evil.test:443/x',
      'https://10.a.b.evil.test:443/x',
      'https://localhost:x@3627733341/',
      'https://localhost.evil.test/x',
    ];
    for (const redirect of redirects) {
      const identity = freshIdentity();
      const since = new Date();
      await signUp(freshClient(), identity, redirect);
      const link = authLinkFrom(await waitForEmail(identity.email, { subject: CONFIRM_SUBJECT, since }));
      expect(new URL(link).origin).toBe(SITE_ORIGIN);
      expect(parseAuthCallback(link)?.type).toBe('email');
    }
  });

  it('resends a working confirmation link', async () => {
    const identity = freshIdentity();
    const client = freshClient();
    const firstSince = new Date();
    await signUp(client, identity);
    await waitForEmail(identity.email, { subject: CONFIRM_SUBJECT, since: firstSince });
    await pause(MAX_FREQUENCY_WAIT_MS);

    const since = new Date();
    const resent = await client.auth.resend({
      type: 'signup',
      email: identity.email,
      options: { emailRedirectTo: CALLBACK },
    });
    expect(resent.error).toBeNull();
    const link = authLinkFrom(await waitForEmail(identity.email, { subject: CONFIRM_SUBJECT, since }));
    const verified = await client.auth.verifyOtp({ token_hash: tokenOf(link).tokenHash, type: 'email' });
    expect(verified.error).toBeNull();
    expect(verified.data.session).not.toBeNull();
  });

  it('maps a used or garbage token hash to the invalid-link message', async () => {
    const identity = freshIdentity();
    const client = freshClient();
    const since = new Date();
    await signUp(client, identity);
    const { tokenHash } = tokenOf(
      authLinkFrom(await waitForEmail(identity.email, { subject: CONFIRM_SUBJECT, since })),
    );
    expect((await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' })).error).toBeNull();

    const reused = await freshClient().auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    expect(authErrorMessage(reused.error!)).toBe(AUTH_MESSAGES.invalidLink);
    const garbage = await freshClient().auth.verifyOtp({ token_hash: 'not-a-real-token', type: 'recovery' });
    expect(authErrorMessage(garbage.error!)).toBe(AUTH_MESSAGES.invalidLink);
  });
});

describe('account pre-hijack', () => {
  it('rotates the squatter password on confirmation and lets the owner pick a username', async () => {
    const victim = freshIdentity('vi');
    const squatter = { username: freshIdentity('sq').username, email: victim.email };
    const squatted = await signUp(freshClient(), squatter, CALLBACK, 'squatter-password');
    expect(squatted.error).toBeNull();
    await pause(MAX_FREQUENCY_WAIT_MS);
    const since = new Date();
    const victimClient = freshClient();
    const again = await signUp(victimClient, victim, CALLBACK, 'victim-password');
    expect(again.error).toBeNull();

    const [row] = await db`
      select p.username from public.profiles p join auth.users u on u.id = p.id where u.email = ${victim.email}`;
    expect(row.username).toBe(squatter.username);

    const link = authLinkFrom(await waitForEmail(victim.email, { subject: CONFIRM_SUBJECT, since }));
    const verified = await victimClient.auth.verifyOtp({ token_hash: tokenOf(link).tokenHash, type: 'email' });
    expect(verified.error).toBeNull();

    for (const guess of ['squatter-password', 'victim-password']) {
      const attempt = await freshClient().auth.signInWithPassword({ email: victim.email, password: guess });
      expect(attempt.error?.code).toBe('invalid_credentials');
    }

    expect((await victimClient.auth.updateUser({ password: 'victim-final-password' })).error).toBeNull();
    const renamed = await victimClient.rpc('change_username', { candidate: victim.username });
    expect(renamed.error).toBeNull();
    expect(renamed.data).toEqual({ status: 'ok', username: victim.username });

    const signedIn = await freshClient().auth.signInWithPassword({
      email: victim.email,
      password: 'victim-final-password',
    });
    expect(signedIn.error).toBeNull();
    const [profile] = await db`select username, display_name from public.profiles where id = ${signedIn.data.user!.id}`;
    expect(profile).toEqual({ username: victim.username, display_name: victim.username });
  });

  it('refuses taken, invalid and late username changes', async () => {
    const identity = freshIdentity();
    const client = freshClient();
    const since = new Date();
    await signUp(client, identity);
    const { tokenHash } = tokenOf(
      authLinkFrom(await waitForEmail(identity.email, { subject: CONFIRM_SUBJECT, since })),
    );
    const verified = await client.auth.verifyOtp({ token_hash: tokenHash, type: 'email' });
    expect(verified.error).toBeNull();
    const other = await createTestUser();

    expect((await client.rpc('change_username', { candidate: other.username })).data).toEqual({ status: 'taken' });
    expect((await client.rpc('change_username', { candidate: 'No Spaces!' })).data).toEqual({ status: 'invalid' });
    expect((await client.rpc('change_username', { candidate: identity.username })).data).toEqual({
      status: 'ok',
      username: identity.username,
    });

    await db`update auth.users set email_confirmed_at = now() - interval '2 hours' where email = ${identity.email}`;
    const late = await client.rpc('change_username', { candidate: freshIdentity().username });
    expect(late.data).toEqual({ status: 'closed' });
    expect((await freshClient().rpc('change_username', { candidate: 'anyone_at_all' })).error).not.toBeNull();
  });

  it('keeps the password of users created already confirmed', async () => {
    const user = await createTestUser();
    const [row] = await db`select email from auth.users where id = ${user.id}`;
    const again = await freshClient().auth.signInWithPassword({ email: row.email, password: PASSWORD });
    expect(again.error).toBeNull();
  });
});

describe('password recovery', () => {
  it('sends a reset link that lets the user set a new password', async () => {
    const user = await createTestUser();
    const [{ email }] = await db`select email from auth.users where id = ${user.id}`;
    const client = freshClient();
    const since = new Date();
    expect((await client.auth.resetPasswordForEmail(email, { redirectTo: CALLBACK })).error).toBeNull();

    const link = authLinkFrom(await waitForEmail(email, { subject: RECOVERY_SUBJECT, since }));
    expect(tokenOf(link).type).toBe('recovery');
    const verified = await client.auth.verifyOtp({ token_hash: tokenOf(link).tokenHash, type: 'recovery' });
    expect(verified.error).toBeNull();
    expect(verified.data.session).not.toBeNull();
    expect((await client.auth.updateUser({ password: 'recovered-password' })).error).toBeNull();

    const old = await freshClient().auth.signInWithPassword({ email, password: PASSWORD });
    expect(old.error?.code).toBe('invalid_credentials');
    const fresh = await freshClient().auth.signInWithPassword({ email, password: 'recovered-password' });
    expect(fresh.error).toBeNull();
  });

  it('answers an unknown email without an error and sends nothing', async () => {
    const { email } = freshIdentity('nobody');
    const since = new Date();
    expect((await freshClient().auth.resetPasswordForEmail(email, { redirectTo: CALLBACK })).error).toBeNull();
    await pause(2_000);
    expect(await listEmailsTo(email, since)).toHaveLength(0);
  });
});

describe('secure password change', () => {
  it('lets a fresh session change the password', async () => {
    const user = await createTestUser();
    expect((await user.client.auth.updateUser({ password: 'changed-in-session' })).error).toBeNull();
    const [{ email }] = await db`select email from auth.users where id = ${user.id}`;
    const signedIn = await freshClient().auth.signInWithPassword({ email, password: 'changed-in-session' });
    expect(signedIn.error).toBeNull();
  });
});

describe('email change', () => {
  it('needs both addresses to confirm before the email changes', async () => {
    const user = await createTestUser();
    const [{ email: oldEmail }] = await db`select email from auth.users where id = ${user.id}`;
    const { email: newEmail } = freshIdentity('moved');
    const since = new Date();
    const requested = await user.client.auth.updateUser({ email: newEmail }, { emailRedirectTo: CALLBACK });
    expect(requested.error).toBeNull();

    const toOld = authLinkFrom(await waitForEmail(oldEmail, { subject: EMAIL_CHANGE_SUBJECT, since }));
    const toNew = authLinkFrom(await waitForEmail(newEmail, { subject: EMAIL_CHANGE_SUBJECT, since }));
    expect(tokenOf(toOld).type).toBe('email_change');
    expect(tokenOf(toNew).type).toBe('email_change');

    const first = await freshClient().auth.verifyOtp({ token_hash: tokenOf(toOld).tokenHash, type: 'email_change' });
    expect(first.error).toBeNull();
    const [halfway] = await db`select email from auth.users where id = ${user.id}`;
    expect(halfway.email).toBe(oldEmail);

    const second = await freshClient().auth.verifyOtp({ token_hash: tokenOf(toNew).tokenHash, type: 'email_change' });
    expect(second.error).toBeNull();
    const [after] = await db`select email from auth.users where id = ${user.id}`;
    expect(after.email).toBe(newEmail);
    const signedIn = await freshClient().auth.signInWithPassword({ email: newEmail, password: PASSWORD });
    expect(signedIn.error).toBeNull();
  });
});
