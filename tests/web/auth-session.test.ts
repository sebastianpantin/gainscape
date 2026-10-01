import { AuthApiError, AuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUTH_FALLBACK_MS,
  type AuthState,
  authStorageKey,
  bootAuth,
  forceSignedOut,
  type GetSessionResult,
  needsAuthTimeout,
  onForcedSignOut,
  signOutOnThisDevice,
  storedSessionFrom,
} from '../../web/src/lib/auth-restore.ts';

const nowInSeconds = () => Math.floor(Date.now() / 1000);

const storedRaw = JSON.stringify({
  access_token: 'expired-access-token',
  refresh_token: 'refresh-token',
  expires_at: nowInSeconds() - 60,
  expires_in: 3600,
  token_type: 'bearer',
  user: { id: '11111111-1111-4111-8111-111111111111', email: 'lifter@example.test' },
});

function boot(result: Promise<GetSessionResult>, options: { stored?: string | null; online?: boolean } = {}) {
  const states: AuthState[] = [];
  const control = bootAuth({
    getSession: () => result,
    storedSession: () => storedSessionFrom(options.stored === undefined ? storedRaw : options.stored),
    isOnline: () => options.online ?? true,
    setState: (state) => states.push(state),
  });
  return { states, control, latest: () => states.at(-1) };
}

