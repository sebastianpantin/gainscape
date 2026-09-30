import type { SessionSummary } from '@domain/types.ts';
import { FunctionsHttpError, isAuthApiError, isAuthRetryableFetchError, type Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';
import type { WorkoutDraft } from './draft-format.ts';
import type { SendOutcome } from './finish-lock.ts';
import { completeSessionPayload } from './session-payload.ts';

const POST_TIMEOUT_MS = 20_000;

type PostOutcome = SendOutcome | { kind: 'unauthorized' };

async function rejectionReason(error: FunctionsHttpError): Promise<{ status: number; reason: string }> {
  const response = error.context as Response;
  const body = await response.json().catch(() => ({}));
  return { status: response.status, reason: body.error ?? `http_${response.status}` };
}

function boundAccessToken(session: Session | null, userId: string): string | SendOutcome {
  if (!session) return { kind: 'needs_sign_in' };
  if (session.user.id !== userId) return { kind: 'wrong_account' };
  return session.access_token;
}

async function currentAccessToken(userId: string): Promise<string | SendOutcome> {
  const { data, error } = await supabase.auth.getSession();
  if (isAuthRetryableFetchError(error) || navigator.onLine === false)
    return { kind: 'retryable', reason: error?.message ?? 'offline' };
  if (error) return { kind: 'needs_sign_in' };
  return boundAccessToken(data.session, userId);
}

async function refreshedAccessToken(userId: string): Promise<string | SendOutcome> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return isAuthApiError(error) ? { kind: 'needs_sign_in' } : { kind: 'retryable', reason: error.message };
  return boundAccessToken(data.session, userId);
}

async function postDraft(draft: WorkoutDraft, accessToken: string): Promise<PostOutcome> {
  const { data, error } = await supabase.functions.invoke<SessionSummary>('complete-session', {
    body: completeSessionPayload(draft),
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(POST_TIMEOUT_MS),
  });
  if (!error && data) return { kind: 'synced', summary: data };
  if (error instanceof FunctionsHttpError) {
    const { status, reason } = await rejectionReason(error);
    if (status === 401) return { kind: 'unauthorized' };
    return status >= 500 ? { kind: 'retryable', reason } : { kind: 'rejected', reason };
  }
  return { kind: 'retryable', reason: error?.message ?? 'no_response' };
}

export async function syncFinishedWorkout(userId: string, draft: WorkoutDraft): Promise<SendOutcome> {
  try {
    const accessToken = await currentAccessToken(userId);
    if (typeof accessToken !== 'string') return accessToken;
    const firstOutcome = await postDraft(draft, accessToken);
    if (firstOutcome.kind !== 'unauthorized') return firstOutcome;
    const refreshedToken = await refreshedAccessToken(userId);
    if (typeof refreshedToken !== 'string') return refreshedToken;
    const secondOutcome = await postDraft(draft, refreshedToken);
    return secondOutcome.kind === 'unauthorized' ? { kind: 'needs_sign_in' } : secondOutcome;
  } catch (error) {
    return { kind: 'retryable', reason: error instanceof Error ? error.message : 'network_error' };
  }
}

export async function signOutKeepingDrafts(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}
