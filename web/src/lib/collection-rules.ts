import { collectionCompletion, type CollectionExercise } from '@domain/collection.ts';
import { type CardioRecordKind, measuresRepsCapacity, REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import { type Exercise, isLiftExercise, type LiftExercise, type LoadType } from './catalog-rules.ts';
import { rateLimitedMessage } from './rate-limit.ts';
import type { CollectionData, ExerciseStrengthView, RepMaxSlotView } from './collection-data.ts';
import type { UnitPref } from './profile-rules.ts';
import { formatWeight } from './units.ts';

export const COLLECTION_COLUMNS = {
  repMaxes: 'exercise_id, reps, load_kg, exact_set_id',
  bodyweightRecords: 'exercise_id, max_reps',
  strengths: 'exercise_id, e1rm_kg, reps_capacity',
  pins: 'exercise_id, position',
  cardioRecords: 'exercise_id, kind, value',
} as const;

export interface StrengthRow {
  exercise_id: string;
  e1rm_kg: number | string | null;
  reps_capacity: number | null;
}

export interface CollectionRows {
  repMaxes: { exercise_id: string; reps: number; load_kg: number | string; exact_set_id: string | null }[];
  bodyweightRecords: { exercise_id: string; max_reps: number }[];
  strengths: StrengthRow[];
  pins: { exercise_id: string; position: number }[];
  cardioRecords: { exercise_id: string; kind: CardioRecordKind; value: number | string }[];
}

export function strengthByExerciseFrom(rows: readonly StrengthRow[]): Map<string, ExerciseStrengthView> {
  return new Map(
    rows.map((row) => [
      row.exercise_id,
      { e1rmKg: row.e1rm_kg === null ? null : Number(row.e1rm_kg), repsCapacity: row.reps_capacity },
    ]),
  );
}

export function collectionDataFrom(rows: CollectionRows): CollectionData {
  const repMaxesByExercise = new Map<string, (RepMaxSlotView | null)[]>();
  for (const row of rows.repMaxes) {
    const slots = repMaxesByExercise.get(row.exercise_id) ?? Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
    slots[row.reps - 1] = { loadKg: Number(row.load_kg), exact: row.exact_set_id !== null };
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

export interface CountedCollection {
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
  return rateLimitedMessage(error) ?? error.message;
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
