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

interface WeightAndReps {
  weightKg: number;
  reps: number;
}

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

export interface LiftSet {
  id: string;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  effort: EffortInput;
}

export interface BoutSet extends BoutValues {
  id: string;
  kind: 'cardio';
}

export interface HoldSet extends HoldValues {
  id: string;
  kind: 'hold';
}

export interface LiftExerciseOf<S extends LiftSet> {
  exerciseId: string;
  name: string;
  modality: 'lift';
  loadType: LoadType;
  sets: S[];
}

export interface HoldExerciseOf<S extends HoldSet> {
  exerciseId: string;
  name: string;
  modality: 'hold';
  measure: HoldMeasure;
  loadType: LoadType;
  sets: S[];
}

type GrowableExercise =
  | { modality: 'lift'; loadType: LoadType; sets: LiftSet[] }
  | { modality: 'cardio'; sets: BoutSet[] }
  | { modality: 'hold'; loadType: LoadType; measure: HoldMeasure; sets: HoldSet[] };

interface GrowableOwner {
  exercises: GrowableExercise[];
}

export type OwnSetFields<Owner extends GrowableOwner> = Omit<
  Owner['exercises'][number]['sets'][number],
  keyof LiftSet | keyof BoutSet | keyof HoldSet
>;

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

export function nextSetValues(previous: WeightAndReps | undefined, loadType: LoadType): WeightAndReps {
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

function newSetFor(exercise: GrowableExercise, firstSet: WeightAndReps | undefined): LiftSet | BoutSet | HoldSet {
  const id = crypto.randomUUID();
  if (exercise.modality === 'cardio') return { id, kind: 'cardio', ...nextBoutValues(exercise.sets.at(-1)) };
  if (exercise.modality === 'hold')
    return { id, kind: 'hold', ...nextHoldValues(exercise.sets.at(-1), exercise.loadType, exercise.measure) };
  return { id, ...nextSetValues(exercise.sets.at(-1) ?? firstSet, exercise.loadType), isWarmup: false, effort: null };
}

export function addSetTo<Owner extends GrowableOwner>(
  owner: Owner,
  exerciseIndex: number,
  ownFields: OwnSetFields<Owner>,
  firstSet?: WeightAndReps,
): Owner {
  const target = owner.exercises[exerciseIndex];
  if (target === undefined || !canAddSetTo(owner, target.modality)) return owner;
  return updateExerciseAt(owner, exerciseIndex, (exercise) => ({
    ...exercise,
    sets: [...exercise.sets, { ...newSetFor(exercise, firstSet), ...ownFields }],
  }));
}

export function addExerciseTo<Owner extends GrowableOwner>(owner: Owner, exercise: Owner['exercises'][number]): Owner {
  if (!canAddSetTo(owner, exercise.modality)) return owner;
  return { ...owner, exercises: [...owner.exercises, exercise] };
}

export function swapLoadedExercise<
  E extends { exerciseId: string; name: string; loadType: LoadType; sets: { weightKg: number }[] },
>(
  exercise: E,
  replacement: { id: string; name: string; loadType: LoadType },
  { keepLoads }: { keepLoads: boolean },
): E {
  const sets = keepLoads
    ? exercise.sets
    : exercise.sets.map((set) => ({ ...set, weightKg: defaultWeightKg(replacement.loadType) }));
  return { ...exercise, exerciseId: replacement.id, name: replacement.name, loadType: replacement.loadType, sets };
}

export function withLoadType<E extends { loadType: LoadType; sets: { weightKg: number }[] }>(
  exercise: E,
  loadType: LoadType,
): E {
  const sets = loadType === 'bodyweight' ? exercise.sets.map((set) => ({ ...set, weightKg: 0 })) : exercise.sets;
  return { ...exercise, loadType, sets };
}
