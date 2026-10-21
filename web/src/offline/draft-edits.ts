import { isRetestRef } from '@domain/index.ts';
import type { CardioActivity, CardioExercise, HoldMeasure, LoadType } from '../lib/exercises/catalog-rules.ts';
import { boutSecondsLeft } from '../lib/workout/cardio-rules.ts';
import {
  addExerciseTo,
  addSetTo,
  nextSetValues,
  roomForSets,
  swapLoadedExercise,
  updateExerciseAt,
  updateSet,
  withLoadType,
  withSets,
} from '../lib/workout/exercise-edit-rules.ts';
import { ROUTINE_DRILL_DURATION_S } from '../lib/workout/warmup-routine-rules.ts';
import {
  type CardioDraftExercise,
  type CardioDraftSet,
  type DraftExercise,
  type DraftSet,
  type HoldDraftExercise,
  type HoldDraftSet,
  type LiftDraftExercise,
  withValidSupersets,
  type WorkoutDraft,
} from './draft-format.ts';

export interface LastLoggedSet {
  weightKg: number;
  reps: number;
}

export function withSessionRpe(draft: WorkoutDraft, sessionRpe: number | null): WorkoutDraft {
  return { ...draft, sessionRpe };
}

export function addExercise(draft: WorkoutDraft, exerciseId: string, name: string, loadType: LoadType): WorkoutDraft {
  const added: LiftDraftExercise = {
    clientId: crypto.randomUUID(),
    exerciseId,
    name,
    modality: 'lift',
    loadType,
    target: null,
    sets: [],
  };
  return addExerciseTo(draft, added);
}

export function addCardioExercise(
  draft: WorkoutDraft,
  exerciseId: string,
  name: string,
  activity: CardioActivity,
): WorkoutDraft {
  const added: CardioDraftExercise = {
    clientId: crypto.randomUUID(),
    exerciseId,
    name,
    modality: 'cardio',
    activity,
    sets: [],
  };
  return addExerciseTo(draft, added);
}

export function addHoldExercise(
  draft: WorkoutDraft,
  exerciseId: string,
  name: string,
  loadType: LoadType,
  measure: HoldMeasure,
): WorkoutDraft {
  const added: HoldDraftExercise = {
    clientId: crypto.randomUUID(),
    exerciseId,
    name,
    modality: 'hold',
    measure,
    loadType,
    sets: [],
  };
  return addExerciseTo(draft, added);
}

export function removeExercise(draft: WorkoutDraft, exerciseIndex: number): WorkoutDraft {
  return { ...draft, exercises: withValidSupersets(draft.exercises.filter((_, index) => index !== exerciseIndex)) };
}

export function addSet(draft: WorkoutDraft, exerciseIndex: number, firstSet?: LastLoggedSet): WorkoutDraft {
  return addSetTo(draft, exerciseIndex, { done: false }, firstSet);
}

export function addWarmupSets(
  draft: WorkoutDraft,
  exerciseIndex: number,
  warmups: readonly LastLoggedSet[],
): WorkoutDraft {
  if (warmups.length > roomForSets(draft)) return draft;
  return updateExerciseAt(draft, exerciseIndex, (exercise) => {
    if (exercise.modality !== 'lift') return exercise;
    const warmupSets: DraftSet[] = warmups.map(({ weightKg, reps }) => ({
      id: crypto.randomUUID(),
      weightKg,
      reps,
      effort: null,
      done: false,
      isWarmup: true,
    }));
    return { ...exercise, sets: [...warmupSets, ...exercise.sets] };
  });
}

export function routineDrillsFit(draft: WorkoutDraft, drillCount: number): boolean {
  const bouts = draft.exercises.flatMap((exercise) => (exercise.modality === 'cardio' ? exercise.sets : []));
  return drillCount <= roomForSets(draft) && drillCount * ROUTINE_DRILL_DURATION_S <= boutSecondsLeft(bouts);
}

export function insertWarmupDrills(
  draft: WorkoutDraft,
  exerciseIndex: number,
  drills: readonly Pick<CardioExercise, 'id' | 'name' | 'activity'>[],
): WorkoutDraft {
  if (!routineDrillsFit(draft, drills.length)) return draft;
  const drillCards = drills.map(({ id, name, activity }): CardioDraftExercise => ({
    clientId: crypto.randomUUID(),
    exerciseId: id,
    name,
    modality: 'cardio',
    activity,
    sets: [
      {
        id: crypto.randomUUID(),
        kind: 'cardio',
        durationS: ROUTINE_DRILL_DURATION_S,
        distanceM: null,
        interval: null,
        effort: null,
        done: false,
      },
    ],
  }));
  return {
    ...draft,
    exercises: [...draft.exercises.slice(0, exerciseIndex), ...drillCards, ...draft.exercises.slice(exerciseIndex)],
  };
}

export function firstWorkingSet(exercise: LiftDraftExercise): DraftSet | undefined {
  return exercise.sets.find((set) => !set.isWarmup);
}

