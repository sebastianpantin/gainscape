import { REP_MAX_SLOT_COUNT, type StrengthState } from '@domain/types.ts';
import type { CardioRecordRow } from './cardio-rules.ts';
import { fetchExercises } from './catalog.ts';
import { collectionPercent, countCollection, pinProblemText } from './collection-rules.ts';
import { withFriendlyRateLimit } from './rate-limit.ts';
import { supabase } from './supabase.ts';

export interface RepMaxSlotView {
  loadKg: number;
  exact: boolean;
}

export type ExerciseStrengthView = { e1rmKg: number | null; repsCapacity: number | null };

export interface CollectionData {
  repMaxesByExercise: Map<string, (RepMaxSlotView | null)[]>;
  maxRepsByExercise: Map<string, number>;
  strengthByExercise: Map<string, ExerciseStrengthView>;
  pinnedExerciseIds: string[];
  nextPinPosition: number;
  cardioRecords: CardioRecordRow[];
}

export async function fetchCollectionData(userId: string): Promise<CollectionData> {
  const [repMaxes, bodyweightRecords, strengthByExercise, pins, cardioRecords] = await Promise.all([
    supabase.from('rep_maxes').select('exercise_id, reps, load_kg, exact_set_id').eq('user_id', userId),
    supabase.from('bodyweight_rep_records').select('exercise_id, max_reps').eq('user_id', userId),
    fetchExerciseStrength(userId),
    supabase
      .from('pinned_exercises')
      .select('exercise_id, position')
      .eq('user_id', userId)
      .order('position')
      .order('created_at'),
    supabase.from('cardio_records').select('exercise_id, kind, value').eq('user_id', userId),
  ]);
  for (const result of [repMaxes, bodyweightRecords, pins, cardioRecords]) if (result.error) throw result.error;

  const repMaxesByExercise = new Map<string, (RepMaxSlotView | null)[]>();
  for (const row of repMaxes.data!) {
    const slots = repMaxesByExercise.get(row.exercise_id) ?? Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
    slots[row.reps - 1] = { loadKg: Number(row.load_kg), exact: row.exact_set_id !== null };
    repMaxesByExercise.set(row.exercise_id, slots);
  }

  return {
    repMaxesByExercise,
    maxRepsByExercise: new Map(bodyweightRecords.data!.map((row) => [row.exercise_id, row.max_reps])),
    strengthByExercise,
    pinnedExerciseIds: pins.data!.map((row) => row.exercise_id),
    nextPinPosition: Math.max(-1, ...pins.data!.map((row) => row.position)) + 1,
    cardioRecords: cardioRecords.data!.map((row) => ({
      exerciseId: row.exercise_id,
      kind: row.kind,
      value: Number(row.value),
    })),
  };
}

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

interface StrengthStateRow {
  exercise_id: string;
  window_max: number | string | null;
  fallback_max: number | string | null;
}

function strengthValue(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

export async function fetchStrengthState(asOf: string, windowDays: number): Promise<StrengthState> {
  const { data, error } = await supabase.rpc('exercise_strength_state', { as_of: asOf, window_days: windowDays });
  if (error) throw error;
  return Object.fromEntries(
    (data as StrengthStateRow[]).map((row) => [
      row.exercise_id,
      { windowMax: strengthValue(row.window_max), fallbackMax: strengthValue(row.fallback_max), hasPriorSession: true },
    ]),
  );
}

export async function pinExercise(exerciseId: string, position: number): Promise<void> {
  const { error } = await supabase.from('pinned_exercises').insert({ exercise_id: exerciseId, position });
  if (error) throw new Error(pinProblemText(error));
}

export async function unpinExercise(exerciseId: string): Promise<void> {
  const { error } = await supabase.from('pinned_exercises').delete().eq('exercise_id', exerciseId);
  if (error) throw withFriendlyRateLimit(error);
}

export async function reorderPins(exerciseIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('reorder_pins', { exercise_ids: exerciseIds });
  if (error) throw withFriendlyRateLimit(error);
}

export async function fetchCollectionPercent(userId: string): Promise<number> {
  const [exercises, data] = await Promise.all([fetchExercises({ includeArchived: true }), fetchCollectionData(userId)]);
  const { filledSlots, totalSlots } = countCollection(exercises, data).completion;
  return collectionPercent(filledSlots, totalSlots);
}
