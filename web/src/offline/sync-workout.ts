import { invokeAsOwner } from '../lib/platform/function-client.ts';
import { REQUEST_TIMEOUT_MS } from '../lib/platform/auth-restore.ts';
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
