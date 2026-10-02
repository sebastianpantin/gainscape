import { collectionCompletion, type CollectionExercise } from '@domain/collection.ts';
import type { Exercise, LiftExercise } from './catalog.ts';
import { rateLimitedMessage } from './rate-limit.ts';
import type { CollectionData } from './collection-data.ts';

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

export interface CountedCollection {
  pinned: LiftExercise[];
  counted: LiftExercise[];
  completion: ReturnType<typeof collectionCompletion>;
}

export function countCollection(allExercises: Exercise[], data: CollectionData): CountedCollection {
  const exercises = allExercises.filter((exercise): exercise is LiftExercise => exercise.modality === 'lift');
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

export const PIN_CAP = 50;

export function pinProblemText(error: { message: string; code?: string; details?: string | null }): string {
  if (error.message === 'too_many_pins') return `You can pin up to ${PIN_CAP} exercises. Unpin one first.`;
  return rateLimitedMessage(error) ?? error.message;
}
