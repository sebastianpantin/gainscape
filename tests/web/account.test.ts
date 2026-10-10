import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_MESSAGES } from '../../web/src/lib/auth-links.ts';

const auth = vi.hoisted(() => ({
  currentEmail: 'new@example.com' as string | undefined,
  getUserError: null as { message: string; code?: string; status?: number } | null,
  signInError: null as { message: string; code?: string; status?: number } | null,
  signIns: [] as { email: string; password: string }[],
  updates: [] as unknown[],
  invokeError: null as unknown,
}));

vi.mock('../../web/src/lib/supabase.ts', () => ({
  supabase: {
    auth: {
      getUser: async () => ({
        data: { user: auth.getUserError ? null : { email: auth.currentEmail } },
        error: auth.getUserError,
      }),
      signInWithPassword: async (credentials: { email: string; password: string }) => {
        auth.signIns.push(credentials);
        return { data: {}, error: auth.signInError };
      },
      updateUser: async (attributes: unknown) => {
        auth.updates.push(attributes);
        return { data: {}, error: null };
      },
    },
    functions: {
      invoke: async () => ({ data: auth.invokeError ? null : { sessions: [] }, error: auth.invokeError }),
    },
  },
}));

const { changePassword, deleteMyAccount, exportMyData } = await import('../../web/src/lib/account.ts');

function httpFailure(status: number, body: object): FunctionsHttpError {
  return new FunctionsHttpError(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  auth.currentEmail = 'new@example.com';
  auth.getUserError = null;
  auth.signInError = null;
  auth.signIns = [];
  auth.updates = [];
  auth.invokeError = null;
});

describe('changePassword', () => {
  it('checks the current password against the email the auth server has now', async () => {
    await changePassword('current-password', 'new-password-123');
    expect(auth.signIns).toEqual([{ email: 'new@example.com', password: 'current-password' }]);
    expect(auth.updates).toEqual([{ password: 'new-password-123' }]);
  });

  it('says the current password is wrong only for invalid credentials', async () => {
    auth.signInError = { message: 'Invalid login credentials', code: 'invalid_credentials', status: 400 };
    await expect(changePassword('typo', 'new-password-123')).rejects.toThrow('Your current password is wrong.');
    expect(auth.updates).toEqual([]);
  });

  it('shows the auth error for a rate limit or an unconfirmed email instead of a wrong password', async () => {
    auth.signInError = { message: 'Request rate limit reached', code: 'over_request_rate_limit', status: 429 };
    await expect(changePassword('current-password', 'new-password-123')).rejects.toThrow('Request rate limit reached');
    auth.signInError = { message: 'Email not confirmed', code: 'email_not_confirmed', status: 400 };
    await expect(changePassword('current-password', 'new-password-123')).rejects.toThrow(
      AUTH_MESSAGES.emailNotConfirmed,
    );
    expect(auth.updates).toEqual([]);
  });

  it('stops with the auth error when the current user cannot be read', async () => {
    auth.getUserError = { message: 'Failed to fetch', status: 0 };
    await expect(changePassword('current-password', 'new-password-123')).rejects.toThrow('Failed to fetch');
    expect(auth.signIns).toEqual([]);
  });
});

describe('exportMyData', () => {
  it('says the export failed instead of showing a server error code or a network error', async () => {
    auth.invokeError = httpFailure(500, { error: 'internal_error' });
    await expect(exportMyData()).rejects.toThrow(/^Could not export your data\.$/);
    auth.invokeError = new FunctionsFetchError(new TypeError('Failed to fetch'));
    await expect(exportMyData()).rejects.toThrow(/^Could not export your data\.$/);
  });

  it('asks to wait when the export is rate limited', async () => {
    auth.invokeError = httpFailure(429, { error: 'rate_limited', details: { retryAfterSeconds: 20 } });
    await expect(exportMyData()).rejects.toThrow('Try again in');
  });
});

describe('deleteMyAccount', () => {
  it('explains a wrong confirmation or password', async () => {
    auth.invokeError = httpFailure(400, { error: 'wrong_password' });
    await expect(deleteMyAccount('me', 'typo')).rejects.toThrow('Your password is wrong.');
    auth.invokeError = httpFailure(400, { error: 'confirmation_mismatch' });
    await expect(deleteMyAccount('someone', 'pw')).rejects.toThrow("That isn't your username.");
  });

  it('says the account could not be deleted instead of showing a server error code', async () => {
    auth.invokeError = httpFailure(500, { error: 'internal_error' });
    await expect(deleteMyAccount('me', 'pw')).rejects.toThrow(/^Could not delete your account\.$/);
    auth.invokeError = httpFailure(503, { error: 'auth_unavailable' });
    await expect(deleteMyAccount('me', 'pw')).rejects.toThrow(/^Could not delete your account\.$/);
  });

  it('never reads an inherited object key as a reason', async () => {
    auth.invokeError = httpFailure(400, { error: 'toString' });
    await expect(deleteMyAccount('me', 'pw')).rejects.toThrow(/^Could not delete your account\.$/);
  });

  it('asks to wait when the auth check behind the deletion is rate limited', async () => {
    auth.invokeError = httpFailure(429, { error: 'auth_rate_limited' });
    await expect(deleteMyAccount('me', 'pw')).rejects.toThrow('Try again in');
  });
});
