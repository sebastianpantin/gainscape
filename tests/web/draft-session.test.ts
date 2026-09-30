import { describe, expect, it, vi } from 'vitest';
import { draftRecord, type WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import {
  createDraftSession,
  type DraftChannel,
  type DraftMessage,
  type DraftSnapshot,
} from '../../web/src/offline/draft-session.ts';
import { createLocalDraftStore, type DraftStore } from '../../web/src/offline/draft-store.ts';
import { workout } from './draft-store.contract.ts';
import { MemoryStorage } from './memory-storage.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const finishedAt = '2026-09-30T11:00:00.000Z';

function channelHub() {
  const members = new Set<DraftChannel>();
  return () => {
    const channel: DraftChannel = {
      onmessage: null,
      postMessage: (message: DraftMessage) => {
        for (const member of members)
          if (member !== channel) setTimeout(() => member.onmessage?.({ data: message } as MessageEvent<unknown>), 0);
      },
      close: () => members.delete(channel),
    };
    members.add(channel);
    return channel;
  };
}

function failingStore(): DraftStore {
  const fail = () => Promise.reject(new Error('storage_broken'));
  return { get: fail, put: fail, markSynced: fail, discard: fail, userIdsWithDrafts: fail };
}

function sessionOver(
  store: DraftStore | (() => Promise<DraftStore>),
  options: { fallback?: () => DraftStore; channel?: DraftChannel | null } = {},
) {
  const snapshots: DraftSnapshot[] = [];
  const session = createDraftSession({
    userId,
    openStore: typeof store === 'function' ? store : async () => store,
    fallbackStore: options.fallback ?? (() => createLocalDraftStore(new MemoryStorage())),
    channel: options.channel ?? null,
    onChange: (snapshot) => snapshots.push(snapshot),
  });
  const latest = () => session.snapshot();
  const draft = () => {
    const { state } = latest();
    return state.status === 'ready' ? state.draft : undefined;
  };
  return { session, snapshots, latest, draft };
}

function withReps(draft: WorkoutDraft, reps: number): WorkoutDraft {
  return {
    ...draft,
    exercises: [
      {
        exerciseId: 'bench',
        name: 'Bench',
        loadType: 'external',
        target: null,
        sets: [{ id: 'set-a', weightKg: 60, reps, effort: null, done: true }],
      },
    ],
  };
}

describe('draft session', () => {
  it('falls back to the localStorage store and becomes ready when opening the store fails', async () => {
    const storage = new MemoryStorage();
    const fallback = createLocalDraftStore(storage);
    await fallback.put(userId, 5, workout('kept'));
    const { session, latest, draft } = sessionOver(() => Promise.reject(new Error('boot_failed')), {
      fallback: () => fallback,
    });
    await session.ready;
    expect(latest().store).toBe(fallback);
    expect(draft()?.sessionId).toBe('kept');
  });

  it('becomes ready with a save problem when no store can be opened', async () => {
    const { session, latest } = sessionOver(() => Promise.reject(new Error('boot_failed')), {
      fallback: () => {
        throw new Error('no_local_storage');
      },
    });
    await session.ready;
    expect(latest()).toMatchObject({ state: { status: 'ready', draft: null }, saveProblem: true });
  });

  it('retries a failed write on the fallback store and switches to it', async () => {
    const fallback = createLocalDraftStore(new MemoryStorage());
    const broken = failingStore();
    broken.get = async () => null;
    const { session, latest } = sessionOver(broken, { fallback: () => fallback });
    await session.ready;
    session.changeDraft(workout('session-a'));
    await session.flush();
    expect(latest().store).toBe(fallback);
    expect(latest().saveProblem).toBe(false);
    expect(await fallback.get(userId)).toMatchObject({ kind: 'draft', draft: { sessionId: 'session-a' } });
  });

  it('reports a save problem when the fallback write fails too', async () => {
    const broken = failingStore();
    broken.get = async () => null;
    const { session, latest } = sessionOver(broken, { fallback: failingStore });
    await session.ready;
    session.changeDraft(workout('session-a'));
    await session.flush();
    expect(latest().saveProblem).toBe(true);
  });

  it('applies updateDraft to the latest draft, not a stale copy', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    const { session, draft } = sessionOver(store);
    await session.ready;
    session.changeDraft(withReps(workout('session-a'), 5));
    const staleCopy = draft()!;
    session.changeDraft(withReps(staleCopy, 9));
    session.updateDraft((latest) => ({ ...latest, finishedAt }));
    await session.flush();
    expect(draft()).toMatchObject({ finishedAt, exercises: [{ sets: [{ reps: 9 }] }] });
    expect(await store.get(userId)).toMatchObject({ draft: { finishedAt, exercises: [{ sets: [{ reps: 9 }] }] } });
  });

  it('tells other tabs about a discard so they drop the draft without a saved-elsewhere notice', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    const openChannel = channelHub();
    const first = sessionOver(store, { channel: openChannel() });
    const second = sessionOver(store, { channel: openChannel() });
    await Promise.all([first.session.ready, second.session.ready]);

    first.session.changeDraft(workout('session-a'));
    await vi.waitFor(() => expect(second.draft()?.sessionId).toBe('session-a'));
    first.session.discardDraft('session-a');
    await vi.waitFor(() => expect(second.draft()).toBeNull());
    expect(second.latest().state).toMatchObject({ notice: null });
    expect(await store.get(userId)).toBeNull();
  });

  it('tells other tabs a workout was deleted, not saved, when its sync came back deleted', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    const openChannel = channelHub();
    const first = sessionOver(store, { channel: openChannel() });
    const second = sessionOver(store, { channel: openChannel() });
    await Promise.all([first.session.ready, second.session.ready]);

    first.session.changeDraft(workout('session-a', finishedAt));
    await vi.waitFor(() => expect(second.draft()?.sessionId).toBe('session-a'));
    await first.session.markSynced('session-a', 'deleted');
    await vi.waitFor(() => expect(second.draft()).toBeNull());
    expect(second.latest().state).toMatchObject({ notice: 'deleted' });

    await second.session.reload();
    expect(second.latest().state).toMatchObject({ notice: 'deleted' });
    await first.session.reload('deleted');
    expect(first.latest().state).toMatchObject({ draft: null, notice: 'deleted' });
    expect(await store.get(userId)).toMatchObject({ kind: 'synced', syncedSessionId: 'session-a' });
  });

  it('still says saved elsewhere after a normal sync in another tab', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    const openChannel = channelHub();
    const first = sessionOver(store, { channel: openChannel() });
    const second = sessionOver(store, { channel: openChannel() });
    await Promise.all([first.session.ready, second.session.ready]);

    first.session.changeDraft(workout('session-a', finishedAt));
    await vi.waitFor(() => expect(second.draft()?.sessionId).toBe('session-a'));
    await first.session.markSynced('session-a');
    await vi.waitFor(() => expect(second.draft()).toBeNull());
    expect(second.latest().state).toMatchObject({ notice: 'saved_elsewhere' });
  });

  it('resumes an unsynced finished draft instead of starting over it', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    const { session, draft } = sessionOver(store);
    await session.ready;
    await store.put(userId, Date.now() + 60_000, workout('finished-elsewhere', finishedAt));
    expect(await session.startWorkout(() => workout('fresh'))).toBe(false);
    await session.flush();
    expect(draft()).toMatchObject({ sessionId: 'finished-elsewhere', finishedAt });
    expect(await store.get(userId)).toMatchObject({ draft: { sessionId: 'finished-elsewhere' } });
  });

  it('starts a fresh draft when nothing unsynced is stored', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    await store.markSynced(userId, 'old', 1);
    await store.put(userId, 1, workout('old', finishedAt));
    await store.markSynced(userId, 'old', 2);
    const { session, draft } = sessionOver(store);
    await session.ready;
    expect(await session.startWorkout(() => workout('fresh'))).toBe(true);
    await session.flush();
    expect(draft()?.sessionId).toBe('fresh');
    expect(await store.get(userId)).toEqual(draftRecord(userId, expect.any(Number), workout('fresh')));
  });
});

describe('draft session start-up', () => {
  it('never calls onChange before createDraftSession has returned, even when every store throws synchronously', async () => {
    const seenSessions: unknown[] = [];
    let session: ReturnType<typeof createDraftSession> | undefined = undefined;
    session = createDraftSession({
      userId,
      openStore: () => {
        throw new Error('localStorage_denied');
      },
      fallbackStore: () => {
        throw new Error('localStorage_denied');
      },
      channel: null,
      onChange: () => seenSessions.push(session),
    });
    await session.ready;
    expect(seenSessions.length).toBeGreaterThan(0);
    expect(seenSessions.every((seen) => seen === session)).toBe(true);
    expect(session.snapshot()).toMatchObject({ state: { status: 'ready', draft: null }, saveProblem: true });
  });
});
