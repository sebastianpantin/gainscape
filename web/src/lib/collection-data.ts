import { type StrengthState } from '@domain/types.ts';
import type { CardioRecordRow } from './cardio-rules.ts';
import { fetchExercises } from './catalog.ts';
import {
  COLLECTION_COLUMNS,
  collectionDataFrom,
  collectionPercent,
  countCollection,
  pinProblemText,
  strengthByExerciseFrom,
} from './collection-rules.ts';
import { withFriendlyRateLimit } from './rate-limit.ts';
import { nullableNumber } from './rows.ts';
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
  const [repMaxes, bodyweightRecords, strengths, pins, cardioRecords] = await Promise.all([
    supabase.from('rep_maxes').select(COLLECTION_COLUMNS.repMaxes).eq('user_id', userId),
    supabase.from('bodyweight_rep_records').select(COLLECTION_COLUMNS.bodyweightRecords).eq('user_id', userId),
    supabase.from('exercise_maxes').select(COLLECTION_COLUMNS.strengths).eq('user_id', userId),
    supabase
      .from('pinned_exercises')
      .select(COLLECTION_COLUMNS.pins)
      .eq('user_id', userId)
      .order('position')
      .order('created_at'),
    supabase.from('cardio_records').select(COLLECTION_COLUMNS.cardioRecords).eq('user_id', userId),
  ]);
  for (const result of [repMaxes, bodyweightRecords, strengths, pins, cardioRecords])
    if (result.error) throw result.error;
  return collectionDataFrom({
    repMaxes: repMaxes.data!,
    bodyweightRecords: bodyweightRecords.data!,
    strengths: strengths.data!,
    pins: pins.data!,
    cardioRecords: cardioRecords.data!,
  });
}

export async function fetchExerciseStrength(userId: string): Promise<Map<string, ExerciseStrengthView>> {
  const { data, error } = await supabase
    .from('exercise_maxes')
    .select(COLLECTION_COLUMNS.strengths)
    .eq('user_id', userId);
  if (error) throw error;
  return strengthByExerciseFrom(data);
}

interface StrengthStateRow {
  exercise_id: string;
  window_max: number | string | null;
  fallback_max: number | string | null;
}

export async function fetchStrengthState(asOf: string, windowDays: number): Promise<StrengthState> {
  const { data, error } = await supabase.rpc('exercise_strength_state', { as_of: asOf, window_days: windowDays });
  if (error) throw error;
  return Object.fromEntries(
    (data as StrengthStateRow[]).map((row) => [
      row.exercise_id,
      {
        windowMax: nullableNumber(row.window_max),
        fallbackMax: nullableNumber(row.fallback_max),
        hasPriorSession: true,
      },
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
