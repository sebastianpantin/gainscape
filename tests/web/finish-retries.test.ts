import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinishAttemptResult } from '../../web/src/offline/finish-lock.ts';
import { type FinishStatus, type SettledFinish, startFinishRetries } from '../../web/src/offline/finish-retries.ts';

const summary = { sessionId: 'session-a', xpBySkill: {}, levelUps: [], prs: [], drops: [] };
const rateLimited: FinishAttemptResult = {
  kind: 'sent',
  outcome: { kind: 'retryable', reason: 'rate_limited', retryAfterMs: 5_000 },
};
const synced: FinishAttemptResult = { kind: 'sent', outcome: { kind: 'synced', summary } };

function loopWith(results: FinishAttemptResult[]) {
  const attemptOnce = vi.fn(async () => results.shift() ?? synced);
  const statuses: FinishStatus[] = [];
  const settled: SettledFinish[] = [];
  const retries = startFinishRetries({
    attemptOnce,
    retryDelayMs: () => 1_000,
    show: (status) => statuses.push(status),
    settle: (result) => {
      settled.push(result);
    },
  });
  return { attemptOnce, statuses, settled, retries };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-01T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startFinishRetries', () => {
  it('waits for Retry-After, and still retries when the clock steps back before the timer fires', async () => {
    const { attemptOnce, statuses, settled, retries } = loopWith([rateLimited]);
    await vi.advanceTimersByTimeAsync(0);
    expect(attemptOnce).toHaveBeenCalledTimes(1);
    expect(statuses.at(-1)).toEqual({ kind: 'syncing', attempt: 1, lastProblem: 'rate_limited', waitMs: 5_000 });

    await vi.advanceTimersByTimeAsync(4_000);
    vi.setSystemTime(Date.now() - 2_000);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(attemptOnce).toHaveBeenCalledTimes(2);
    expect(settled).toEqual([synced]);
    retries.stop();
  });

  it('ignores going online before the Retry-After time, then retries once it has passed', async () => {
    const { attemptOnce, settled, retries } = loopWith([rateLimited, rateLimited]);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(2_000);
    retries.onOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(attemptOnce).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(3_000);
    expect(attemptOnce).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 5_000);
    retries.onOnline();
    await vi.advanceTimersByTimeAsync(0);
    expect(attemptOnce).toHaveBeenCalledTimes(3);
    expect(settled).toEqual([synced]);
    retries.stop();
  });

  it('stops retrying once stopped', async () => {
    const { attemptOnce, retries } = loopWith([rateLimited]);
    await vi.advanceTimersByTimeAsync(0);
    retries.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(attemptOnce).toHaveBeenCalledTimes(1);
  });
});
