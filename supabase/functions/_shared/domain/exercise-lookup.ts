import { KindMismatchError, UnknownExerciseError } from './errors.ts';
import {
  type CardioExerciseDef,
  type Catalog,
  type ExerciseDef,
  type HoldSetInput,
  type LiftExerciseDef,
  measureOf,
  type SetInput,
} from './types.ts';

export function exerciseFor(set: Pick<SetInput, 'exerciseId'>, catalog: Catalog): ExerciseDef {
  const exercise = catalog.exercises.get(set.exerciseId);
  if (!exercise) throw new UnknownExerciseError(set.exerciseId);
  return exercise;
}

export function liftExercise(exercise: ExerciseDef): LiftExerciseDef {
  if (exercise.modality === 'cardio') throw new KindMismatchError(exercise.id);
  return exercise;
}

export function cardioExercise(exercise: ExerciseDef): CardioExerciseDef {
  if (exercise.modality !== 'cardio') throw new KindMismatchError(exercise.id);
  return exercise;
}

export function liftExerciseFor(set: Pick<SetInput, 'exerciseId'>, catalog: Catalog): LiftExerciseDef {
  return liftExercise(exerciseFor(set, catalog));
}

export function repsExercise(exercise: ExerciseDef): LiftExerciseDef {
  const lift = liftExercise(exercise);
  if (measureOf(lift) !== 'reps') throw new KindMismatchError(exercise.id);
  return lift;
}

export function holdExercise(
  exercise: ExerciseDef,
  hold: Pick<HoldSetInput, 'durationS' | 'distanceM'>,
): LiftExerciseDef {
  const lift = liftExercise(exercise);
  const measure = measureOf(lift);
  const timed = hold.durationS !== null && hold.distanceM === null;
  const carried = hold.distanceM !== null && hold.durationS === null;
  if ((measure === 'time' && timed) || (measure === 'distance' && carried)) return lift;
  throw new KindMismatchError(exercise.id);
}
