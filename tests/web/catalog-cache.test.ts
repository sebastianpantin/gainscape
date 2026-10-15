import { describe, expect, it, vi } from 'vitest';
import { type Exercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  exerciseCacheKey,
  exercisePickerList,
  forgetCachedExercises,
  loadExercisesCacheFirst,
  OFFLINE_EXERCISES_NOTICE,
  readCachedExercises,
  SAVED_EXERCISES_NOTICE,
  saveCachedExercises,
} from '../../web/src/lib/exercises/catalog-cache.ts';
import { OFFLINE_PROBLEM } from '../../web/src/offline/cache-first.ts';
import { MemoryStorage } from './memory-storage.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';

const exercises: Exercise[] = [
  {
    id: 'bench',
    name: 'Barbell Bench Press',
    equipment: 'barbell',
    modality: 'lift',
    loadType: 'external',
    compound: true,
    custom: false,
    archived: false,
    skillShares: [
      { skillKey: 'chest', skillName: 'Chest', shareBasisPoints: 7000 },
      { skillKey: 'shoulders', skillName: 'Shoulders', shareBasisPoints: 2000 },
      { skillKey: 'arms', skillName: 'Arms', shareBasisPoints: 1000 },
    ],
  },
  {
    id: 'mine',
    name: 'My Row',
    equipment: 'cable',
    modality: 'lift',
    loadType: 'external',
    custom: true,
    archived: false,
    skillShares: [],
  },
  {
    id: 'run',
    name: 'Running',
    equipment: 'bodyweight',
    modality: 'cardio',
    activity: {
      paceUnit: 'per_km',
      referencePaceSPerKm: 360,
      maxEffort: 'max',
      tracksDistance: true,
      shares: [{ skillKey: 'endurance', shareBasisPoints: 10_000 }],
    },
    custom: false,
    archived: false,
    skillShares: [{ skillKey: 'endurance', skillName: 'Endurance', shareBasisPoints: 10_000 }],
  },
];

const archivedCustom: Exercise = {
  id: 'old-row',
  name: 'Old Row',
  equipment: 'cable',
  modality: 'lift',
  loadType: 'external',
  custom: true,
  archived: true,
  skillShares: [],
};

function withoutModality(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'modality'));
}

describe('exercise list cache', () => {
  it('round-trips the exercise list', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    expect(readCachedExercises(storage, userId)).toEqual(exercises);
  });

  it('uses the per-user key', () => {
    expect(exerciseCacheKey(userId)).toBe(`gainscape.exercises.v3.${userId}`);
  });

  it('stores only the exercise fields', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, [{ ...exercises[0], secret: 'x' } as unknown as Exercise, exercises[2]]);
    const raw = JSON.parse(storage.getItem(exerciseCacheKey(userId))!);
    expect(Object.keys(raw.exercises[0]).sort()).toEqual(
      ['archived', 'compound', 'custom', 'equipment', 'id', 'loadType', 'modality', 'name', 'skillShares'].sort(),
    );
    expect(Object.keys(raw.exercises[1]).sort()).toEqual(
      ['activity', 'archived', 'custom', 'equipment', 'id', 'modality', 'name', 'skillShares'].sort(),
    );
  });

  it('discards a v2 list, which may hold only the active exercises, and removes it on save', () => {
    const storage = new MemoryStorage();
    const v2Key = `gainscape.exercises.v2.${userId}`;
    const v2 = JSON.stringify({ v: 2, savedAt: new Date().toISOString(), userId, exercises });
    storage.setItem(v2Key, v2);
    storage.setItem(exerciseCacheKey(userId), v2);
    expect(readCachedExercises(storage, userId)).toBeNull();
    saveCachedExercises(storage, userId, exercises);
    expect(storage.getItem(v2Key)).toBeNull();
  });

  it('discards a v1 list, which predates cardio', () => {
    const storage = new MemoryStorage();
    const v1Key = `gainscape.exercises.v1.${userId}`;
    const v1Exercises = exercises.slice(0, 2).map(withoutModality);
    const v1 = JSON.stringify({ v: 1, savedAt: new Date().toISOString(), userId, exercises: v1Exercises });
    storage.setItem(v1Key, v1);
    storage.setItem(exerciseCacheKey(userId), v1);
    expect(readCachedExercises(storage, userId)).toBeNull();
    saveCachedExercises(storage, userId, exercises);
    expect(storage.getItem(v1Key)).toBeNull();
  });

  it('reads a list saved before skill shares were cached with no skill shares', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    const raw = JSON.parse(storage.getItem(exerciseCacheKey(userId))!);
    for (const entry of raw.exercises) delete entry.skillShares;
    storage.setItem(exerciseCacheKey(userId), JSON.stringify(raw));
    expect(readCachedExercises(storage, userId)?.map((exercise) => exercise.skillShares)).toEqual([[], [], []]);
  });

  it('reads a cardio entry saved before distance tracking was cached as one that tracks distance', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    const raw = JSON.parse(storage.getItem(exerciseCacheKey(userId))!);
    for (const entry of raw.exercises) if (entry.activity) delete entry.activity.tracksDistance;
    storage.setItem(exerciseCacheKey(userId), JSON.stringify(raw));
    expect(readCachedExercises(storage, userId)?.[2]).toMatchObject({ activity: { tracksDistance: true } });
  });

  it('rejects an entry with a malformed skill share', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    const raw = JSON.parse(storage.getItem(exerciseCacheKey(userId))!);
    delete raw.exercises[0].skillShares[0].skillName;
    storage.setItem(exerciseCacheKey(userId), JSON.stringify(raw));
    expect(readCachedExercises(storage, userId)).toBeNull();
  });

  it('rejects a cardio entry without its activity', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    const raw = JSON.parse(storage.getItem(exerciseCacheKey(userId))!);
    delete raw.exercises[2].activity;
    storage.setItem(exerciseCacheKey(userId), JSON.stringify(raw));
    expect(readCachedExercises(storage, userId)).toBeNull();
  });

  it('returns null for another user, a wrong version and malformed JSON', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, otherUserId, exercises);
    storage.setItem(exerciseCacheKey(userId), storage.getItem(exerciseCacheKey(otherUserId))!);
    expect(readCachedExercises(storage, userId)).toBeNull();
    storage.setItem(
      exerciseCacheKey(userId),
      JSON.stringify({ v: 4, savedAt: new Date().toISOString(), userId, exercises }),
    );
    expect(readCachedExercises(storage, userId)).toBeNull();
    storage.setItem(exerciseCacheKey(userId), '{not json');
    expect(readCachedExercises(storage, userId)).toBeNull();
  });

  it('forgets the list', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    forgetCachedExercises(storage, userId);
    expect(readCachedExercises(storage, userId)).toBeNull();
  });
});

