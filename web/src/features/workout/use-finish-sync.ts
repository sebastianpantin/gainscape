import type { SessionSummary } from '@domain/types.ts';
import { useEffect, useEffectEvent, useState } from 'react';
import { syncFinishedWorkout } from '../../offline/sync-workout.ts';
import type { WorkoutDraft } from '../../offline/workout-draft.ts';

export type FinishStatus =
  | { kind: 'idle' }
  | { kind: 'syncing'; attempt: number; lastProblem: string | null }
  | { kind: 'rejected'; reason: string };

const MAX_RETRY_DELAY_MS = 30_000;
const IDLE: FinishStatus = { kind: 'idle' };

function retryDelayMs(attempt: number): number {
  return Math.min(MAX_RETRY_DELAY_MS, 1000 * 2 ** attempt);
}

export function useFinishSync(draft: WorkoutDraft | null, onSynced: (summary: SessionSummary) => void): FinishStatus {
  const [status, setStatus] = useState<{ draft: WorkoutDraft; status: FinishStatus } | null>(null);
  const finishedDraft = draft?.finishedAt ? draft : null;
  const reportSynced = useEffectEvent(onSynced);

  useEffect(() => {
    if (!finishedDraft) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    let requestInFlight = false;
    let settled = false;
    const show = (next: FinishStatus) => setStatus({ draft: finishedDraft, status: next });

    const attemptSync = async () => {
      if (requestInFlight || cancelled || settled) return;
      requestInFlight = true;
      clearTimeout(retryTimer);
      show({ kind: 'syncing', attempt, lastProblem: null });
      try {
        const outcome = await syncFinishedWorkout(finishedDraft);
        if (cancelled) return;
        if (outcome.kind === 'synced') {
          settled = true;
          return reportSynced(outcome.summary);
        }
        if (outcome.kind === 'rejected') {
          settled = true;
          return show({ kind: 'rejected', reason: outcome.reason });
        }
        show({ kind: 'syncing', attempt, lastProblem: outcome.reason });
        retryTimer = setTimeout(attemptSync, retryDelayMs(attempt++));
      } finally {
        requestInFlight = false;
      }
    };

    window.addEventListener('online', attemptSync);
    const firstAttempt = setTimeout(attemptSync, 0);
    return () => {
      cancelled = true;
      clearTimeout(firstAttempt);
      clearTimeout(retryTimer);
      window.removeEventListener('online', attemptSync);
    };
  }, [finishedDraft]);

  if (!finishedDraft || status?.draft !== finishedDraft)
    return finishedDraft ? { kind: 'syncing', attempt: 0, lastProblem: null } : IDLE;
  return status.status;
}
