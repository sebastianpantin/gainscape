import { EXERCISE_COLUMNS, type ExerciseRow, type LiftExercise, toExercise } from './catalog-rules.ts';
import {
  maxRepsRecord,
  type MaxRepsRecord,
  type MaxRepsRow,
  PROGRESS_COLUMNS,
  type ProgressSetRow,
  repMaxTable,
  type RepMaxEntry,
  type RepMaxRow,
  sessionProgress,
  type SessionProgress,
} from './exercise-progress-rules.ts';
import { isUuid } from './history-rules.ts';
import { supabase } from './supabase.ts';

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
  const [exercise, sets, repMaxes, maxReps] = await Promise.all([
    supabase.from('exercises').select(EXERCISE_COLUMNS).eq('id', exerciseId).abortSignal(signal).maybeSingle(),
    supabase
      .from('sets')
      .select(PROGRESS_COLUMNS.sets)
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .order('created_at', { ascending: false })
      .abortSignal(signal),
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
  for (const result of [exercise, sets, repMaxes, maxReps]) if (result.error) throw result.error;
  if (!exercise.data) return null;
  const loaded = toExercise(exercise.data as unknown as ExerciseRow);
  if (loaded.modality !== 'lift') return null;
  return {
    exercise: loaded,
    sessions: sessionProgress(sets.data as unknown as ProgressSetRow[], loaded.loadType),
    repMaxes: repMaxTable(repMaxes.data as unknown as RepMaxRow[]),
    maxReps: maxRepsRecord(maxReps.data as unknown as MaxRepsRow[]),
  };
}
