import { describe, expect, it } from 'vitest';
import { openDraftStore } from '../../web/src/offline/draft-boot.ts';
import { discardedRecord, draftRecord, type WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import {
  createIdbDraftStore,
  type DraftStore,
  fallbackKeyFor,
  openDraftDatabase,
} from '../../web/src/offline/draft-store.ts';

interface DraftStoreHarness {
  store: DraftStore;
  storage: Storage;
  indexedDB: IDBFactory | undefined;
}

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '44444444-4444-4444-8444-444444444444';

export function workout(sessionId: string, finishedAt: string | null = null): WorkoutDraft {
  return {
    sessionId,
    startedAt: '2026-09-30T10:00:00.000Z',
    finishedAt,
    programDayId: null,
    programLabel: null,
    program: null,
    challenge: null,
    exercises: [],
  };
}

const finished = '2026-09-30T11:00:00.000Z';

export function describeDraftStoreContract(name: string, createHarness: () => Promise<DraftStoreHarness>) {
  describe(`${name} draft store`, () => {
    it('round-trips a draft', async () => {
      const { store } = await createHarness();
      const draft = workout('session-a');
      expect(await store.put(userId, 10, draft)).toBe('written');
      expect(await store.get(userId)).toEqual(draftRecord(userId, 10, draft));
      expect(await store.get(otherUserId)).toBeNull();
      expect(await store.userIdsWithDrafts()).toEqual([userId]);
    });

    it('refuses a stale put', async () => {
      const { store } = await createHarness();
      await store.put(userId, 20, workout('session-a'));
      expect(await store.put(userId, 19, workout('session-a', finished))).toBe('stale');
      expect((await store.get(userId))?.updatedAt).toBe(20);
    });

    it('answers synced for a put after markSynced and hides the user from userIdsWithDrafts', async () => {
      const { store } = await createHarness();
      await store.put(userId, 10, workout('session-a', finished));
      await store.markSynced(userId, 'session-a', 11);
      expect(await store.put(userId, 12, workout('session-a'))).toBe('synced');
      expect(await store.get(userId)).toMatchObject({ kind: 'synced', syncedSessionId: 'session-a' });
      expect(await store.userIdsWithDrafts()).toEqual([]);
    });

    it('does not tombstone a different session', async () => {
      const { store } = await createHarness();
      await store.put(userId, 10, workout('session-b'));
      await store.markSynced(userId, 'session-a', 11);
      expect(await store.get(userId)).toMatchObject({ kind: 'draft', updatedAt: 10 });
    });

    it('lets a new session replace a tombstone', async () => {
      const { store } = await createHarness();
      await store.put(userId, 10, workout('session-a', finished));
      await store.markSynced(userId, 'session-a', 11);
      expect(await store.put(userId, 12, workout('session-b'))).toBe('written');
      expect(await store.get(userId)).toEqual(draftRecord(userId, 12, workout('session-b')));
      expect(await store.userIdsWithDrafts()).toEqual([userId]);
    });

    it('refuses to reopen a finished draft unless asked to', async () => {
      const { store } = await createHarness();
      await store.put(userId, 10, workout('session-a', finished));
      expect(await store.put(userId, 11, workout('session-a'))).toBe('refused_reopen');
      expect(await store.get(userId)).toMatchObject({ updatedAt: 10, draft: { finishedAt: finished } });
      expect(await store.put(userId, 12, workout('session-a'), { reopen: true })).toBe('written');
      expect(await store.get(userId)).toMatchObject({ updatedAt: 12, draft: { finishedAt: null } });
    });

    it('keeps the record when discard names another session', async () => {
      const { store } = await createHarness();
      await store.put(userId, 10, workout('session-a'));
      await store.discard(userId, 'session-b', 11);
      expect(await store.get(userId)).toEqual(draftRecord(userId, 10, workout('session-a')));
      await store.discard(userId, 'session-a', 12);
      expect(await store.get(userId)).toMatchObject({ kind: 'discarded', discardedSessionId: 'session-a' });
      expect(await store.userIdsWithDrafts()).toEqual([]);
    });

    it('refuses a late write of a discarded session but lets a new session start', async () => {
      const { store } = await createHarness();
      await store.put(userId, 10, workout('session-a', finished));
      await store.discard(userId, 'session-a', 11);
      expect(await store.put(userId, 50, workout('session-a', finished))).toBe('discarded');
      expect(await store.get(userId)).toEqual(discardedRecord(userId, 11, 'session-a'));
      expect(await store.put(userId, 12, workout('session-b'))).toBe('written');
      expect(await store.get(userId)).toEqual(draftRecord(userId, 12, workout('session-b')));
    });

    it('stamps a discard after the stored record even when the claimed time is older', async () => {
      const { store } = await createHarness();
      await store.put(userId, 20, workout('session-a'));
      await store.discard(userId, 'session-a', 5);
      expect(await store.get(userId)).toEqual(discardedRecord(userId, 21, 'session-a'));
    });

    it('deletes v1 drafts at boot without migrating them', async () => {
      const { storage, indexedDB } = await createHarness();
      const v1Key = `gainscape.workout-draft.${otherUserId}`;
      storage.setItem(v1Key, JSON.stringify({ v: 1, userId: otherUserId, draft: workout('old') }));
      storage.setItem('gainscape.last-summary', '{}');
      const booted = await openDraftStore({ indexedDB, storage });
      expect(storage.getItem(v1Key)).toBeNull();
      expect(storage.getItem('gainscape.last-summary')).toBe('{}');
      expect(await booted.get(otherUserId)).toBeNull();
    });

    it('reconciles the fallback record at boot', async () => {
      const { storage, indexedDB } = await createHarness();
      const fallbackKey = fallbackKeyFor(userId);
      const fallback = draftRecord(userId, 30, workout('session-a', finished));
      storage.setItem(fallbackKey, JSON.stringify(fallback));

      if (!indexedDB) {
        const booted = await openDraftStore({ indexedDB, storage });
        expect(await booted.get(userId)).toEqual(fallback);
        expect(storage.getItem(fallbackKey)).not.toBeNull();
        return;
      }

      const database = await openDraftDatabase(indexedDB);
      const direct = createIdbDraftStore(database!);
      await direct.put(userId, 20, workout('session-a'));
      await direct.put(otherUserId, 50, workout('other-from-idb'));
      storage.setItem(
        fallbackKeyFor(otherUserId),
        JSON.stringify(draftRecord(otherUserId, 40, workout('other-from-idb'))),
      );

      const booted = await openDraftStore({ indexedDB, storage });
      expect(await booted.get(userId)).toEqual(fallback);
      expect(await booted.get(otherUserId)).toEqual(draftRecord(otherUserId, 50, workout('other-from-idb')));
      expect(storage.getItem(fallbackKey)).toBeNull();
      expect(storage.getItem(fallbackKeyFor(otherUserId))).toBeNull();
      database!.close();
    });
  });
}
