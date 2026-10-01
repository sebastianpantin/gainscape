import type { SessionSummary } from '@domain/types.ts';
import { invokeAsOwner } from '../lib/function-client.ts';
import { forceSignedOut, signOutOnThisDevice, storedSessionFrom } from '../lib/auth-restore.ts';
import { AUTH_STORAGE_KEY, REQUEST_TIMEOUT_MS, supabase } from '../lib/supabase.ts';
import type { WorkoutDraft } from './draft-format.ts';
import { type SendOutcome, sendOutcomeFrom } from './finish-lock.ts';
import { completeSessionPayload } from './session-payload.ts';

export async function syncFinishedWorkout(userId: string, draft: WorkoutDraft): Promise<SendOutcome> {
  const outcome = await invokeAsOwner<SessionSummary>(
    userId,
    'complete-session',
    completeSessionPayload(draft),
    REQUEST_TIMEOUT_MS,
  );
  return sendOutcomeFrom(outcome);
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
    storedSession: () => {
      try {
        return storedSessionFrom(localStorage.getItem(AUTH_STORAGE_KEY));
      } catch {
        return null;
      }
    },
    isOnline: () => navigator.onLine !== false,
    forget: forgetStoredSession,
  });
}
