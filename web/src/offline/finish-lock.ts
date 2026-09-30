import type { SessionSummary } from '@domain/types.ts';
import { rememberLastSummary } from '../features/summary/last-summary.ts';
import { storedSessionId, type WorkoutDraft } from './draft-format.ts';
import type { DraftStore } from './draft-store.ts';

export type SendOutcome =
  | { kind: 'synced'; summary: SessionSummary }
  | { kind: 'retryable'; reason: string }
  | { kind: 'rejected'; reason: string }
  | { kind: 'needs_sign_in' }
  | { kind: 'wrong_account' };

export type FinishAttemptResult =
  { kind: 'aborted' } | { kind: 'superseded' } | { kind: 'not_finished' } | { kind: 'sent'; outcome: SendOutcome };

export interface FinishAttempt {
  userId: string;
  sessionId: string;
  store: DraftStore;
  flush: () => Promise<void>;
  send: (draft: WorkoutDraft) => Promise<SendOutcome>;
  markSynced: (sessionId: string) => Promise<void>;
  signal: AbortSignal;
}

export function finishLockName(userId: string): string {
  return `gainscape.finish.${userId}`;
}

async function sendStoredDraft(attempt: FinishAttempt): Promise<FinishAttemptResult> {
  const record = await attempt.store.get(attempt.userId);
  if (!record) return { kind: 'not_finished' };
  if (storedSessionId(record) !== attempt.sessionId || record.kind === 'synced') return { kind: 'superseded' };
  if (record.draft.finishedAt === null) return { kind: 'not_finished' };
  const outcome = await attempt.send(record.draft);
  if (outcome.kind === 'synced') {
    rememberLastSummary(outcome.summary);
    await attempt.markSynced(attempt.sessionId);
  }
  return { kind: 'sent', outcome };
}

export async function attemptFinish(attempt: FinishAttempt): Promise<FinishAttemptResult> {
  await attempt.flush();
  if (attempt.signal.aborted) return { kind: 'aborted' };
  const locks = globalThis.navigator?.locks;
  if (!locks) return sendStoredDraft(attempt);
  try {
    return await locks.request(finishLockName(attempt.userId), { signal: attempt.signal }, () =>
      sendStoredDraft(attempt),
    );
  } catch (error) {
    if (attempt.signal.aborted) return { kind: 'aborted' };
    throw error;
  }
}
