import {
  AuthApiError,
  AuthRetryableFetchError,
  FunctionsFetchError,
  FunctionsHttpError,
  type Session,
} from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';
import {
  type AuthResult,
  boundAccessToken,
  eitherSignal,
  invokeAsOwnerWith,
  type OwnerClient,
} from '../../web/src/lib/platform/function-client-rules.ts';

const owner = '11111111-1111-4111-8111-111111111111';
const someoneElse = '22222222-2222-4222-8222-222222222222';
const TIMEOUT_MS = 1_000;

function session(userId: string, accessToken: string): Session {
  return { access_token: accessToken, user: { id: userId } } as Session;
}

function signedIn(userId: string, accessToken: string): AuthResult {
  return { data: { session: session(userId, accessToken) }, error: null };
}

function failedWith(error: AuthResult['error']): AuthResult {
  return { data: { session: null }, error };
}

function httpError(status: number, body: unknown = {}) {
  return { data: null, error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })) };
}

type InvokeResult = Awaited<ReturnType<OwnerClient['invoke']>>;

interface ClientSetup {
  current?: AuthResult;
  refreshed?: AuthResult;
  responses?: InvokeResult[];
  offline?: boolean;
}

function clientWith({ current, refreshed, responses = [], offline = false }: ClientSetup) {
  const tokensSent: string[] = [];
  const client: OwnerClient = {
    getSession: vi.fn(async () => current ?? signedIn(owner, 'first-token')),
    refreshSession: vi.fn(async () => refreshed ?? signedIn(owner, 'second-token')),
    invoke: vi.fn(async (_name, options) => {
      tokensSent.push(options.headers.Authorization);
      const next = responses.shift();
      if (next === undefined) throw new Error('no response queued');
      return next;
    }) as OwnerClient['invoke'],
    isOffline: () => offline,
  };
  return { client, tokensSent };
}

function invoke(client: OwnerClient) {
  return invokeAsOwnerWith<{ ok: true }>(client, owner, 'complete-session', { id: 'session-a' }, TIMEOUT_MS);
}

