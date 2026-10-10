import { type AuthError, FunctionsHttpError, type Session } from '@supabase/supabase-js';
import { messageOf } from './error-text.ts';
import { RATE_LIMITED_STATUS } from './rate-limit.ts';

export type AuthProblem = { kind: 'needs_sign_in' } | { kind: 'wrong_account' } | { kind: 'retryable'; reason: string };

export type InvokeOutcome<T> =
  { kind: 'ok'; data: T } | { kind: 'http_error'; status: number; code: string; details: unknown } | AuthProblem;

export interface AuthResult {
  data: { session: Session | null };
  error: AuthError | null;
}

export interface InvokeOptions {
  body: Record<string, unknown>;
  headers: { Authorization: string };
  signal: AbortSignal;
}

export interface OwnerClient {
  getSession: () => Promise<AuthResult>;
  refreshSession: () => Promise<AuthResult>;
  invoke: <T>(name: string, options: InvokeOptions) => Promise<{ data: T | null; error: unknown }>;
  isOffline: () => boolean;
}

const MAX_RETRY_DELAY_MS = 30_000;
const UNAUTHORIZED_STATUS = 401;

export function retryDelayMs(attempt: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** attempt);
}

export function httpErrorBody(response: Response): Promise<{ error?: string; details?: unknown }> {
  return response.json().catch(() => ({}));
}

export function boundAccessToken(session: Session | null, userId: string): string | AuthProblem {
  if (!session) return { kind: 'needs_sign_in' };
  if (session.user.id !== userId) return { kind: 'wrong_account' };
  return session.access_token;
}

function authErrorProblem(error: AuthError): AuthProblem {
  const status = error.status ?? 0;
  const rejectedByAuthServer = status >= 400 && status < 500 && status !== RATE_LIMITED_STATUS;
  return rejectedByAuthServer ? { kind: 'needs_sign_in' } : { kind: 'retryable', reason: error.message };
}

async function currentAccessToken(client: OwnerClient, userId: string): Promise<string | AuthProblem> {
  const { data, error } = await client.getSession();
  if (client.isOffline()) return { kind: 'retryable', reason: error?.message ?? 'offline' };
  if (error) return authErrorProblem(error);
  return boundAccessToken(data.session, userId);
}

async function refreshedAccessToken(client: OwnerClient, userId: string): Promise<string | AuthProblem> {
  const { data, error } = await client.refreshSession();
  if (error) return authErrorProblem(error);
  return boundAccessToken(data.session, userId);
}

export function eitherSignal(first: AbortSignal, second: AbortSignal): AbortSignal {
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
  client: OwnerClient,
  name: string,
  body: unknown,
  accessToken: string,
  timeoutMs: number,
  signal: AbortSignal | undefined,
): Promise<InvokeOutcome<T> | { kind: 'unauthorized' }> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const { data, error } = await client.invoke<T>(name, {
    body: body as Record<string, unknown>,
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: signal ? eitherSignal(signal, timeout) : timeout,
  });
  if (!error && data) return { kind: 'ok', data };
  if (error instanceof FunctionsHttpError) {
    const response = error.context as Response;
    if (response.status === UNAUTHORIZED_STATUS) return { kind: 'unauthorized' };
    const parsed = await httpErrorBody(response);
    return {
      kind: 'http_error',
      status: response.status,
      code: parsed.error ?? `http_${response.status}`,
      details: parsed.details,
    };
  }
  return { kind: 'retryable', reason: messageOf(error, 'no_response') };
}

export async function invokeAsOwnerWith<T>(
  client: OwnerClient,
  userId: string,
  name: string,
  body: unknown,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<InvokeOutcome<T>> {
  try {
    const accessToken = await currentAccessToken(client, userId);
    if (typeof accessToken !== 'string') return accessToken;
    const firstOutcome = await invokeOnce<T>(client, name, body, accessToken, timeoutMs, signal);
    if (firstOutcome.kind !== 'unauthorized') return firstOutcome;
    const refreshedToken = await refreshedAccessToken(client, userId);
    if (typeof refreshedToken !== 'string') return refreshedToken;
    const secondOutcome = await invokeOnce<T>(client, name, body, refreshedToken, timeoutMs, signal);
    return secondOutcome.kind === 'unauthorized' ? { kind: 'needs_sign_in' } : secondOutcome;
  } catch (error) {
    return { kind: 'retryable', reason: messageOf(error, 'network_error') };
  }
}
