import { pgErrorCode } from './db.ts';
import {
  BodyweightLoadNotZeroError,
  BodyweightRequiredError,
  KindMismatchError,
  UnknownExerciseError,
} from './domain/index.ts';
import { HttpError } from './http.ts';

const UNIQUE_VIOLATION = '23505';

export function asHttpError(error: unknown): unknown {
  if (pgErrorCode(error) === UNIQUE_VIOLATION) return new HttpError(409, 'id_conflict');
  if (error instanceof BodyweightRequiredError) return new HttpError(409, 'bodyweight_required');
  if (error instanceof BodyweightLoadNotZeroError) return new HttpError(422, 'bodyweight_load_not_zero');
  if (error instanceof KindMismatchError) {
    return new HttpError(422, 'kind_mismatch', { exerciseIds: [error.exerciseId] });
  }
  if (error instanceof UnknownExerciseError)
    return new HttpError(422, 'unknown_exercise', { exerciseIds: [error.exerciseId] });
  return error;
}
