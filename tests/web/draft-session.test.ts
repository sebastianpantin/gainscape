import { describe, expect, it, vi } from 'vitest';
import { draftRecord, type WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import {
  createDraftSession,
  type DraftChannel,
  type DraftMessage,
  type DraftSnapshot,
  flushOpenDraftSessions,
  SESSION_STAYS_ON_FALLBACK,
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
  return { get: fail, put: fail, markSynced: fail, discard: fail, forget: fail, userIdsWithDrafts: fail };
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
        clientId: 'card-bench',
        exerciseId: 'bench',
        name: 'Bench',
        modality: 'lift',
        loadType: 'external',
        target: null,
        sets: [{ id: 'set-a', weightKg: 60, reps, effort: null, done: true, isWarmup: false }],
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

  it('keeps a save problem showing while the store it should read cannot be opened, even when the fallback saves', async () => {
    const fallback = createLocalDraftStore(new MemoryStorage());
    const { session, latest } = sessionOver(() => Promise.reject(new Error('idb_unavailable')), {
      fallback: () => fallback,
    });
    await session.ready;
    expect(latest()).toMatchObject({ state: { status: 'ready', draft: null }, saveProblem: 'unreadable' });
    session.changeDraft(workout('session-a'));
    await session.flush();
    expect(await fallback.get(userId)).toMatchObject({ kind: 'draft', draft: { sessionId: 'session-a' } });
    expect(latest().saveProblem).toBe('unreadable');
  });

  it('opens the fallback without a read problem when the main store is withheld because this page load already saves there', async () => {
    const fallback = createLocalDraftStore(new MemoryStorage());
    await fallback.put(userId, 5, workout('logging-on-fallback'));
    const { session, latest, draft } = sessionOver(() => Promise.reject(new Error(SESSION_STAYS_ON_FALLBACK)), {
      fallback: () => fallback,
    });
    await session.ready;
    expect(draft()?.sessionId).toBe('logging-on-fallback');
    expect(latest()).toMatchObject({ store: fallback, saveProblem: null });
  });

  it('reports an unsaved change over an unreadable store when the fallback write fails too', async () => {
    const fallback = createLocalDraftStore(new MemoryStorage());
    const { session, latest } = sessionOver(() => Promise.reject(new Error('idb_unavailable')), {
      fallback: () => fallback,
    });
    await session.ready;
    fallback.put = () => Promise.reject(new Error('quota_exceeded'));
    session.changeDraft(workout('session-a'));
    await session.flush();
    expect(latest().saveProblem).toBe('unsaved');
  });

  it('becomes ready with a save problem when no store can be opened', async () => {
    const { session, latest } = sessionOver(() => Promise.reject(new Error('boot_failed')), {
      fallback: () => {
        throw new Error('no_local_storage');
      },
    });
    await session.ready;
    expect(latest()).toMatchObject({ state: { status: 'ready', draft: null }, saveProblem: 'unsaved' });
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
    expect(latest().saveProblem).toBeNull();
    expect(await fallback.get(userId)).toMatchObject({ kind: 'draft', draft: { sessionId: 'session-a' } });
  });

  it('reports a save problem when the fallback write fails too', async () => {
    const broken = failingStore();
    broken.get = async () => null;
    const { session, latest } = sessionOver(broken, { fallback: failingStore });
    await session.ready;
    session.changeDraft(workout('session-a'));
    await session.flush();
    expect(latest().saveProblem).toBe('unsaved');
  });

  it('round-trips a cardio draft through the store and a fresh session', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    const first = sessionOver(store);
    await first.session.ready;
    const cardio: WorkoutDraft = {
      ...workout('session-cardio'),
      exercises: [
        {
          clientId: 'card-run',
          exerciseId: 'run',
          name: 'Running',
          modality: 'cardio',
          activity: {
            paceUnit: 'per_km',
            referencePaceSPerKm: 360,
            maxEffort: 'max',
            tracksDistance: true,
            shares: [],
          },
          sets: [
            {
              id: 'bout-a',
              kind: 'cardio',
              durationS: 1800,
              distanceM: 5000,
              interval: null,
              effort: { type: 'cardio', level: 'hard' },
              done: true,
            },
            {
              id: 'bout-b',
              kind: 'cardio',
              durationS: 1800,
              distanceM: null,
              interval: { workS: 30, restS: 30, rounds: 10 },
              effort: null,
              done: false,
            },
          ],
        },
      ],
    };
    first.session.changeDraft(cardio);
    await first.session.flush();
    const second = sessionOver(store);
    await second.session.ready;
    expect(second.draft()).toEqual(cardio);
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
    expect(await store.get(userId)).toMatchObject({ kind: 'discarded', discardedSessionId: 'session-a' });
  });

  it('tells about a workout kept on the fallback and opens it instead of a fresh one once the shown one is done', async () => {
    const fallback = createLocalDraftStore(new MemoryStorage());
    await fallback.put(userId, 30, workout('kept-on-fallback'));
    const store = createLocalDraftStore(new MemoryStorage());
    await store.put(userId, 20, workout('shown', finishedAt));
    const { session, latest, draft } = sessionOver(store, { fallback: () => fallback });
    await session.ready;
    expect(draft()?.sessionId).toBe('shown');
    expect(latest().waitingDraft).toBe(true);

    await session.markSynced('shown');
    expect(await session.startWorkout(() => workout('fresh'))).toBe('opened_waiting');

    expect(draft()?.sessionId).toBe('kept-on-fallback');
    expect(latest().waitingDraft).toBe(false);
    session.updateDraft((current) => withReps(current, 5));
    await session.flush();
    expect(await fallback.get(userId)).toMatchObject({ draft: { sessionId: 'kept-on-fallback' } });
    expect(await store.get(userId)).toMatchObject({ kind: 'synced', syncedSessionId: 'shown' });
  });

  it('opens a workout kept on the fallback at once when the main store holds no draft', async () => {
    const fallback = createLocalDraftStore(new MemoryStorage());
    await fallback.put(userId, 30, workout('kept-on-fallback'));
    const store = createLocalDraftStore(new MemoryStorage());
    await store.put(userId, 20, workout('done', finishedAt));
    await store.discard(userId, 'done', 21);
    const { session, latest, draft } = sessionOver(store, { fallback: () => fallback });
    await session.ready;

    expect(draft()?.sessionId).toBe('kept-on-fallback');
    expect(latest()).toMatchObject({ waitingDraft: false, saveProblem: null });
  });

  it('keeps a synced workout gone at load when the fallback still holds a stale copy of the same session', async () => {
    const fallback = createLocalDraftStore(new MemoryStorage());
    await fallback.put(userId, 10, workout('done', finishedAt));
    const store = createLocalDraftStore(new MemoryStorage());
    await store.put(userId, 20, workout('done', finishedAt));
    await store.markSynced(userId, 'done', 21);
    const { session, latest, draft } = sessionOver(store, { fallback: () => fallback });
    await session.ready;

    expect(draft()).toBeNull();
    expect(latest()).toMatchObject({ store, waitingDraft: false });
  });

  it('starts fresh over a discarded workout instead of reopening its stale copy on the fallback', async () => {
    const fallback = createLocalDraftStore(new MemoryStorage());
    const store = createLocalDraftStore(new MemoryStorage());
    const { session, draft } = sessionOver(store, { fallback: () => fallback });
    await session.ready;
    await fallback.put(userId, 10, workout('discarded'));
    await store.put(userId, 20, workout('discarded'));
    await store.discard(userId, 'discarded', 21);

    expect(await session.startWorkout(() => workout('fresh'))).toBe('started');
    await session.flush();
    expect(draft()?.sessionId).toBe('fresh');
    expect(await store.get(userId)).toMatchObject({ kind: 'draft', draft: { sessionId: 'fresh' } });
  });

  it('opens newer fallback edits of a workout whose discard on the main store is older', async () => {
    const fallback = createLocalDraftStore(new MemoryStorage());
    const store = createLocalDraftStore(new MemoryStorage());
    await store.put(userId, 20, workout('kept-writing'));
    await store.discard(userId, 'kept-writing', 21);
    await fallback.put(userId, 30, workout('kept-writing'));
    const { session, draft } = sessionOver(store, { fallback: () => fallback });
    await session.ready;

    expect(draft()?.sessionId).toBe('kept-writing');
  });

  it('does not report a waiting workout when the fallback holds the shown one or nothing', async () => {
    const fallback = createLocalDraftStore(new MemoryStorage());
    const store = createLocalDraftStore(new MemoryStorage());
    await store.put(userId, 20, workout('shown'));
    const empty = sessionOver(store, { fallback: () => fallback });
    await empty.session.ready;
    expect(empty.latest().waitingDraft).toBe(false);
    await fallback.put(userId, 10, workout('shown'));
    const same = sessionOver(store, { fallback: () => fallback });
    await same.session.ready;
    expect(same.latest().waitingDraft).toBe(false);
  });

  it('keeps a forgotten workout gone when a tab still signed in to the deleted account writes it late', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    const stale = sessionOver(store);
    await stale.session.ready;
    stale.session.changeDraft(workout('session-a'));
    await stale.session.flush();

    await store.forget(userId);
    stale.session.updateDraft((draft) => withReps(draft, 5));
    await stale.session.flush();

    expect(await store.get(userId)).toMatchObject({ kind: 'forgotten', forgottenSessionId: 'session-a' });
    expect(stale.latest().state).toMatchObject({ draft: null, notice: null });
  });

  it('keeps a discarded workout gone when another tab writes it late', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    const first = sessionOver(store);
    await first.session.ready;
    first.session.changeDraft(workout('session-a'));
    await first.session.flush();
    const second = sessionOver(store);
    await second.session.ready;

    first.session.discardDraft('session-a');
    await first.session.flush();
    second.session.updateDraft((draft) => withReps(draft, 5));
    await second.session.flush();

    expect(await store.get(userId)).toMatchObject({ kind: 'discarded', discardedSessionId: 'session-a' });
    expect(second.latest().state).toMatchObject({ draft: null, notice: null });
    expect(await first.session.startWorkout(() => workout('session-b'))).toBe('started');
    await first.session.flush();
    expect(await store.get(userId)).toMatchObject({ kind: 'draft', draft: { sessionId: 'session-b' } });
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
    expect(await session.startWorkout(() => workout('fresh'))).toBe('resumed');
    await session.flush();
    expect(draft()).toMatchObject({ sessionId: 'finished-elsewhere', finishedAt });
    expect(await store.get(userId)).toMatchObject({ draft: { sessionId: 'finished-elsewhere' } });
  });

  it('starts a fresh draft over a tombstone another tab stamped later than this tab has seen', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    const { session, draft } = sessionOver(store);
    await session.ready;
    const later = Date.now() + 60_000;
    await store.put(userId, later, workout('discarded-elsewhere'));
    await store.discard(userId, 'discarded-elsewhere', later + 1);
    expect(await session.startWorkout(() => workout('fresh'))).toBe('started');
    await session.flush();
    expect(draft()?.sessionId).toBe('fresh');
    expect(await store.get(userId)).toMatchObject({ kind: 'draft', draft: { sessionId: 'fresh' } });
  });

  it('starts a fresh draft when nothing unsynced is stored', async () => {
    const store = createLocalDraftStore(new MemoryStorage());
    await store.markSynced(userId, 'old', 1);
    await store.put(userId, 1, workout('old', finishedAt));
    await store.markSynced(userId, 'old', 2);
    const { session, draft } = sessionOver(store);
    await session.ready;
    expect(await session.startWorkout(() => workout('fresh'))).toBe('started');
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
    expect(session.snapshot()).toMatchObject({ state: { status: 'ready', draft: null }, saveProblem: 'unsaved' });
  });
});

