import type { SessionSummary } from '@domain/types.ts';
import { useEffect, useEffectEvent, useState } from 'react';
import type { WorkoutDraft } from '../../offline/draft-format.ts';
import type { SyncedChange } from '../../offline/draft-session.ts';
import type { DraftStore } from '../../offline/draft-store.ts';
import { retryDelayMs } from '../../lib/platform/function-client-rules.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { attemptFinish } from '../../offline/finish-lock.ts';
import { type FinishStatus, startFinishRetries } from '../../offline/finish-retries.ts';
import { signOutKeepingDrafts } from '../../lib/platform/sign-out.ts';
import { syncFinishedWorkout } from '../../offline/sync-workout.ts';
import { FINISH_WINDOW_OVERRIDE_KEY, finishSyncDelayMs, finishWindowMs } from './workout-rules.ts';

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

function readFinishWindowMs(): number {
  try {
    return finishWindowMs(deviceStorage()?.getItem(FINISH_WINDOW_OVERRIDE_KEY) ?? null, import.meta.env.DEV);
  } catch {
    return finishWindowMs(null, import.meta.env.DEV);
  }
}

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
  holding: boolean;
  retryNow: () => void;
  saveNow: () => void;
} {
  const [retryNonce, setRetryNonce] = useState(0);
  const [status, setStatus] = useState<{ key: string; status: FinishStatus } | null>(null);
  const [windowMs] = useState(readFinishWindowMs);
  const [windowOverFor, setWindowOverFor] = useState<string | null>(null);
  const [savedNowFor, setSavedNowFor] = useState<string | null>(null);
  const finishedAt = draft?.finishedAt ?? null;
  const sessionId = finishedAt ? (draft?.sessionId ?? null) : null;
  const windowKey = sessionId ? `${sessionId}:${finishedAt}` : null;
  const finishKey = windowKey ? `${windowKey}:${retryNonce}` : null;
  const skipWindow = windowKey !== null && savedNowFor === windowKey;
  const reportSynced = useEffectEvent(onSynced);
  const reportSuperseded = useEffectEvent(onSuperseded);
  const reportDeleted = useEffectEvent(onDeleted);

  useEffect(() => {
    if (!sessionId || !finishedAt || !windowKey || !finishKey || !store) return;
    const show = (next: FinishStatus) => setStatus({ key: finishKey, status: next });
    const startRetries = () =>
      startFinishRetries({
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
    let retries: ReturnType<typeof startFinishRetries> | null = null;
    const onOnline = () => retries?.onOnline();
    const delayMs = skipWindow ? 0 : finishSyncDelayMs(Date.parse(finishedAt), Date.now(), windowMs);
    const windowTimer = setTimeout(() => {
      setWindowOverFor(windowKey);
      retries = startRetries();
    }, delayMs);
    window.addEventListener('online', onOnline);
    return () => {
      clearTimeout(windowTimer);
      retries?.stop();
      window.removeEventListener('online', onOnline);
    };
  }, [userId, sessionId, finishedAt, windowKey, finishKey, skipWindow, windowMs, store, flush, markSynced]);

  const retryNow = () => setRetryNonce((nonce) => nonce + 1);
  const saveNow = () => setSavedNowFor(windowKey);
  if (!finishKey) return { status: IDLE, holding: false, retryNow, saveNow };
  const holding = windowMs > 0 && !skipWindow && windowOverFor !== windowKey;
  return { status: status?.key === finishKey ? status.status : FIRST_ATTEMPT, holding, retryNow, saveNow };
}
