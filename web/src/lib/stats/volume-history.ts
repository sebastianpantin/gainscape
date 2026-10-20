import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import { loadStatCacheFirst } from '../../offline/stats-cache.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';
import {
  queryWeeklyExerciseSets,
  type WeeklyExerciseSetRow,
  weeklyExerciseSetRowsSchema,
} from './volume-history-rules.ts';

export function loadWeeklyExerciseSetsCacheFirst(
  userId: string,
  signal: AbortSignal,
): Promise<CacheFirstLoad<WeeklyExerciseSetRow[]>> {
  return loadStatCacheFirst(deviceStorage(), userId, 'weekly-exercise-sets', weeklyExerciseSetRowsSchema, () =>
    queryWeeklyExerciseSets(supabase, signal),
  );
}
