import type { SessionSummary } from '@domain/types.ts';
import { useEffect, useEffectEvent, useState } from 'react';
import type { WorkoutDraft } from '../../offline/draft-format.ts';
import type { SyncedChange } from '../../offline/draft-session.ts';
import type { DraftStore } from '../../offline/draft-store.ts';
import { retryDelayMs } from '../../lib/function-client.ts';
import { attemptFinish } from '../../offline/finish-lock.ts';
import { type FinishStatus, startFinishRetries } from '../../offline/finish-retries.ts';
import { signOutKeepingDrafts, syncFinishedWorkout } from '../../offline/sync-workout.ts';

export type { FinishStatus } from '../../offline/finish-retries.ts';

interface FinishSyncOptions {
  userId: string;
  draft: WorkoutDraft | null;
  store: DraftStore | null;
  flush: () => Promise<void>;
  markSynced: (sessionId: string, change?: SyncedChange) => Promise<void>;
  onSynced: (summary: SessionSummary) => void;
  onSuperseded: (sessionId: string) => void;
  onDeleted: () => void;
}

const IDLE: FinishStatus = { kind: 'idle' };
const FIRST_ATTEMPT: FinishStatus = { kind: 'syncing', attempt: 0, lastProblem: null };

export function useFinishSync({
  userId,
  draft,
  store,
  flush,
  markSynced,
  onSynced,
  onSuperseded,
  onDeleted,
}: FinishSyncOptions): {
  status: FinishStatus;
  retryNow: () => void;
} {
  const [retryNonce, setRetryNonce] = useState(0);
  const [status, setStatus] = useState<{ key: string; status: FinishStatus } | null>(null);
  const sessionId = draft?.finishedAt ? draft.sessionId : null;
  const finishKey = draft?.finishedAt ? `${draft.sessionId}:${draft.finishedAt}:${retryNonce}` : null;
  const reportSynced = useEffectEvent(onSynced);
  const reportSuperseded = useEffectEvent(onSuperseded);
  const reportDeleted = useEffectEvent(onDeleted);

  useEffect(() => {
    if (!sessionId || !finishKey || !store) return;
    const show = (next: FinishStatus) => setStatus({ key: finishKey, status: next });
    const retries = startFinishRetries({
      attemptOnce: (signal) =>
        attemptFinish({
          userId,
          sessionId,
          store,
          flush,
          markSynced,
          send: (storedDraft) => syncFinishedWorkout(userId, storedDraft),
          signal,
        }),
      retryDelayMs,
      show,
      settle: async (result) => {
        if (result.kind === 'superseded') return reportSuperseded(sessionId);
        if (result.kind !== 'sent') return;
        const outcome = result.outcome;
        if (outcome.kind === 'synced') reportSynced(outcome.summary);
        else if (outcome.kind === 'rejected') show({ kind: 'rejected', reason: outcome.reason });
        else if (outcome.kind === 'deleted') reportDeleted();
        else if (outcome.kind === 'needs_sign_in') await signOutKeepingDrafts();
      },
    });
    window.addEventListener('online', retries.onOnline);
    return () => {
      retries.stop();
      window.removeEventListener('online', retries.onOnline);
    };
  }, [userId, sessionId, finishKey, store, flush, markSynced]);

  const retryNow = () => setRetryNonce((nonce) => nonce + 1);
  if (!finishKey) return { status: IDLE, retryNow };
  return { status: status?.key === finishKey ? status.status : FIRST_ATTEMPT, retryNow };
}
