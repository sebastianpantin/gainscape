import type { SessionSummary } from '@domain/types.ts';
import type { InvokeOutcome } from '../lib/function-client-rules.ts';
import type { RememberedTiming } from '../lib/session-timing-rules.ts';
import { RATE_LIMITED_STATUS, retryAfterSeconds } from '../lib/rate-limit.ts';
import { rememberLastSummary } from '../features/summary/last-summary.ts';
import { storedSessionId, type WorkoutDraft } from './draft-format.ts';
import type { SyncedChange } from './draft-session.ts';
import type { DraftStore } from './draft-store.ts';

export interface CompletedSessionSummary extends SessionSummary, RememberedTiming {
  programLinked?: boolean;
  completedAt?: string;
}

export type SendOutcome =
  | { kind: 'synced'; summary: CompletedSessionSummary }
  | { kind: 'deleted' }
  | { kind: 'retryable'; reason: string; retryAfterMs?: number }
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
  markSynced: (sessionId: string, change?: SyncedChange) => Promise<void>;
  signal: AbortSignal;
}

const SESSION_DELETED_STATUS = 410;

export function sendOutcomeFrom(outcome: InvokeOutcome<CompletedSessionSummary>): SendOutcome {
  if (outcome.kind === 'ok') return { kind: 'synced', summary: outcome.data };
  if (outcome.kind !== 'http_error') return outcome;
  if (outcome.status === SESSION_DELETED_STATUS) return { kind: 'deleted' };
  if (outcome.status === RATE_LIMITED_STATUS) {
    const seconds = retryAfterSeconds(outcome.details);
    return { kind: 'retryable', reason: outcome.code, retryAfterMs: seconds === null ? undefined : seconds * 1000 };
  }
  return outcome.status >= 500
    ? { kind: 'retryable', reason: outcome.code }
    : { kind: 'rejected', reason: outcome.code };
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
  if (outcome.kind === 'synced') rememberLastSummary(outcome.summary);
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
