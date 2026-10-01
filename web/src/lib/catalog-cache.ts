import { z } from 'zod';
import { type Exercise, LOAD_TYPES } from './catalog.ts';

const CACHE_VERSION = 1;
const CACHE_KEY_PREFIX = 'gainscape.exercises.v1.';

export const OFFLINE_EXERCISES_NOTICE = 'Offline: using your saved exercise list.';
export const SAVED_EXERCISES_NOTICE = 'Using your saved exercise list.';

const NETWORK_ERROR_NAMES = new Set(['AbortError', 'TimeoutError']);
const NETWORK_ERROR_MESSAGE = /Failed to fetch|NetworkError|Load failed|AbortError|TimeoutError|aborted/i;

function isNetworkError(error: unknown): boolean {
  const { name, message } = (error ?? {}) as { name?: unknown; message?: unknown };
  return (
    (typeof name === 'string' && NETWORK_ERROR_NAMES.has(name)) ||
    (typeof message === 'string' && NETWORK_ERROR_MESSAGE.test(message))
  );
}

const cachedExercisesSchema = z.object({
  v: z.literal(CACHE_VERSION),
  savedAt: z.string(),
  userId: z.string(),
  exercises: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      equipment: z.string(),
      loadType: z.enum(LOAD_TYPES),
      custom: z.boolean(),
      archived: z.boolean(),
    }),
  ),
});

export function exerciseCacheKey(userId: string): string {
  return `${CACHE_KEY_PREFIX}${userId}`;
}

export function readCachedExercises(storage: Storage, userId: string): Exercise[] | null {
  try {
    const raw = storage.getItem(exerciseCacheKey(userId));
    if (!raw) return null;
    const parsed = cachedExercisesSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.userId !== userId) return null;
    return parsed.data.exercises.map((exercise) => ({ ...exercise, modality: 'lift' }));
  } catch {
    return null;
  }
}

export function saveCachedExercises(storage: Storage, userId: string, exercises: Exercise[], now = new Date()): void {
  const record = {
    v: CACHE_VERSION,
    savedAt: now.toISOString(),
    userId,
    exercises: exercises.map(({ id, name, equipment, loadType, custom, archived }) => ({
      id,
      name,
      equipment,
      loadType,
      custom,
      archived,
    })),
  };
  try {
    storage.setItem(exerciseCacheKey(userId), JSON.stringify(record));
  } catch {
    return;
  }
}

export function forgetCachedExercises(storage: Storage, userId: string): void {
  try {
    storage.removeItem(exerciseCacheKey(userId));
  } catch {
    return;
  }
}

export interface ExerciseList {
  exercises: Exercise[];
  notice: string | null;
  problem: string | null;
}

export async function loadExercisesCacheFirst(
  storage: Storage,
  userId: string,
  fetchLive: () => Promise<Exercise[]>,
  show: (list: ExerciseList) => void,
  isOffline: () => boolean = () => false,
): Promise<void> {
  const cached = readCachedExercises(storage, userId);
  if (cached) show({ exercises: cached, notice: null, problem: null });
  try {
    const live = await fetchLive();
    saveCachedExercises(storage, userId, live);
    show({ exercises: live, notice: null, problem: null });
  } catch (error) {
    show(
      cached
        ? {
            exercises: cached,
            notice: isOffline() || isNetworkError(error) ? OFFLINE_EXERCISES_NOTICE : SAVED_EXERCISES_NOTICE,
            problem: null,
          }
        : { exercises: [], notice: null, problem: (error as Error).message },
    );
  }
}