function loadWith(
  storage: MemoryStorage,
  fetchAll: () => Promise<Exercise[]>,
  isOffline: () => boolean = () => false,
  readSaved: () => Exercise[] | null = () => readCachedExercises(storage, userId),
) {
  return loadExercisesCacheFirst(storage, userId, fetchAll, readSaved, isOffline);
}

describe('loadExercisesCacheFirst', () => {
  it('saves the full live list, archived exercises included', async () => {
    const storage = new MemoryStorage();
    const load = await loadWith(storage, () => Promise.resolve([...exercises, archivedCustom]));
    expect(load).toEqual({ loaded: [...exercises, archivedCustom], fromCache: false });
    expect(readCachedExercises(storage, userId)).toEqual([...exercises, archivedCustom]);
  });

  it('falls back to the saved list as an offline copy when the fetch fails on the network', async () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    const load = await loadWith(storage, () => Promise.reject(new Error('Failed to fetch')));
    expect(load).toEqual({ loaded: exercises, fromCache: true, offline: true });
  });

  it('keeps the server problem when the server answered with an error while online', async () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    const load = await loadWith(storage, () =>
      Promise.reject({ message: 'permission denied for table exercises', code: '42501' }),
    );
    expect(load).toEqual({
      loaded: exercises,
      fromCache: true,
      offline: false,
      problem: 'permission denied for table exercises',
    });
  });

  it('answers with the saved list at once and sends no request while offline', async () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    const fetchLive = vi.fn(() => new Promise<Exercise[]>(() => undefined));
    expect(await loadWith(storage, fetchLive, () => true)).toEqual({
      loaded: exercises,
      fromCache: true,
      offline: true,
    });
    expect(fetchLive).not.toHaveBeenCalled();
  });

  it('fails fast with the offline problem while offline with nothing saved', async () => {
    const fetchLive = vi.fn(() => new Promise<Exercise[]>(() => undefined));
    await expect(loadWith(new MemoryStorage(), fetchLive, () => true)).rejects.toThrow(OFFLINE_PROBLEM);
    expect(fetchLive).not.toHaveBeenCalled();
  });

  it('reads the saved copy from the given reader, so other saved lists can fill in', async () => {
    const load = await loadWith(
      new MemoryStorage(),
      () => Promise.reject(new Error('Failed to fetch')),
      () => false,
      () => [archivedCustom],
    );
    expect(load.loaded).toEqual([archivedCustom]);
  });

  it('still answers when device storage is blocked', async () => {
    const load = await loadExercisesCacheFirst(
      null,
      userId,
      () => Promise.resolve(exercises),
      () => null,
      () => false,
    );
    expect(load).toEqual({ loaded: exercises, fromCache: false });
  });

  it('reports the load problem when the fetch fails and nothing is cached', async () => {
    await expect(loadWith(new MemoryStorage(), () => Promise.reject(new Error('Failed to fetch')))).rejects.toThrow(
      'Failed to fetch',
    );
  });
});

describe('exercisePickerList', () => {
  it('offers only the active exercises of a live list, with no notice', () => {
    expect(exercisePickerList({ loaded: [...exercises, archivedCustom], fromCache: false }, null)).toEqual({
      exercises,
      notice: null,
      problem: null,
    });
  });

  it('says offline for a saved copy the device fell back to offline or on the network', () => {
    expect(exercisePickerList({ loaded: exercises, fromCache: true, offline: true }, null)).toEqual({
      exercises,
      notice: OFFLINE_EXERCISES_NOTICE,
      problem: null,
    });
  });

  it('uses neutral wording for a saved copy the server refused to refresh', () => {
    expect(
      exercisePickerList({ loaded: exercises, fromCache: true, offline: false, problem: 'permission denied' }, null)
        .notice,
    ).toBe(SAVED_EXERCISES_NOTICE);
  });

  it('shows the load problem while there is no list at all', () => {
    expect(exercisePickerList(undefined, new Error(OFFLINE_PROBLEM))).toEqual({
      exercises: [],
      notice: null,
      problem: OFFLINE_PROBLEM,
    });
  });

  it('keeps showing a list after a later refresh failed', () => {
    expect(
      exercisePickerList({ loaded: exercises, fromCache: false }, new Error('Failed to fetch')).problem,
    ).toBeNull();
  });

  it('shows an empty list without a problem while the first load runs', () => {
    expect(exercisePickerList(undefined, null)).toEqual({ exercises: [], notice: null, problem: null });
  });
});
