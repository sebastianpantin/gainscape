import { type CardioInterval, type EffortInput, MAX_SETS_PER_SESSION } from '@domain/types.ts';
import type { HoldMeasure, LoadType } from '../exercises/catalog-rules.ts';
import { canAddBout } from './cardio-rules.ts';

const STARTING_EXTERNAL_LOAD_KG = 20;
export const STARTING_REPS = 8;
const STARTING_BOUT_DURATION_S = 1800;
const STARTING_HOLD_DURATION_S = 30;
const STARTING_CARRY_DISTANCE_M = 20;

export const BODYWEIGHT_LOAD_NOT_ZERO_CODE = 'bodyweight_load_not_zero';
export const UNKNOWN_EXERCISE_CODE = 'unknown_exercise';

export interface BoutValues {
  durationS: number;
  distanceM: number | null;
  interval: CardioInterval | null;
  effort: EffortInput;
}

export interface HoldValues {
  weightKg: number;
  durationS: number | null;
  distanceM: number | null;
  effort: EffortInput;
}

interface ExerciseWithSets {
  modality: 'lift' | 'cardio' | 'hold';
  sets: { id: string }[];
}

interface ExerciseOwner {
  exercises: ExerciseWithSets[];
}

type SetHolder = { exercises: readonly { sets: readonly unknown[] }[] };

type BoutTiming = Pick<BoutValues, 'durationS' | 'interval'>;

type SetAndBoutHolder = {
  exercises: readonly (
    { modality: 'cardio'; sets: readonly BoutTiming[] } | { modality: 'lift' | 'hold'; sets: readonly unknown[] }
  )[];
};

type SetOf<E> = E extends { sets: (infer S)[] } ? S : never;

type SetOfModality<Owner extends ExerciseOwner, Modality> = SetOf<
  Extract<Owner['exercises'][number], { modality: Modality }>
>;

export function defaultWeightKg(loadType: LoadType): number {
  return loadType === 'external' ? STARTING_EXTERNAL_LOAD_KG : 0;
}

export function nextSetValues(
  previous: { weightKg: number; reps: number } | undefined,
  loadType: LoadType,
): { weightKg: number; reps: number } {
  return { weightKg: previous?.weightKg ?? defaultWeightKg(loadType), reps: previous?.reps ?? STARTING_REPS };
}

export function nextBoutValues(previous: BoutValues | undefined): BoutValues {
  if (previous === undefined) {
    return { durationS: STARTING_BOUT_DURATION_S, distanceM: null, interval: null, effort: null };
  }
  const { durationS, distanceM, interval, effort } = previous;
  return { durationS, distanceM, interval, effort };
}

export function nextHoldValues(previous: HoldValues | undefined, loadType: LoadType, measure: HoldMeasure): HoldValues {
  if (previous !== undefined) {
    const { weightKg, durationS, distanceM } = previous;
    return { weightKg, durationS, distanceM, effort: null };
  }
  return {
    weightKg: defaultWeightKg(loadType),
    durationS: measure === 'time' ? STARTING_HOLD_DURATION_S : null,
    distanceM: measure === 'distance' ? STARTING_CARRY_DISTANCE_M : null,
    effort: null,
  };
}

export function setCount(owner: SetHolder): number {
  return owner.exercises.reduce((count, exercise) => count + exercise.sets.length, 0);
}

export function roomForSets(owner: SetHolder): number {
  return Math.max(0, MAX_SETS_PER_SESSION - setCount(owner));
}

export function canAddSet(owner: SetHolder): boolean {
  return roomForSets(owner) > 0;
}

export function canAddSetTo(owner: SetAndBoutHolder, modality: ExerciseWithSets['modality']): boolean {
  if (!canAddSet(owner)) return false;
  if (modality !== 'cardio') return true;
  return canAddBout(owner.exercises.flatMap((exercise) => (exercise.modality === 'cardio' ? exercise.sets : [])));
}

export function addableExercises<E extends { modality: 'lift' | 'cardio' }>(
  owner: SetAndBoutHolder,
  exercises: readonly E[],
): E[] {
  return exercises.filter((exercise) => canAddSetTo(owner, exercise.modality));
}

export function updateExerciseAt<Owner extends { exercises: unknown[] }>(
  owner: Owner,
  exerciseIndex: number,
  update: (exercise: Owner['exercises'][number]) => Owner['exercises'][number],
): Owner {
  return {
    ...owner,
    exercises: owner.exercises.map((exercise, index) => (index === exerciseIndex ? update(exercise) : exercise)),
  };
}

export function withSets<E extends { sets: { id: string }[] }>(
  exercise: E,
  change: <S extends SetOf<E>>(sets: S[]) => S[],
): E {
  return { ...exercise, sets: change(exercise.sets as SetOf<E>[]) };
}

function withSetChanged<Owner extends ExerciseOwner>(
  owner: Owner,
  exerciseIndex: number,
  modality: ExerciseWithSets['modality'],
  setId: string,
  changes: object,
): Owner {
  return updateExerciseAt(owner, exerciseIndex, (exercise) =>
    exercise.modality === modality
      ? { ...exercise, sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...changes } : set)) }
      : exercise,
  );
}

export function updateSet<Owner extends ExerciseOwner>(
  owner: Owner,
  exerciseIndex: number,
  setId: string,
  changes: Partial<Omit<SetOfModality<Owner, 'lift'>, 'id'>>,
): Owner {
  return withSetChanged(owner, exerciseIndex, 'lift', setId, changes);
}

export function updateBout<Owner extends ExerciseOwner>(
  owner: Owner,
  exerciseIndex: number,
  setId: string,
  changes: Partial<Omit<SetOfModality<Owner, 'cardio'>, 'id' | 'kind'>>,
): Owner {
  return withSetChanged(owner, exerciseIndex, 'cardio', setId, changes);
}

export function updateHoldSet<Owner extends ExerciseOwner>(
  owner: Owner,
  exerciseIndex: number,
  setId: string,
  changes: Partial<Omit<SetOfModality<Owner, 'hold'>, 'id' | 'kind'>>,
): Owner {
  return withSetChanged(owner, exerciseIndex, 'hold', setId, changes);
}

export function removeSet<Owner extends ExerciseOwner>(owner: Owner, exerciseIndex: number, setId: string): Owner {
  return updateExerciseAt(owner, exerciseIndex, (exercise) =>
    withSets(exercise, (sets) => sets.filter((set) => set.id !== setId)),
  );
}

export function withLoadType<E extends { loadType: LoadType; sets: { weightKg: number }[] }>(
  exercise: E,
  loadType: LoadType,
): E {
  const sets = loadType === 'bodyweight' ? exercise.sets.map((set) => ({ ...set, weightKg: 0 })) : exercise.sets;
  return { ...exercise, loadType, sets };
}
