import { KindMismatchError, UnknownExerciseError } from './errors.ts';
import type { CardioExerciseDef, Catalog, ExerciseDef, LiftExerciseDef, SetInput } from './types.ts';

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
