import { type StrengthState } from '@domain/types.ts';
import type { CardioRecordRow } from './cardio-rules.ts';
import { fetchExercises } from './catalog.ts';
import { type CacheFirstLoad, isDeviceOffline, loadCacheFirstWhenOffline } from '../offline/cache-first.ts';
import { collectionCache } from '../offline/collection-cache.ts';
import { readCachedExercises } from './catalog-cache.ts';
import { type Exercise } from './catalog-rules.ts';
import {
  COLLECTION_COLUMNS,
  collectionDataFrom,
  type CollectionRows,
  collectionPercent,
  countCollection,
  pinProblemText,
  strengthByExerciseFrom,
} from './collection-rules.ts';
import { withFriendlyRateLimit } from './rate-limit.ts';
import { RECORD_BASELINE_COLUMNS, type RecordBaseline, recordBaselineFrom } from './session-baseline-rules.ts';
import { nullableNumber } from './rows.ts';
import { deviceStorage } from './rest-timer-store.ts';
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

async function fetchCollectionRows(userId: string): Promise<CollectionRows> {
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
  return {
    repMaxes: repMaxes.data!,
    bodyweightRecords: bodyweightRecords.data!,
    strengths: strengths.data!,
    pins: pins.data!,
    cardioRecords: cardioRecords.data!,
  };
}

export interface Collection {
  exercises: Exercise[];
  data: CollectionData;
}

function savedCollection(userId: string): { exercises: Exercise[]; rows: CollectionRows } | null {
  const storage = deviceStorage();
  const rows = collectionCache.read(storage, userId);
  const exercises = storage && readCachedExercises(storage, userId);
  return rows && exercises ? { exercises, rows } : null;
}

async function fetchSavedCollection(userId: string): Promise<{ exercises: Exercise[]; rows: CollectionRows }> {
  const [exercises, rows] = await Promise.all([fetchExercises({ includeArchived: true }), fetchCollectionRows(userId)]);
  collectionCache.save(deviceStorage(), userId, rows);
  return { exercises, rows };
}

export async function loadCollectionCacheFirst(userId: string): Promise<CacheFirstLoad<Collection>> {
  const { loaded, fromCache } = await loadCacheFirstWhenOffline(
    isDeviceOffline,
    () => savedCollection(userId),
    () => fetchSavedCollection(userId),
  );
  return { loaded: { exercises: loaded.exercises, data: collectionDataFrom(loaded.rows) }, fromCache };
}

export async function fetchExerciseStrength(userId: string): Promise<Map<string, ExerciseStrengthView>> {
  const { data, error } = await supabase
    .from('exercise_maxes')
    .select(COLLECTION_COLUMNS.strengths)
    .eq('user_id', userId);
  if (error) throw error;
  return strengthByExerciseFrom(data);
}

export async function fetchRecordBaseline(userId: string): Promise<RecordBaseline> {
  const [repMaxes, bodyweightRecords] = await Promise.all([
    supabase.from('rep_maxes').select(RECORD_BASELINE_COLUMNS.repMaxes).eq('user_id', userId),
    supabase.from('bodyweight_rep_records').select(RECORD_BASELINE_COLUMNS.bodyweightRecords).eq('user_id', userId),
  ]);
  if (repMaxes.error) throw repMaxes.error;
  if (bodyweightRecords.error) throw bodyweightRecords.error;
  return recordBaselineFrom({ repMaxes: repMaxes.data, bodyweightRecords: bodyweightRecords.data });
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
  const { exercises, data } = (await loadCollectionCacheFirst(userId)).loaded;
  const { filledSlots, totalSlots } = countCollection(exercises, data).completion;
  return collectionPercent(filledSlots, totalSlots);
}
