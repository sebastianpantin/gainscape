import type { FinishAttemptResult, SendOutcome } from './finish-lock.ts';

export type FinishStatus =
  | { kind: 'idle' }
  | { kind: 'syncing'; attempt: number; lastProblem: string | null; waitMs?: number }
  | { kind: 'rejected'; reason: string };

export type SettledFinish =
  | { kind: 'superseded' }
  | { kind: 'not_finished' }
  | { kind: 'sent'; outcome: Exclude<SendOutcome, { kind: 'retryable' }> };

export interface FinishRetryOptions {
  attemptOnce: (signal: AbortSignal) => Promise<FinishAttemptResult>;
  retryDelayMs: (attempt: number) => number;
  show: (status: FinishStatus) => void;
  settle: (result: SettledFinish) => Promise<void> | void;
}

export interface FinishRetries {
  onOnline: () => void;
  stop: () => void;
}

export function startFinishRetries({ attemptOnce, retryDelayMs, show, settle }: FinishRetryOptions): FinishRetries {
  const controller = new AbortController();
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let requestInFlight = false;
  let settled = false;
  let notBefore = 0;

  const attemptSync = async () => {
    if (requestInFlight || controller.signal.aborted || settled) return;
    requestInFlight = true;
    clearTimeout(retryTimer);
    show({ kind: 'syncing', attempt, lastProblem: null });
    try {
      const result = await attemptOnce(controller.signal).catch((error: unknown) => ({
        kind: 'sent' as const,
        outcome: { kind: 'retryable' as const, reason: error instanceof Error ? error.message : 'storage_error' },
      }));
      if (controller.signal.aborted || result.kind === 'aborted') return;
      if (result.kind === 'sent' && result.outcome.kind === 'retryable') {
        const retryAfterMs = 'retryAfterMs' in result.outcome ? (result.outcome.retryAfterMs ?? 0) : 0;
        const delayMs = Math.max(retryDelayMs(attempt++), retryAfterMs);
        notBefore = retryAfterMs > 0 ? Date.now() + retryAfterMs : 0;
        show({ kind: 'syncing', attempt, lastProblem: result.outcome.reason, waitMs: delayMs });
        retryTimer = setTimeout(attemptSync, delayMs);
        return;
      }
      settled = true;
      await settle(result as SettledFinish);
    } finally {
      requestInFlight = false;
    }
  };

  const firstAttempt = setTimeout(attemptSync, 0);
  return {
    onOnline: () => {
      if (Date.now() < notBefore) return;
      void attemptSync();
    },
    stop: () => {
      controller.abort();
      clearTimeout(firstAttempt);
      clearTimeout(retryTimer);
    },
  };
}