describe('flushOpenDraftSessions', () => {
  function afterPendingCallbacks(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  function slowStore() {
    const store = createLocalDraftStore(new MemoryStorage());
    const releases: (() => void)[] = [];
    const put: DraftStore['put'] = (...args) =>
      new Promise((resolve) => releases.push(() => resolve(store.put(...args))));
    return { store: { ...store, put }, releaseAll: () => releases.splice(0).forEach((release) => release()) };
  }

  it('awaits the pending writes of every open session', async () => {
    const first = slowStore();
    const second = slowStore();
    const sessions = [sessionOver(first.store), sessionOver(second.store)];
    await Promise.all(sessions.map(({ session }) => session.ready));
    sessions[0].session.changeDraft(workout('session-a'));
    sessions[1].session.changeDraft(workout('session-b'));
    let flushed = false;
    const flushing = flushOpenDraftSessions().then(() => {
      flushed = true;
    });
    await afterPendingCallbacks();
    expect(flushed).toBe(false);
    first.releaseAll();
    await afterPendingCallbacks();
    expect(flushed).toBe(false);
    second.releaseAll();
    await flushing;
    expect(await first.store.get(userId)).toMatchObject({ draft: { sessionId: 'session-a' } });
    expect(await second.store.get(userId)).toMatchObject({ draft: { sessionId: 'session-b' } });
    sessions.forEach(({ session }) => session.close());
  });

  it('no longer awaits a closed session', async () => {
    const slow = slowStore();
    const { session } = sessionOver(slow.store);
    await session.ready;
    session.changeDraft(workout('session-a'));
    session.close();
    await flushOpenDraftSessions();
    slow.releaseAll();
  });
});
