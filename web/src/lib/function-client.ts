import { FunctionsHttpError, isAuthApiError, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { supabase } from './supabase.ts';

export type AuthProblem = { kind: 'needs_sign_in' } | { kind: 'wrong_account' } | { kind: 'retryable'; reason: string };

export type InvokeOutcome<T> =
  { kind: 'ok'; data: T } | { kind: 'http_error'; status: number; code: string; details: unknown } | AuthProblem;

const MAX_RETRY_DELAY_MS = 30_000;

export function retryDelayMs(attempt: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** attempt);
}

function boundAccessToken(session: Session | null, userId: string): string | AuthProblem {
  if (!session) return { kind: 'needs_sign_in' };
  if (session.user.id !== userId) return { kind: 'wrong_account' };
  return session.access_token;
}

async function currentAccessToken(userId: string): Promise<string | AuthProblem> {
  const { data, error } = await supabase.auth.getSession();
  if (isAuthRetryableFetchError(error) || navigator.onLine === false)
    return { kind: 'retryable', reason: error?.message ?? 'offline' };
  if (error) return { kind: 'needs_sign_in' };
  return boundAccessToken(data.session, userId);
}

async function refreshedAccessToken(userId: string): Promise<string | AuthProblem> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return isAuthApiError(error) ? { kind: 'needs_sign_in' } : { kind: 'retryable', reason: error.message };
  return boundAccessToken(data.session, userId);
}

function eitherSignal(first: AbortSignal, second: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any([first, second]);
  const controller = new AbortController();
  const forward = (source: AbortSignal) => () => controller.abort(source.reason);
  for (const source of [first, second]) {
    if (source.aborted) {
      controller.abort(source.reason);
      break;
    }
    source.addEventListener('abort', forward(source), { once: true });
  }
  return controller.signal;
}

async function invokeOnce<T>(
  name: string,
  body: unknown,
  accessToken: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<InvokeOutcome<T> | { kind: 'unauthorized' }> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const { data, error } = await supabase.functions.invoke<T>(name, {
    body: body as Record<string, unknown>,
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: signal ? eitherSignal(signal, timeout) : timeout,
  });
  if (!error && data) return { kind: 'ok', data };
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    if (response.status === 401) return { kind: 'unauthorized' };
    const parsed = await response.json().catch(() => ({}));
    return {
      kind: 'http_error',
      status: response.status,
      code: parsed.error ?? `http_${response.status}`,
      details: parsed.details,
    };
  }
  return { kind: 'retryable', reason: error?.message ?? 'no_response' };
}

export async function invokeAsOwner<T>(
  userId: string,
  name: string,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<InvokeOutcome<T>> {
  try {
    const accessToken = await currentAccessToken(userId);
    if (typeof accessToken !== 'string') return accessToken;
    const firstOutcome = await invokeOnce<T>(name, body, accessToken, timeoutMs, signal);
    if (firstOutcome.kind !== 'unauthorized') return firstOutcome;
    const refreshedToken = await refreshedAccessToken(userId);
    if (typeof refreshedToken !== 'string') return refreshedToken;
    const secondOutcome = await invokeOnce<T>(name, body, refreshedToken, timeoutMs, signal);
    return secondOutcome.kind === 'unauthorized' ? { kind: 'needs_sign_in' } : secondOutcome;
  } catch (error) {
    return { kind: 'retryable', reason: error instanceof Error ? error.message : 'network_error' };
  }
}
