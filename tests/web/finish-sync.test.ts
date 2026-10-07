import { describe, expect, it, vi } from 'vitest';
import { draftRecord, type StoredDraft, syncedRecord, type WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import type { DraftStore } from '../../web/src/offline/draft-store.ts';
import { attemptFinish, finishLockName, type SendOutcome, sendOutcomeFrom } from '../../web/src/offline/finish-lock.ts';
import { workout } from './draft-store.contract.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = 'session-a';
const finishedAt = '2026-09-30T11:00:00.000Z';
const synced: SendOutcome = {
  kind: 'synced',
  summary: { sessionId, xpBySkill: {}, levelUps: [], prs: [], drops: [] },
};

function slowWriteStore(initial: StoredDraft | null) {
  let record = initial;
  const store: DraftStore = {
    get: async () => record,
    put: (_userId, updatedAt, draft) =>
      new Promise((resolve) =>
        setTimeout(() => {
          record = draftRecord(userId, updatedAt, draft);
          resolve('written');
        }, 20),
      ),
    markSynced: async (_userId, syncedSessionId, updatedAt) => {
      record = syncedRecord(userId, updatedAt, syncedSessionId);
    },
    discard: async () => {
      record = null;
    },
    userIdsWithDrafts: async () => (record?.kind === 'draft' ? [userId] : []),
  };
  return { store, current: () => record };
}

function attemptWith(
  store: DraftStore,
  flush: () => Promise<void> = async () => undefined,
  signal?: AbortSignal,
  outcome: SendOutcome = synced,
) {
  const send = vi.fn<(draft: WorkoutDraft) => Promise<SendOutcome>>(async () => outcome);
  const markSynced = vi.fn((syncedSessionId: string) => store.markSynced(userId, syncedSessionId, 99));
  const result = attemptFinish({
    userId,
    sessionId,
    store,
    flush,
    send,
    markSynced,
    signal: signal ?? new AbortController().signal,
  });
  return { result, send, markSynced };
}

describe('attemptFinish', () => {
  it('awaits flush and POSTs the stored finished draft', async () => {
    const { store, current } = slowWriteStore(draftRecord(userId, 1, workout(sessionId)));
    const pendingWrite = store.put(userId, 2, workout(sessionId, finishedAt));
    const { result, send, markSynced } = attemptWith(store, async () => {
      await pendingWrite;
    });

    expect(await result).toEqual({ kind: 'sent', outcome: synced });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({ sessionId, finishedAt });
    expect(markSynced).toHaveBeenCalledWith(sessionId, 'synced');
    expect(current()).toMatchObject({ kind: 'synced', syncedSessionId: sessionId });
  });

  it('is superseded without a POST when the session is already tombstoned', async () => {
    const { store } = slowWriteStore(syncedRecord(userId, 5, sessionId));
    const { result, send } = attemptWith(store);
    expect(await result).toEqual({ kind: 'superseded' });
    expect(send).not.toHaveBeenCalled();
  });

  it('stops without a POST and without superseding when the same session was reopened', async () => {
    const { store } = slowWriteStore(draftRecord(userId, 5, workout(sessionId)));
    const { result, send } = attemptWith(store);
    expect(await result).toEqual({ kind: 'not_finished' });
    expect(send).not.toHaveBeenCalled();
  });

  it('is superseded by a different session with a higher updatedAt', async () => {
    const { store } = slowWriteStore(draftRecord(userId, 50, workout('session-b')));
    const { result, send } = attemptWith(store);
    expect(await result).toEqual({ kind: 'superseded' });
    expect(send).not.toHaveBeenCalled();
  });

  it('releases the lock request when its signal aborts on unmount', async () => {
    const { store } = slowWriteStore(draftRecord(userId, 5, workout(sessionId, finishedAt)));
    let releaseHolder = () => {};
    const held = navigator.locks.request(
      finishLockName(userId),
      () => new Promise<void>((resolve) => (releaseHolder = resolve)),
    );
    const controller = new AbortController();
    const { result, send } = attemptWith(store, async () => undefined, controller.signal);

    await vi.waitFor(async () => expect((await navigator.locks.query()).pending).toHaveLength(1));
    controller.abort();
    expect(await result).toEqual({ kind: 'aborted' });

    releaseHolder();
    await held;
    await vi.waitFor(async () => expect(await navigator.locks.query()).toEqual({ held: [], pending: [] }));
    const freeLock = await navigator.locks.request(finishLockName(userId), { ifAvailable: true }, (lock) => lock);
    expect(freeLock).not.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('treats a 410 session_deleted as terminal and tombstones the draft so it never comes back', async () => {
    const { store, current } = slowWriteStore(draftRecord(userId, 5, workout(sessionId, finishedAt)));
    const { result, send, markSynced } = attemptWith(store, undefined, undefined, { kind: 'deleted' });
    expect(await result).toEqual({ kind: 'sent', outcome: { kind: 'deleted' } });
    expect(send).toHaveBeenCalledOnce();
    expect(markSynced).toHaveBeenCalledWith(sessionId, 'deleted');
    expect(current()).toMatchObject({ kind: 'synced', syncedSessionId: sessionId });

    const retry = attemptWith(store);
    expect(await retry.result).toEqual({ kind: 'superseded' });
    expect(retry.send).not.toHaveBeenCalled();
  });

  it('keeps the draft after a rejection', async () => {
    const { store, current } = slowWriteStore(draftRecord(userId, 5, workout(sessionId, finishedAt)));
    const { result, markSynced } = attemptWith(store, undefined, undefined, { kind: 'rejected', reason: 'x' });
    expect(await result).toEqual({ kind: 'sent', outcome: { kind: 'rejected', reason: 'x' } });
    expect(markSynced).not.toHaveBeenCalled();
    expect(current()).toMatchObject({ kind: 'draft' });
  });
});

describe('sendOutcomeFrom', () => {
  const summary = { sessionId, xpBySkill: {}, levelUps: [], prs: [], drops: [] };

  it('maps complete-session responses to finish outcomes', () => {
    expect(sendOutcomeFrom({ kind: 'ok', data: summary })).toEqual({ kind: 'synced', summary });
    expect(sendOutcomeFrom({ kind: 'http_error', status: 410, code: 'session_deleted', details: undefined })).toEqual({
      kind: 'deleted',
    });
    expect(sendOutcomeFrom({ kind: 'http_error', status: 503, code: 'rebuild_required', details: undefined })).toEqual({
      kind: 'retryable',
      reason: 'rebuild_required',
    });
    expect(
      sendOutcomeFrom({ kind: 'http_error', status: 409, code: 'session_id_conflict', details: undefined }),
    ).toEqual({ kind: 'rejected', reason: 'session_id_conflict' });
    expect(sendOutcomeFrom({ kind: 'needs_sign_in' })).toEqual({ kind: 'needs_sign_in' });
    expect(sendOutcomeFrom({ kind: 'retryable', reason: 'offline' })).toEqual({ kind: 'retryable', reason: 'offline' });
  });

  it('marks a server error as a server fault, but not the rebuild gate', () => {
    expect(sendOutcomeFrom({ kind: 'http_error', status: 500, code: 'internal_error', details: undefined })).toEqual({
      kind: 'retryable',
      reason: 'internal_error',
      serverFault: true,
    });
    expect(sendOutcomeFrom({ kind: 'http_error', status: 546, code: 'http_546', details: undefined })).toEqual({
      kind: 'retryable',
      reason: 'http_546',
      serverFault: true,
    });
  });

  it('treats a rate limit as transient and waits for Retry-After', () => {
    expect(
      sendOutcomeFrom({
        kind: 'http_error',
        status: 429,
        code: 'rate_limited',
        details: { bucket: 'session_create_hour', retryAfterSeconds: 1200 },
      }),
    ).toEqual({ kind: 'retryable', reason: 'rate_limited', retryAfterMs: 1_200_000 });
    expect(sendOutcomeFrom({ kind: 'http_error', status: 429, code: 'rate_limited', details: undefined })).toEqual({
      kind: 'retryable',
      reason: 'rate_limited',
      retryAfterMs: undefined,
    });
  });

  it('keeps a history-only summary as a successful sync', () => {
    const historyOnly = { ...summary, historyOnly: true as const };
    expect(sendOutcomeFrom({ kind: 'ok', data: historyOnly })).toEqual({ kind: 'synced', summary: historyOnly });
  });
});
