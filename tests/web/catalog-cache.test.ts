import { describe, expect, it, vi } from 'vitest';
import { type Exercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  exerciseCacheKey,
  type ExerciseList,
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

describe('cache-first exercise picker', () => {
  it('shows the cached list before the live list arrives, then swaps in the live list', async () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises.slice(0, 1));
    const shown: ExerciseList[] = [];
    let resolveLive: (list: Exercise[]) => void = () => undefined;
    const loading = loadExercisesCacheFirst(
      storage,
      userId,
      () => new Promise((resolve) => (resolveLive = resolve)),
      (list) => shown.push(list),
    );
    expect(shown).toEqual([{ exercises: exercises.slice(0, 1), notice: null, problem: null }]);
    resolveLive(exercises);
    await loading;
    expect(shown.at(-1)).toEqual({ exercises, notice: null, problem: null });
    expect(readCachedExercises(storage, userId)).toEqual(exercises);
  });

  it('keeps the cached list with the offline notice when the fetch fails', async () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    const shown: ExerciseList[] = [];
    await loadExercisesCacheFirst(
      storage,
      userId,
      () => Promise.reject(new Error('Failed to fetch')),
      (list) => shown.push(list),
    );
    expect(shown.at(-1)).toEqual({ exercises, notice: OFFLINE_EXERCISES_NOTICE, problem: null });
  });

  it('uses neutral wording when the server answered with an error while online', async () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    const shown: ExerciseList[] = [];
    await loadExercisesCacheFirst(
      storage,
      userId,
      () => Promise.reject({ message: 'permission denied for table exercises', code: '42501' }),
      (list) => shown.push(list),
      () => false,
    );
    expect(shown.at(-1)?.notice).toBe(SAVED_EXERCISES_NOTICE);
  });

  it('shows the saved list with the offline notice at once and sends no request while offline', async () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    const fetchLive = vi.fn(() => new Promise<Exercise[]>(() => undefined));
    const shown: ExerciseList[] = [];
    await loadExercisesCacheFirst(
      storage,
      userId,
      fetchLive,
      (list) => shown.push(list),
      () => true,
    );
    expect(shown).toEqual([{ exercises, notice: OFFLINE_EXERCISES_NOTICE, problem: null }]);
    expect(fetchLive).not.toHaveBeenCalled();
  });

  it('fails fast with the offline problem while offline with nothing saved', async () => {
    const fetchLive = vi.fn(() => new Promise<Exercise[]>(() => undefined));
    const shown: ExerciseList[] = [];
    await loadExercisesCacheFirst(
      new MemoryStorage(),
      userId,
      fetchLive,
      (list) => shown.push(list),
      () => true,
    );
    expect(shown).toEqual([{ exercises: [], notice: null, problem: OFFLINE_PROBLEM }]);
    expect(fetchLive).not.toHaveBeenCalled();
  });

  it('says offline when the device went offline while the request ran, whatever the error says', async () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    let offlineChecks = 0;
    const shown: ExerciseList[] = [];
    await loadExercisesCacheFirst(
      storage,
      userId,
      () => Promise.reject({ message: 'server error' }),
      (list) => shown.push(list),
      () => offlineChecks++ > 0,
    );
    expect(shown).toEqual([
      { exercises, notice: null, problem: null },
      { exercises, notice: OFFLINE_EXERCISES_NOTICE, problem: null },
    ]);
  });

  it('says offline when the request timed out', async () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    const notices: (string | null)[] = [];
    await loadExercisesCacheFirst(
      storage,
      userId,
      () => Promise.reject(new DOMException('signal timed out', 'TimeoutError')),
      (list) => notices.push(list.notice),
      () => false,
    );
    expect(notices.at(-1)).toBe(OFFLINE_EXERCISES_NOTICE);
  });

  it('offers only active exercises offline after the full list, archived ones included, was saved', async () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, [...exercises, archivedCustom]);
    const shown: ExerciseList[] = [];
    await loadExercisesCacheFirst(
      storage,
      userId,
      () => Promise.reject(new Error('Failed to fetch')),
      (list) => shown.push(list),
      () => true,
    );
    expect(shown).toEqual([{ exercises, notice: OFFLINE_EXERCISES_NOTICE, problem: null }]);
  });

  it('saves the full live list and shows only its active exercises', async () => {
    const storage = new MemoryStorage();
    const shown: ExerciseList[] = [];
    await loadExercisesCacheFirst(
      storage,
      userId,
      () => Promise.resolve([...exercises, archivedCustom]),
      (list) => shown.push(list),
    );
    expect(shown).toEqual([{ exercises, notice: null, problem: null }]);
    expect(readCachedExercises(storage, userId)).toEqual([...exercises, archivedCustom]);
  });

  it('reports the load problem when the fetch fails and nothing is cached', async () => {
    const shown: ExerciseList[] = [];
    await loadExercisesCacheFirst(
      new MemoryStorage(),
      userId,
      () => Promise.reject(new Error('Failed to fetch')),
      (list) => shown.push(list),
    );
    expect(shown).toEqual([{ exercises: [], notice: null, problem: 'Failed to fetch' }]);
  });
});
