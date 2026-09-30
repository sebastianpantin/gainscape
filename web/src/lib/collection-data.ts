import { collectionCompletion, type CollectionExercise } from '@domain/collection.ts';
import { REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import { type Exercise, fetchExercises } from './catalog.ts';
import { supabase } from './supabase.ts';

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

function isDone(exercise: Exercise, data: CollectionData): boolean {
  return data.repMaxesByExercise.has(exercise.id) || data.maxRepsByExercise.has(exercise.id);
}

function asCollectionExercise(exercise: Exercise, data: CollectionData): CollectionExercise {
  return {
    loadType: exercise.loadType,
    exactRepMaxSlotsFilled: (data.repMaxesByExercise.get(exercise.id) ?? []).filter((slot) => slot?.exact).length,
    hasBodyweightRecord: data.maxRepsByExercise.has(exercise.id),
  };
}

export interface CountedCollection {
  pinned: Exercise[];
  counted: Exercise[];
  completion: ReturnType<typeof collectionCompletion>;
}

export function countCollection(exercises: Exercise[], data: CollectionData): CountedCollection {
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const pinned = data.pinnedExerciseIds
    .map((id) => byId.get(id))
    .filter((exercise): exercise is Exercise => exercise !== undefined);
  const doneButNotPinned = exercises.filter(
    (exercise) => isDone(exercise, data) && !data.pinnedExerciseIds.includes(exercise.id),
  );
  const counted = [...pinned, ...doneButNotPinned];
  return {
    pinned,
    counted,
    completion: collectionCompletion(counted.map((exercise) => asCollectionExercise(exercise, data))),
  };
}

export async function fetchCollectionPercent(userId: string): Promise<number> {
  const [exercises, data] = await Promise.all([fetchExercises({ includeArchived: true }), fetchCollectionData(userId)]);
  return Math.round(countCollection(exercises, data).completion.fraction * 100);
}
