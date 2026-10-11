import type { SessionSummary } from '@domain/types.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rememberLastSummary } from '../../web/src/features/summary/last-summary.ts';
import { saveCachedExercises } from '../../web/src/lib/catalog-cache.ts';
import { type Exercise } from '../../web/src/lib/catalog-rules.ts';
import { saveCachedExerciseNotes } from '../../web/src/lib/exercise-note-cache.ts';
import { saveLastSeenRelease } from '../../web/src/lib/last-seen-release-store.ts';
import { parsePlateSettings } from '../../web/src/lib/plate-rules.ts';
import { savePlateSettings } from '../../web/src/lib/plate-settings-store.ts';
import { cachePreferences } from '../../web/src/lib/preferences.ts';
import { type Profile } from '../../web/src/lib/profile-rules.ts';
import { dismissSummary } from '../../web/src/lib/program-summary-store.ts';
import { parseRestState } from '../../web/src/lib/rest-timer-rules.ts';
import { saveRestState } from '../../web/src/lib/rest-timer-store.ts';
import { saveSessionBaseline } from '../../web/src/lib/session-baseline-store.ts';
import { parseTrainingDeviceSettings } from '../../web/src/lib/training-device-rules.ts';
import { claimRestAlert, saveTrainingDeviceSettings } from '../../web/src/lib/training-device-store.ts';
import { collectionCache, type SavedCollection } from '../../web/src/offline/collection-cache.ts';
import { createLocalDraftStore, fallbackKeyFor, readFallbackRecord } from '../../web/src/offline/draft-store.ts';
import { type ItemsCache, saveItemsCache } from '../../web/src/offline/items-cache.ts';
import { profileCache } from '../../web/src/offline/profile-cache.ts';
import { EMPTY_PROGRAM_CACHE, saveProgramCache } from '../../web/src/offline/program-cache.ts';
import { programListCache } from '../../web/src/offline/program-list-cache.ts';
import { standingCache } from '../../web/src/offline/standing-cache.ts';
import { forgetUserDeviceData } from '../../web/src/offline/user-device-data.ts';
import { installCardKey } from '../../web/src/pwa/install-state.ts';
import { workout } from './draft-store.contract.ts';
import { MemoryStorage } from './memory-storage.ts';

const LEAVING_USER = '11111111-1111-4111-8111-111111111111';
const STAYING_USER = '22222222-2222-4222-8222-222222222222';

const WEB_SRC = join(import.meta.dirname, '../../web/src');

const NAMES_THAT_ARE_NOT_STORAGE_KEYS = new Set(['gainscape.rest-alert', 'gainscape.drafts', 'gainscape.finish.']);

const EXERCISE: Exercise = {
  id: 'bench',
  key: 'bench',
  name: 'Barbell Bench Press',
  equipment: 'barbell',
  custom: false,
  archived: false,
  skillShares: [],
  modality: 'lift',
  loadType: 'external',
  compound: true,
};

const SUMMARY = {
  sessionId: 'session-a',
  xpBySkill: {},
  levelUps: [],
  prs: [],
  drops: [],
} as unknown as SessionSummary;

let local: MemoryStorage;
let session: MemoryStorage;

beforeEach(() => {
  local = new MemoryStorage();
  session = new MemoryStorage();
  vi.stubGlobal('localStorage', local);
  vi.stubGlobal('sessionStorage', session);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function writeEveryStore(userId: string): Promise<void> {
  saveCachedExercises(local, userId, [EXERCISE]);
  local.setItem(`gainscape.exercises.v1.${userId}`, JSON.stringify({ v: 1, userId, exercises: [] }));
  local.setItem(`gainscape.exercises.v2.${userId}`, JSON.stringify({ v: 2, userId, exercises: [] }));
  saveCachedExerciseNotes(local, userId, { bench: 'Pause on the chest.' });
  saveLastSeenRelease(local, userId, '0.4.0');
  savePlateSettings(local, userId, parsePlateSettings(null));
  cachePreferences(userId, { unitPref: 'lb', effortInputMode: 'rpe' });
  dismissSummary(local, userId, 'program-a:week-1');
  saveRestState(local, userId, parseRestState(null));
  saveSessionBaseline(local, userId, { asOf: '2026-10-05T08:00:00.000Z', strength: {}, records: null });
  saveTrainingDeviceSettings(local, userId, parseTrainingDeviceSettings(null));
  claimRestAlert(local, userId, 1_000);
  collectionCache.save(local, userId, { rows: {} } as unknown as SavedCollection);
  saveItemsCache(local, userId, { catalog: { items: [] }, inventory: [] } as unknown as ItemsCache);
  profileCache.save(local, userId, { username: 'lifter' } as unknown as Profile);
  saveProgramCache(local, userId, EMPTY_PROGRAM_CACHE);
  programListCache.save(local, userId, []);
  standingCache.save(local, userId, { skills: [], xpBySkillId: {} });
  local.setItem(installCardKey(userId), 'due');
  await createLocalDraftStore(local).put(userId, 10, workout(`session-of-${userId}`));
  rememberLastSummary(userId, SUMMARY);
}

function entriesOf(storage: Storage): [string, string][] {
  return Array.from({ length: storage.length }, (_, index) => {
    const key = storage.key(index) ?? '';
    return [key, storage.getItem(key) ?? ''];
  });
}

function entriesMentioning(storage: Storage, userId: string): [string, string][] {
  return entriesOf(storage).filter(([key, value]) => key.includes(userId) || value.includes(userId));
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

function storageKeyNamesInSource(): string[] {
  const names = sourceFiles(WEB_SRC).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/['`](gainscape\.[\w.-]*)/g)].map((match) => match[1] ?? ''),
  );
  return [...new Set(names)].filter((name) => !NAMES_THAT_ARE_NOT_STORAGE_KEYS.has(name));
}

describe('forgetting a user on this device', () => {
  it('clears every key and value of that user and keeps the other user', async () => {
    await writeEveryStore(LEAVING_USER);
    await writeEveryStore(STAYING_USER);
    const stayingBefore = entriesMentioning(local, STAYING_USER);
    rememberLastSummary(LEAVING_USER, SUMMARY);

    await forgetUserDeviceData(
      { localStorage: local, sessionStorage: session, draftStore: createLocalDraftStore(local) },
      LEAVING_USER,
    );

    const leftovers = entriesMentioning(local, LEAVING_USER).map(([key]) => key);
    expect(leftovers).toEqual([fallbackKeyFor(LEAVING_USER)]);
    expect(readFallbackRecord(local, LEAVING_USER)?.kind).toBe('forgotten');
    expect(entriesMentioning(session, LEAVING_USER)).toEqual([]);
    expect(entriesMentioning(local, STAYING_USER)).toEqual(stayingBefore);
  });

  it('keeps the remembered summary of another user in this tab', async () => {
    rememberLastSummary(STAYING_USER, SUMMARY);
    await forgetUserDeviceData(
      { localStorage: local, sessionStorage: session, draftStore: createLocalDraftStore(local) },
      LEAVING_USER,
    );
    expect(entriesMentioning(session, STAYING_USER)).toHaveLength(1);
  });

  it('writes a per-user key for every gainscape storage key named in the web source', async () => {
    await writeEveryStore(LEAVING_USER);
    const writtenKeys = [...entriesOf(local), ...entriesOf(session)]
      .filter(([key, value]) => key.includes(LEAVING_USER) || value.includes(LEAVING_USER))
      .map(([key]) => key);
    const unwritten = storageKeyNamesInSource().filter((name) => !writtenKeys.some((key) => key.startsWith(name)));
    expect(unwritten).toEqual([]);
  });
});