export function seedUntouchedSet(
  draft: WorkoutDraft,
  exerciseIndex: number,
  original: DraftSet,
  seed: LastLoggedSet,
): WorkoutDraft {
  const exercise = draft.exercises[exerciseIndex];
  const current = exercise?.modality === 'lift' ? exercise.sets.find((set) => set.id === original.id) : undefined;
  const untouched =
    current !== undefined &&
    current.weightKg === original.weightKg &&
    current.reps === original.reps &&
    current.effort === original.effort;
  return untouched ? updateSet(draft, exerciseIndex, original.id, seed) : draft;
}

export function doneSetCount(draft: WorkoutDraft): number {
  return draft.exercises.reduce((count, exercise) => count + exercise.sets.filter((set) => set.done).length, 0);
}

export function withCurrentLoadTypes(
  draft: WorkoutDraft,
  loadTypes: ReadonlyMap<string, LoadType>,
): { draft: WorkoutDraft; changedNames: string[] } {
  const changedNames: string[] = [];
  const exercises = draft.exercises.map((exercise): DraftExercise => {
    if (exercise.modality === 'cardio') return exercise;
    const current = loadTypes.get(exercise.exerciseId);
    if (current === undefined || current === exercise.loadType) return exercise;
    changedNames.push(exercise.name);
    return withLoadType(exercise, current);
  });
  return { draft: changedNames.length > 0 ? { ...draft, exercises } : draft, changedNames };
}

export function toggleSetDone(draft: WorkoutDraft, exerciseIndex: number, setId: string): WorkoutDraft {
  return updateExerciseAt(draft, exerciseIndex, (exercise) =>
    withSets(exercise, (sets) => sets.map((set) => (set.id === setId ? { ...set, done: !set.done } : set))),
  );
}

const MOST_WORKING_SETS_TO_QUICK_FILL = 1;

export function canQuickFill(exercise: LiftDraftExercise): boolean {
  if (exercise.supersetId != null) return false;
  if (exercise.sets.some((set) => set.prescription)) return false;
  return exercise.sets.filter((set) => !set.isWarmup).length <= MOST_WORKING_SETS_TO_QUICK_FILL;
}

const MOST_QUICK_FILL_SETS = 20;

export function mostQuickFillSets(draft: WorkoutDraft, exerciseIndex: number): number {
  const workingSetCount = draft.exercises[exerciseIndex]?.sets.filter(
    (set) => !('isWarmup' in set && set.isWarmup),
  ).length;
  return Math.min(MOST_QUICK_FILL_SETS, (workingSetCount ?? 0) + roomForSets(draft));
}

export function fillWorkingSets(draft: WorkoutDraft, exerciseIndex: number, count: number, reps: number): WorkoutDraft {
  return updateExerciseAt(draft, exerciseIndex, (exercise) => {
    if (exercise.modality !== 'lift' || !canQuickFill(exercise)) return exercise;
    const workingSets = exercise.sets.filter((set) => !set.isWarmup);
    const filled = exercise.sets.map((set) => (set.isWarmup ? set : { ...set, reps, done: true }));
    const { weightKg } = nextSetValues(workingSets.at(-1), exercise.loadType);
    const addedCount = Math.min(roomForSets(draft), Math.max(0, count - workingSets.length));
    const added = Array.from({ length: addedCount }, (): DraftSet => ({
      id: crypto.randomUUID(),
      weightKg,
      reps,
      effort: null,
      done: true,
      isWarmup: false,
      prescription: null,
    }));
    return { ...exercise, sets: [...filled, ...added] };
  });
}

function isLeftToLifter(set: DraftSet | CardioDraftSet | HoldDraftSet): boolean {
  if ('kind' in set || set.done || set.effort !== null) return false;
  return Boolean(set.prescriptionDetail?.optional) || (set.prescription ? isRetestRef(set.prescription.ref) : false);
}

export function plannedSetsLeftToLifter(draft: WorkoutDraft): number {
  return draft.exercises.reduce((count, exercise) => count + exercise.sets.filter(isLeftToLifter).length, 0);
}

export function markPlannedSetsDone(draft: WorkoutDraft): WorkoutDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((exercise) =>
      withSets(exercise, (sets) => sets.map((set) => (isLeftToLifter(set) ? set : { ...set, done: true }))),
    ),
  };
}

export function ratedNotDoneSetCount(draft: WorkoutDraft): number {
  return draft.exercises.reduce(
    (count, exercise) => count + exercise.sets.filter((set) => !set.done && set.effort !== null).length,
    0,
  );
}

export function notDoneSetCount(draft: WorkoutDraft): number {
  return draft.exercises.reduce((count, exercise) => count + exercise.sets.filter((set) => !set.done).length, 0);
}

export function canSwapExercise(draft: WorkoutDraft, exerciseIndex: number): boolean {
  const exercise = draft.exercises[exerciseIndex];
  return exercise?.modality === 'lift' && exercise.sets.every((set) => !set.done);
}

export function swapExercise(
  draft: WorkoutDraft,
  exerciseIndex: number,
  replacement: { id: string; name: string; loadType: LoadType },
): WorkoutDraft | null {
  if (!canSwapExercise(draft, exerciseIndex)) return null;
  const swapped = updateExerciseAt(draft, exerciseIndex, (exercise) =>
    exercise.modality === 'lift' ? swapLoadedExercise(exercise, replacement, { keepLoads: false }) : exercise,
  );
  return { ...swapped, exercises: withValidSupersets(swapped.exercises) };
}
