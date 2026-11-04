import { collectionCompletion, type CollectionExercise } from '@domain/collection.ts';
import { CARDIO_RECORD_KINDS, measuresRepsCapacity, REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import { z } from 'zod';
import { type Exercise, isLiftExercise, type LiftExercise, type LoadType } from '../exercises/catalog-rules.ts';
import { rateLimitedMessage } from '../platform/rate-limit.ts';
import type { CollectionData, ExerciseStrengthView, RepMaxSlotView } from './collection-data.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { columnsOfEach, nullableNumber, numericColumn, rowListsSchema } from '../rows.ts';
import { formatWeight } from '../units.ts';

export const collectionRowSchemas = {
  repMaxes: z.object({
    exercise_id: z.string(),
    reps: z.number(),
    load_kg: numericColumn,
    exact_set_id: z.string().nullable(),
    achieved_at: z.string().nullable().catch(null),
  }),
  bodyweightRecords: z.object({ exercise_id: z.string(), max_reps: z.number() }),
  strengths: z.object({
    exercise_id: z.string(),
    e1rm_kg: numericColumn.nullable(),
    reps_capacity: z.number().nullable(),
  }),
  pins: z.object({ exercise_id: z.string(), position: z.number() }),
  cardioRecords: z.object({ exercise_id: z.string(), kind: z.enum(CARDIO_RECORD_KINDS), value: numericColumn }),
};

export const repMaxLoadRowSchema = collectionRowSchemas.repMaxes.pick({ exercise_id: true, reps: true, load_kg: true });

export const collectionRowsSchema = rowListsSchema(collectionRowSchemas);

export type CollectionRows = z.infer<typeof collectionRowsSchema>;

type StrengthRow = CollectionRows['strengths'][number];

export const COLLECTION_COLUMNS = columnsOfEach(collectionRowSchemas);

export function emptySlots<Slot>(): (Slot | null)[] {
  return Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
}

export function strengthByExerciseFrom(rows: readonly StrengthRow[]): Map<string, ExerciseStrengthView> {
  return new Map(
    rows.map((row) => [row.exercise_id, { e1rmKg: nullableNumber(row.e1rm_kg), repsCapacity: row.reps_capacity }]),
  );
}

export function collectionDataFrom(rows: CollectionRows): CollectionData {
  const repMaxesByExercise = new Map<string, (RepMaxSlotView | null)[]>();
  for (const row of rows.repMaxes) {
    const slots = repMaxesByExercise.get(row.exercise_id) ?? emptySlots<RepMaxSlotView>();
    slots[row.reps - 1] = {
      loadKg: Number(row.load_kg),
      exact: row.exact_set_id !== null,
      achievedAt: row.achieved_at,
    };
    repMaxesByExercise.set(row.exercise_id, slots);
  }
  return {
    repMaxesByExercise,
    maxRepsByExercise: new Map(rows.bodyweightRecords.map((row) => [row.exercise_id, row.max_reps])),
    strengthByExercise: strengthByExerciseFrom(rows.strengths),
    pinnedExerciseIds: rows.pins.map((row) => row.exercise_id),
    nextPinPosition: Math.max(-1, ...rows.pins.map((row) => row.position)) + 1,
    cardioRecords: rows.cardioRecords.map((row) => ({
      exerciseId: row.exercise_id,
      kind: row.kind,
      value: Number(row.value),
    })),
  };
}

function isDone(exercise: LiftExercise, data: CollectionData): boolean {
  return data.repMaxesByExercise.has(exercise.id) || data.maxRepsByExercise.has(exercise.id);
}

function asCollectionExercise(exercise: LiftExercise, data: CollectionData): CollectionExercise {
  return {
    loadType: exercise.loadType,
    exactRepMaxSlotsFilled: (data.repMaxesByExercise.get(exercise.id) ?? []).filter((slot) => slot?.exact).length,
    hasBodyweightRecord: data.maxRepsByExercise.has(exercise.id),
  };
}

export function collectionPercent(filled: number, total: number): number {
  return total === 0 ? 0 : Math.round((filled / total) * 100);
}

interface CountedCollection {
  pinned: LiftExercise[];
  counted: LiftExercise[];
  completion: ReturnType<typeof collectionCompletion>;
}

export function countCollection(allExercises: Exercise[], data: CollectionData): CountedCollection {
  const exercises = allExercises.filter(isLiftExercise);
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const pinned = data.pinnedExerciseIds
    .map((id) => byId.get(id))
    .filter((exercise): exercise is LiftExercise => exercise !== undefined);
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

const PIN_CAP = 50;

export function pinProblemText(error: { message: string; code?: string; details?: string | null }): string {
  if (error.message === 'too_many_pins') return `You can pin up to ${PIN_CAP} exercises. Unpin one first.`;
  return rateLimitedMessage(error) ?? 'Could not update pins.';
}

export function strengthText(
  view: ExerciseStrengthView | undefined,
  loadType: LoadType,
  unit: UnitPref,
): string | null {
  if (!view) return null;
  if (measuresRepsCapacity(loadType)) return view.repsCapacity === null ? null : `Capacity ~${view.repsCapacity} reps`;
  return view.e1rmKg === null ? null : `e1RM ${formatWeight(view.e1rmKg, unit)}`;
}