describe('invokeAsOwnerWith', () => {
  it('sends the current access token and returns the data', async () => {
    const { client, tokensSent } = clientWith({ responses: [{ data: { ok: true }, error: null }] });
    await expect(invoke(client)).resolves.toEqual({ kind: 'ok', data: { ok: true } });
    expect(tokensSent).toEqual(['Bearer first-token']);
    expect(client.refreshSession).not.toHaveBeenCalled();
  });

  it('refreshes the session after a 401 and retries once with the new token', async () => {
    const { client, tokensSent } = clientWith({ responses: [httpError(401), { data: { ok: true }, error: null }] });
    await expect(invoke(client)).resolves.toEqual({ kind: 'ok', data: { ok: true } });
    expect(tokensSent).toEqual(['Bearer first-token', 'Bearer second-token']);
  });

  it('asks for a sign-in when the retry is unauthorized too', async () => {
    const { client } = clientWith({ responses: [httpError(401), httpError(401)] });
    await expect(invoke(client)).resolves.toEqual({ kind: 'needs_sign_in' });
  });

  it('asks for a sign-in when the auth server rejects the refresh', async () => {
    const { client } = clientWith({
      refreshed: failedWith(new AuthApiError('Invalid Refresh Token', 400, 'refresh_token_not_found')),
      responses: [httpError(401)],
    });
    await expect(invoke(client)).resolves.toEqual({ kind: 'needs_sign_in' });
  });

  it.each([
    ['a rate limit', new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit')],
    ['a server error', new AuthApiError('Internal error', 500, 'unexpected_failure')],
    ['a bad gateway', new AuthRetryableFetchError('Bad Gateway', 502)],
  ])('retries later instead of signing out when the refresh hits %s', async (_label, error) => {
    const { client } = clientWith({ refreshed: failedWith(error), responses: [httpError(401)] });
    await expect(invoke(client)).resolves.toEqual({ kind: 'retryable', reason: error.message });
  });

  it('asks for a sign-in when the refresh finds no session to refresh', async () => {
    const { client } = clientWith({
      refreshed: failedWith(new AuthApiError('Session not found', 403, 'session_not_found')),
      responses: [httpError(401)],
    });
    await expect(invoke(client)).resolves.toEqual({ kind: 'needs_sign_in' });
  });

  it('retries later when reading the session hits a rate limit or a server error', async () => {
    for (const error of [
      new AuthApiError('Request rate limit reached', 429, 'over_request_rate_limit'),
      new AuthApiError('Internal error', 500, 'unexpected_failure'),
    ]) {
      const { client } = clientWith({ current: failedWith(error) });
      await expect(invoke(client)).resolves.toEqual({ kind: 'retryable', reason: error.message });
    }
  });

  it('retries later when the refresh cannot reach the auth server', async () => {
    const { client } = clientWith({
      refreshed: failedWith(new AuthRetryableFetchError('Failed to fetch', 0)),
      responses: [httpError(401)],
    });
    await expect(invoke(client)).resolves.toEqual({ kind: 'retryable', reason: 'Failed to fetch' });
  });

  it('refuses to send when the refreshed session belongs to another account', async () => {
    const { client } = clientWith({ refreshed: signedIn(someoneElse, 'other-token'), responses: [httpError(401)] });
    await expect(invoke(client)).resolves.toEqual({ kind: 'wrong_account' });
  });

  it('refuses to send without a session or with another account signed in', async () => {
    const noSession = clientWith({ current: { data: { session: null }, error: null } });
    await expect(invoke(noSession.client)).resolves.toEqual({ kind: 'needs_sign_in' });
    const otherAccount = clientWith({ current: signedIn(someoneElse, 'other-token') });
    await expect(invoke(otherAccount.client)).resolves.toEqual({ kind: 'wrong_account' });
    expect(otherAccount.client.invoke).not.toHaveBeenCalled();
  });

  it('retries later when the session cannot be read offline or over a failing network', async () => {
    const offline = clientWith({ offline: true });
    await expect(invoke(offline.client)).resolves.toEqual({ kind: 'retryable', reason: 'offline' });
    const unreachable = clientWith({ current: failedWith(new AuthRetryableFetchError('Load failed', 0)) });
    await expect(invoke(unreachable.client)).resolves.toEqual({ kind: 'retryable', reason: 'Load failed' });
  });

  it('asks for a sign-in when the auth server rejects the stored session', async () => {
    const { client } = clientWith({ current: failedWith(new AuthApiError('bad jwt', 403, 'bad_jwt')) });
    await expect(invoke(client)).resolves.toEqual({ kind: 'needs_sign_in' });
  });

  it('reports an HTTP error with its code and details, or the status when the body has none', async () => {
    const coded = clientWith({ responses: [httpError(422, { error: 'bodyweight_required', details: { a: 1 } })] });
    await expect(invoke(coded.client)).resolves.toEqual({
      kind: 'http_error',
      status: 422,
      code: 'bodyweight_required',
      details: { a: 1 },
    });
    const bare = clientWith({
      responses: [{ data: null, error: new FunctionsHttpError(new Response('not json', { status: 503 })) }],
    });
    await expect(invoke(bare.client)).resolves.toEqual({
      kind: 'http_error',
      status: 503,
      code: 'http_503',
      details: undefined,
    });
  });

  it('retries later when no response arrives or the request throws', async () => {
    const fetchFailed = clientWith({ responses: [{ data: null, error: new FunctionsFetchError('boom') }] });
    await expect(invoke(fetchFailed.client)).resolves.toEqual({
      kind: 'retryable',
      reason: 'Failed to send a request to the Edge Function',
    });
    const empty = clientWith({ responses: [{ data: null, error: null }] });
    await expect(invoke(empty.client)).resolves.toEqual({ kind: 'retryable', reason: 'no_response' });
    const thrown = clientWith({});
    await expect(invoke(thrown.client)).resolves.toEqual({ kind: 'retryable', reason: 'no response queued' });
  });
});

describe('boundAccessToken', () => {
  it('returns the token only for the owner', () => {
    expect(boundAccessToken(session(owner, 'token'), owner)).toBe('token');
    expect(boundAccessToken(session(someoneElse, 'token'), owner)).toEqual({ kind: 'wrong_account' });
    expect(boundAccessToken(null, owner)).toEqual({ kind: 'needs_sign_in' });
  });
});

function withoutAbortSignalAny(run: () => void): void {
  const original = AbortSignal.any;
  Reflect.set(AbortSignal, 'any', undefined);
  try {
    run();
  } finally {
    Reflect.set(AbortSignal, 'any', original);
  }
}

describe('eitherSignal', () => {
  for (const [name, inEnvironment] of [
    ['with AbortSignal.any', (run: () => void) => run()],
    ['without AbortSignal.any', withoutAbortSignalAny],
  ] as const) {
    it(`aborts when either signal aborts, ${name}`, () => {
      inEnvironment(() => {
        const first = new AbortController();
        const second = new AbortController();
        const combined = eitherSignal(first.signal, second.signal);
        expect(combined.aborted).toBe(false);
        second.abort('timeout');
        expect(combined.aborted).toBe(true);
        expect(combined.reason).toBe('timeout');
      });
    });

    it(`starts aborted when a signal already is, ${name}`, () => {
      inEnvironment(() => {
        const combined = eitherSignal(AbortSignal.abort('gone'), new AbortController().signal);
        expect(combined.aborted).toBe(true);
        expect(combined.reason).toBe('gone');
      });
    });
  }
});
