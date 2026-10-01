import type { SessionSummary } from '@domain/types.ts';
import { invokeAsOwner } from '../lib/function-client.ts';
import { REQUEST_TIMEOUT_MS, supabase } from '../lib/supabase.ts';
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

export async function signOutKeepingDrafts(): Promise<void> {
  await supabase.auth.signOut({ scope: 'local' });
}
