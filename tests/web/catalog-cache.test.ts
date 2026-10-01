import { describe, expect, it, vi } from 'vitest';
import type { Exercise } from '../../web/src/lib/catalog.ts';
import {
  exerciseCacheKey,
  type ExerciseList,
  forgetCachedExercises,
  loadExercisesCacheFirst,
  OFFLINE_EXERCISES_NOTICE,
  readCachedExercises,
  saveCachedExercises,
} from '../../web/src/lib/catalog-cache.ts';
import { MemoryStorage } from './memory-storage.ts';

vi.mock('../../web/src/lib/supabase.ts', () => ({ supabase: {} }));

const userId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '22222222-2222-4222-8222-222222222222';

const exercises: Exercise[] = [
  {
    id: 'bench',
    name: 'Barbell Bench Press',
    equipment: 'barbell',
    loadType: 'external',
    custom: false,
    archived: false,
  },
  { id: 'mine', name: 'My Row', equipment: 'cable', loadType: 'external', custom: true, archived: false },
];

describe('exercise list cache', () => {
  it('round-trips the exercise list', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, exercises);
    expect(readCachedExercises(storage, userId)).toEqual(exercises);
  });

  it('uses the per-user key', () => {
    expect(exerciseCacheKey(userId)).toBe(`gainscape.exercises.v1.${userId}`);
  });

  it('stores only the exercise fields', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, userId, [{ ...exercises[0], secret: 'x' } as Exercise]);
    const raw = JSON.parse(storage.getItem(exerciseCacheKey(userId))!);
    expect(Object.keys(raw.exercises[0]).sort()).toEqual(
      ['archived', 'custom', 'equipment', 'id', 'loadType', 'name'].sort(),
    );
  });

  it('returns null for another user, a wrong version and malformed JSON', () => {
    const storage = new MemoryStorage();
    saveCachedExercises(storage, otherUserId, exercises);
    storage.setItem(exerciseCacheKey(userId), storage.getItem(exerciseCacheKey(otherUserId))!);
    expect(readCachedExercises(storage, userId)).toBeNull();
    storage.setItem(
      exerciseCacheKey(userId),
      JSON.stringify({ v: 2, savedAt: new Date().toISOString(), userId, exercises }),
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
