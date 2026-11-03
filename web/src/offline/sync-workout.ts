import { invokeAsOwner } from '../lib/platform/function-client.ts';
import { REQUEST_TIMEOUT_MS } from '../lib/platform/auth-restore.ts';
import { dayDrafts, labelledDays } from './draft-days.ts';
import type { WorkoutDraft } from './draft-format.ts';
import { type CompletedSessionSummary, type SendOutcome, sendOutcomeFrom } from './finish-lock.ts';
import { spendCachedScroll } from './items-cache.ts';
import { factsOutcomeOf, rememberFinishedSession } from './program-cache.ts';
import { completeSessionPayload } from './session-payload.ts';

function withDayLabels(outcome: SendOutcome, draft: WorkoutDraft): SendOutcome {
  if (outcome.kind !== 'synced' || outcome.summary.days === undefined) return outcome;
  return { ...outcome, summary: { ...outcome.summary, days: labelledDays(draft, outcome.summary.days) } };
}

export async function syncFinishedWorkout(userId: string, draft: WorkoutDraft): Promise<SendOutcome> {
  const sent = sendOutcomeFrom(
    await invokeAsOwner<CompletedSessionSummary>(
      userId,
      'complete-session',
      completeSessionPayload(draft),
      REQUEST_TIMEOUT_MS,
    ),
  );
  const outcome = withDayLabels(sent, draft);
  const factsOutcome = factsOutcomeOf(outcome);
  if (factsOutcome)
    for (const day of dayDrafts(draft, factsOutcome))
      rememberFinishedSession(localStorage, userId, day.draft, day.outcome);
  if (outcome.kind === 'synced' && outcome.summary.challenge)
    spendCachedScroll(localStorage, userId, outcome.summary.challenge.challengeId);
  return outcome;
}