const noSession = (error: unknown): Promise<GetSessionResult> => Promise.resolve({ data: { session: null }, error });

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('offline auth restore', () => {
  it('keeps an expired stored session signed in offline when the refresh is retryable', async () => {
    const { latest } = boot(noSession(new AuthRetryableFetchError('Failed to fetch', 0)));
    await vi.runAllTimersAsync();
    expect(latest()).toMatchObject({
      status: 'signed-in',
      offline: true,
      session: { user: { id: '11111111-1111-4111-8111-111111111111', email: 'lifter@example.test' } },
    });
  });

  it('keeps the stored session when the browser is offline even without a retryable error', async () => {
    const { latest } = boot(noSession(null), { online: false });
    await vi.runAllTimersAsync();
    expect(latest()).toMatchObject({ status: 'signed-in', offline: true });
  });

  it('is signed out when nothing is stored', async () => {
    const { latest } = boot(noSession(new AuthRetryableFetchError('Failed to fetch', 0)), { stored: null });
    await vi.runAllTimersAsync();
    expect(latest()).toEqual({ status: 'signed-out' });
  });

  it('is signed out on an AuthApiError', async () => {
    const { latest } = boot(noSession(new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found')));
    await vi.runAllTimersAsync();
    expect(latest()).toEqual({ status: 'signed-out' });
  });

  it('ignores a stored session whose user id is not a uuid', async () => {
    const stored = JSON.stringify({ ...JSON.parse(storedRaw), user: { id: 'not-a-uuid', email: 'x@example.test' } });
    const { latest } = boot(noSession(new AuthRetryableFetchError('Failed to fetch', 0)), { stored });
    await vi.runAllTimersAsync();
    expect(latest()).toEqual({ status: 'signed-out' });
  });

  it('ignores a malformed stored session', async () => {
    const { latest } = boot(noSession(new AuthRetryableFetchError('Failed to fetch', 0)), {
      stored: '{"access_token":1}',
    });
    await vi.runAllTimersAsync();
    expect(latest()).toEqual({ status: 'signed-out' });
  });

  it('names the storage key after the first hostname label', () => {
    expect(authStorageKey('https://localhost:5173/sb')).toBe('sb-localhost-auth-token');
    expect(authStorageKey('https://abcdefgh.supabase.co')).toBe('sb-abcdefgh-auth-token');
  });
});

describe('auth fallback on a weak signal', () => {
  it('renders from the stored session when getSession has not resolved within the fallback time', async () => {
    const { latest } = boot(new Promise<GetSessionResult>(() => undefined));
    await vi.advanceTimersByTimeAsync(AUTH_FALLBACK_MS - 1);
    expect(latest()).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(latest()).toMatchObject({ status: 'signed-in', offline: true });
  });

  it('replaces the fallback once getSession resolves with a fresh session', async () => {
    let resolve: (result: GetSessionResult) => void = () => undefined;
    const { latest } = boot(new Promise<GetSessionResult>((done) => (resolve = done)));
    await vi.advanceTimersByTimeAsync(AUTH_FALLBACK_MS);
    const fresh = { ...JSON.parse(storedRaw), access_token: 'fresh' } as Session;
    resolve({ data: { session: fresh }, error: null });
    await vi.runAllTimersAsync();
    expect(latest()).toEqual({ status: 'signed-in', session: fresh, offline: false });
  });

  it('does not fall back once an auth event already delivered a session', async () => {
    const { latest, control, states } = boot(new Promise<GetSessionResult>(() => undefined));
    const fresh = { ...JSON.parse(storedRaw), access_token: 'fresh' } as Session;
    control.onAuthEvent('SIGNED_IN', fresh);
    await vi.advanceTimersByTimeAsync(AUTH_FALLBACK_MS);
    expect(states).toHaveLength(1);
    expect(latest()).toMatchObject({ status: 'signed-in', offline: false });
  });

  it('does not fall back when nothing is stored', async () => {
    const { latest } = boot(new Promise<GetSessionResult>(() => undefined), { stored: null });
    await vi.advanceTimersByTimeAsync(AUTH_FALLBACK_MS);
    expect(latest()).toBeUndefined();
  });
});

describe('signing out on this device', () => {
  it('forgets the stored session when signOut fails, for example offline with an expired token', async () => {
    const forget = vi.fn();
    await signOutOnThisDevice({
      signOut: async () => ({ error: new AuthRetryableFetchError('Failed to fetch', 0) }),
      forget,
    });
    expect(forget).toHaveBeenCalled();
  });

  it('leaves it to auth-js when signOut succeeds', async () => {
    const forget = vi.fn();
    await signOutOnThisDevice({ signOut: async () => ({ error: null }), forget });
    expect(forget).not.toHaveBeenCalled();
  });

  it('forgets the session when signOut is still retrying after the fallback time, and again if it then fails', async () => {
    const forget = vi.fn();
    let finish: (result: { error: unknown }) => void = () => undefined;
    const signingOut = signOutOnThisDevice({ signOut: () => new Promise((done) => (finish = done)), forget });
    await vi.advanceTimersByTimeAsync(AUTH_FALLBACK_MS);
    await signingOut;
    expect(forget).toHaveBeenCalledTimes(1);
    finish({ error: new AuthRetryableFetchError('Failed to fetch', 0) });
    await vi.runAllTimersAsync();
    expect(forget).toHaveBeenCalledTimes(2);
  });

  it('moves a booted session to signed out on a forced sign-out', async () => {
    const { latest, control } = boot(noSession(new AuthRetryableFetchError('Failed to fetch', 0)));
    await vi.runAllTimersAsync();
    expect(latest()).toMatchObject({ status: 'signed-in', offline: true });
    const stop = onForcedSignOut(() => control.onAuthEvent('SIGNED_OUT', null));
    forceSignedOut();
    stop();
    expect(latest()).toEqual({ status: 'signed-out' });
  });
});

describe('auth request timeouts', () => {
  it.each([
    ['https://localhost:5173/sb/auth/v1/token?grant_type=password', true],
    ['https://localhost:5173/sb/auth/v1/user', true],
    ['https://abc.supabase.co/auth/v1/logout?scope=local', true],
    ['https://localhost:5173/sb/auth/v1/token?grant_type=refresh_token', false],
    ['https://abc.supabase.co/auth/v1/token?grant_type=refresh_token', false],
    ['https://localhost:5173/sb/rest/v1/exercises', false],
    ['https://localhost:5173/sb/functions/v1/complete-session', false],
  ])('%s → %s', (url, expected) => {
    expect(needsAuthTimeout(url)).toBe(expected);
  });
});
