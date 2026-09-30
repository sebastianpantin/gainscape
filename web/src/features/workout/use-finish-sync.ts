import type { SessionSummary } from '@domain/types.ts';
import { useEffect, useEffectEvent, useState } from 'react';
import type { WorkoutDraft } from '../../offline/draft-format.ts';
import type { SyncedChange } from '../../offline/draft-session.ts';
import type { DraftStore } from '../../offline/draft-store.ts';
import { retryDelayMs } from '../../lib/function-client.ts';
import { attemptFinish } from '../../offline/finish-lock.ts';
import { signOutKeepingDrafts, syncFinishedWorkout } from '../../offline/sync-workout.ts';

export type FinishStatus =
  | { kind: 'idle' }
  | { kind: 'syncing'; attempt: number; lastProblem: string | null; waitMs?: number }
  | { kind: 'rejected'; reason: string };

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
    const controller = new AbortController();
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let requestInFlight = false;
    let settled = false;
    const show = (next: FinishStatus) => setStatus({ key: finishKey, status: next });

    const attemptSync = async () => {
      if (requestInFlight || controller.signal.aborted || settled) return;
      requestInFlight = true;
      clearTimeout(retryTimer);
      show({ kind: 'syncing', attempt, lastProblem: null });
      try {
        const result = await attemptFinish({
          userId,
          sessionId,
          store,
          flush,
          markSynced,
          send: (storedDraft) => syncFinishedWorkout(userId, storedDraft),
          signal: controller.signal,
        }).catch((error: unknown) => ({
          kind: 'sent' as const,
          outcome: { kind: 'retryable' as const, reason: error instanceof Error ? error.message : 'storage_error' },
        }));
        if (controller.signal.aborted || result.kind === 'aborted') return;
        if (result.kind !== 'sent') {
          settled = true;
          if (result.kind === 'superseded') reportSuperseded(sessionId);
          return;
        }
        const outcome = result.outcome;
        if (outcome.kind === 'retryable') {
          const delayMs = Math.max(
            retryDelayMs(attempt++),
            ('retryAfterMs' in outcome ? outcome.retryAfterMs : undefined) ?? 0,
          );
          show({ kind: 'syncing', attempt, lastProblem: outcome.reason, waitMs: delayMs });
          retryTimer = setTimeout(attemptSync, delayMs);
          return;
        }
        settled = true;
        if (outcome.kind === 'synced') reportSynced(outcome.summary);
        else if (outcome.kind === 'rejected') show({ kind: 'rejected', reason: outcome.reason });
        else if (outcome.kind === 'deleted') reportDeleted();
        else if (outcome.kind === 'needs_sign_in') await signOutKeepingDrafts();
      } finally {
        requestInFlight = false;
      }
    };

    window.addEventListener('online', attemptSync);
    const firstAttempt = setTimeout(attemptSync, 0);
    return () => {
      controller.abort();
      clearTimeout(firstAttempt);
      clearTimeout(retryTimer);
      window.removeEventListener('online', attemptSync);
    };
  }, [userId, sessionId, finishKey, store, flush, markSynced]);

  const retryNow = () => setRetryNonce((nonce) => nonce + 1);
  if (!finishKey) return { status: IDLE, retryNow };
  return { status: status?.key === finishKey ? status.status : FIRST_ATTEMPT, retryNow };
}
