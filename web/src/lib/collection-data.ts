import { REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import { fetchExercises } from './catalog.ts';
import { countCollection } from './collection-rules.ts';
import { supabase } from './supabase.ts';

export { countCollection, type CountedCollection } from './collection-rules.ts';

export interface RepMaxSlotView {
  loadKg: number;
  exact: boolean;
}

export interface CollectionData {
  repMaxesByExercise: Map<string, (RepMaxSlotView | null)[]>;
  maxRepsByExercise: Map<string, number>;
  strengthByExercise: Map<string, { e1rmKg: number | null; repsCapacity: number | null }>;
  pinnedExerciseIds: string[];
  nextPinPosition: number;
}

export async function fetchCollectionData(userId: string): Promise<CollectionData> {
  const [repMaxes, bodyweightRecords, strength, pins] = await Promise.all([
    supabase.from('rep_maxes').select('exercise_id, reps, load_kg, exact_set_id').eq('user_id', userId),
    supabase.from('bodyweight_rep_records').select('exercise_id, max_reps').eq('user_id', userId),
    supabase.from('exercise_maxes').select('exercise_id, e1rm_kg, reps_capacity').eq('user_id', userId),
    supabase
      .from('pinned_exercises')
      .select('exercise_id, position')
      .eq('user_id', userId)
      .order('position')
      .order('created_at'),
  ]);
  for (const result of [repMaxes, bodyweightRecords, strength, pins]) if (result.error) throw result.error;

  const repMaxesByExercise = new Map<string, (RepMaxSlotView | null)[]>();
  for (const row of repMaxes.data!) {
    const slots = repMaxesByExercise.get(row.exercise_id) ?? Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
    slots[row.reps - 1] = { loadKg: Number(row.load_kg), exact: row.exact_set_id !== null };
    repMaxesByExercise.set(row.exercise_id, slots);
  }

  return {
    repMaxesByExercise,
    maxRepsByExercise: new Map(bodyweightRecords.data!.map((row) => [row.exercise_id, row.max_reps])),
    strengthByExercise: new Map(
      strength.data!.map((row) => [
        row.exercise_id,
        { e1rmKg: row.e1rm_kg === null ? null : Number(row.e1rm_kg), repsCapacity: row.reps_capacity },
      ]),
    ),
    pinnedExerciseIds: pins.data!.map((row) => row.exercise_id),
    nextPinPosition: Math.max(-1, ...pins.data!.map((row) => row.position)) + 1,
  };
}

export type ExerciseStrengthView = { e1rmKg: number | null; repsCapacity: number | null };

export async function fetchExerciseStrength(userId: string): Promise<Map<string, ExerciseStrengthView>> {
  const { data, error } = await supabase
    .from('exercise_maxes')
    .select('exercise_id, e1rm_kg, reps_capacity')
    .eq('user_id', userId);
  if (error) throw error;
  return new Map(
    data.map((row) => [
      row.exercise_id,
      { e1rmKg: row.e1rm_kg === null ? null : Number(row.e1rm_kg), repsCapacity: row.reps_capacity },
    ]),
  );
}

export async function pinExercise(exerciseId: string, position: number): Promise<void> {
  const { error } = await supabase.from('pinned_exercises').insert({ exercise_id: exerciseId, position });
  if (error) throw error;
}

export async function unpinExercise(exerciseId: string): Promise<void> {
  const { error } = await supabase.from('pinned_exercises').delete().eq('exercise_id', exerciseId);
  if (error) throw error;
}

export async function reorderPins(exerciseIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_pins', { exercise_ids: exerciseIds });
  if (error) throw error;
}

export async function fetchCollectionPercent(userId: string): Promise<number> {
  const [exercises, data] = await Promise.all([fetchExercises({ includeArchived: true }), fetchCollectionData(userId)]);
  return Math.round(countCollection(exercises, data).completion.fraction * 100);
}
