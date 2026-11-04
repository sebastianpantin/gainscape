import { storedSessionId, type WorkoutDraft } from './draft-format.ts';
import type { SyncedChange } from './draft-session.ts';
import type { DraftStore } from './draft-store.ts';
import type { SendOutcome } from './finish-outcome.ts';

export type FinishAttemptResult =
  { kind: 'aborted' } | { kind: 'superseded' } | { kind: 'not_finished' } | { kind: 'sent'; outcome: SendOutcome };

interface FinishAttempt {
  userId: string;
  sessionId: string;
  store: DraftStore;
  flush: () => Promise<void>;
  send: (draft: WorkoutDraft) => Promise<SendOutcome>;
  markSynced: (sessionId: string, change?: SyncedChange) => Promise<void>;
  signal: AbortSignal;
}

export function finishLockName(userId: string): string {
  return `gainscape.finish.${userId}`;
}

async function sendStoredDraft(attempt: FinishAttempt): Promise<FinishAttemptResult> {
  const record = await attempt.store.get(attempt.userId);
  if (!record) return { kind: 'not_finished' };
  if (storedSessionId(record) !== attempt.sessionId || record.kind !== 'draft') return { kind: 'superseded' };
  if (record.draft.finishedAt === null) return { kind: 'not_finished' };
  const outcome = await attempt.send(record.draft);
  if (outcome.kind === 'synced' || outcome.kind === 'deleted')
    await attempt.markSynced(attempt.sessionId, outcome.kind);
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
