import { EXERCISE_COLUMNS, exerciseRowSchema, type LiftExercise, toExercise } from '../exercises/catalog-rules.ts';
import {
  maxRepsRecord,
  type MaxRepsRecord,
  maxRepsRowSchema,
  PROGRESS_COLUMNS,
  queryProgressSets,
  repMaxTable,
  type RepMaxEntry,
  repMaxRowSchema,
  sessionProgress,
  type SessionProgress,
} from './exercise-progress-rules.ts';
import { isUuid } from '../history/history-rules.ts';
import { supabase } from '../platform/supabase.ts';
import { parsedRow, parsedRows } from '../rows.ts';
import { failFastWhenOffline } from '../../offline/cache-first.ts';

export interface ExerciseProgress {
  exercise: LiftExercise;
  sessions: SessionProgress[];
  repMaxes: RepMaxEntry[];
  maxReps: MaxRepsRecord | null;
}

export async function fetchExerciseProgress(
  userId: string,
  exerciseId: string,
  signal: AbortSignal,
): Promise<ExerciseProgress | null> {
  if (!isUuid(exerciseId)) return null;
  failFastWhenOffline();
  const [exercise, sets, repMaxes, maxReps] = await Promise.all([
    supabase.from('exercises').select(EXERCISE_COLUMNS).eq('id', exerciseId).abortSignal(signal).maybeSingle(),
    queryProgressSets(supabase, userId, exerciseId, signal),
    supabase
      .from('rep_maxes')
      .select(PROGRESS_COLUMNS.repMaxes)
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .abortSignal(signal),
    supabase
      .from('bodyweight_rep_records')
      .select(PROGRESS_COLUMNS.maxReps)
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .abortSignal(signal),
  ]);
  for (const result of [exercise, repMaxes, maxReps]) if (result.error) throw result.error;
  if (!exercise.data) return null;
  const loaded = toExercise(parsedRow(exerciseRowSchema, exercise.data));
  if (loaded.modality !== 'lift') return null;
  return {
    exercise: loaded,
    sessions: sessionProgress(sets, loaded.loadType),
    repMaxes: repMaxTable(parsedRows(repMaxRowSchema, repMaxes.data)),
    maxReps: maxRepsRecord(parsedRows(maxRepsRowSchema, maxReps.data)),
  };
}
