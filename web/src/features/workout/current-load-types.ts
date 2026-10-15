import { type Exercise, isLiftExercise, type LoadType } from '../../lib/exercises/catalog-rules.ts';
import { type CacheFirstLoad, isDeviceOffline } from '../../offline/cache-first.ts';
import { type WorkoutDraft } from '../../offline/draft-format.ts';

const LOAD_TYPE_CHECK_TIMEOUT_MS = 5000;

function withinCheckTimeout<Loaded>(loading: Promise<Loaded>): Promise<Loaded> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('The load type check timed out.')), LOAD_TYPE_CHECK_TIMEOUT_MS);
  });
  return Promise.race([loading, timedOut]).finally(() => clearTimeout(timer));
}

export async function currentLoadTypes(
  draft: WorkoutDraft,
  exercises: Exercise[],
  fetchLatestExercises: () => Promise<CacheFirstLoad<Exercise[]>>,
): Promise<Map<string, LoadType>> {
  const builtInIds = new Set(exercises.filter((exercise) => !exercise.custom).map((exercise) => exercise.id));
  const hasCustom = draft.exercises.some((exercise) => !builtInIds.has(exercise.exerciseId));
  if (!hasCustom || isDeviceOffline()) return new Map();
  try {
    const latest = await withinCheckTimeout(fetchLatestExercises());
    if (latest.fromCache) return new Map();
    const customIds = new Set(
      draft.exercises.map((exercise) => exercise.exerciseId).filter((id) => !builtInIds.has(id)),
    );
    return new Map(
      latest.loaded
        .filter(isLiftExercise)
        .filter((exercise) => customIds.has(exercise.id))
        .map((exercise) => [exercise.id, exercise.loadType]),
    );
  } catch {
    return new Map();
  }
}
