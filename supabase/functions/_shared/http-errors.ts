import { BodyweightLoadNotZeroError, BodyweightRequiredError, UnknownExerciseError } from './domain/index.ts';
import { HttpError } from './http.ts';
import { isUniqueViolation } from './stores/sessions.ts';

export function asHttpError(error: unknown): unknown {
  if (isUniqueViolation(error)) return new HttpError(409, 'id_conflict');
  if (error instanceof BodyweightRequiredError) return new HttpError(409, 'bodyweight_required');
  if (error instanceof BodyweightLoadNotZeroError) return new HttpError(422, 'bodyweight_load_not_zero');
  if (error instanceof UnknownExerciseError)
    return new HttpError(422, 'unknown_exercise', { exerciseIds: [error.exerciseId] });
  return error;
}
