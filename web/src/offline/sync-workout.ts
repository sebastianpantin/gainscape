import { invokeAsOwner } from '../lib/function-client.ts';
import { forceSignedOut, REQUEST_TIMEOUT_MS, signOutOnThisDevice } from '../lib/auth-restore.ts';
import { AUTH_STORAGE_KEY, readStoredSession, supabase } from '../lib/supabase.ts';
import type { WorkoutDraft } from './draft-format.ts';
import { type CompletedSessionSummary, type SendOutcome, sendOutcomeFrom } from './finish-lock.ts';
import { spendCachedScroll } from './items-cache.ts';
import { factsOutcomeOf, rememberFinishedSession } from './program-cache.ts';
import { completeSessionPayload } from './session-payload.ts';

export async function syncFinishedWorkout(userId: string, draft: WorkoutDraft): Promise<SendOutcome> {
  const outcome = sendOutcomeFrom(
    await invokeAsOwner<CompletedSessionSummary>(
      userId,
      'complete-session',
      completeSessionPayload(draft),
      REQUEST_TIMEOUT_MS,
    ),
  );
  const factsOutcome = factsOutcomeOf(outcome);
  if (factsOutcome) rememberFinishedSession(localStorage, userId, draft, factsOutcome);
  if (outcome.kind === 'synced' && outcome.summary.challenge)
    spendCachedScroll(localStorage, userId, outcome.summary.challenge.challengeId);
  return outcome;
}

function forgetStoredSession(): void {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    return forceSignedOut();
  }
  forceSignedOut();
}

export async function signOutKeepingDrafts(): Promise<void> {
  await signOutOnThisDevice({
    signOut: () => supabase.auth.signOut({ scope: 'local' }),
    storedSession: readStoredSession,
    isOnline: () => navigator.onLine !== false,
    forget: forgetStoredSession,
  });
}
