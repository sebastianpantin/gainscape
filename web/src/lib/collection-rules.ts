import { collectionCompletion, type CollectionExercise } from '@domain/collection.ts';
import type { Exercise } from './catalog.ts';
import type { CollectionData } from './collection-data.ts';

function isDone(exercise: Exercise, data: CollectionData): boolean {
  return data.repMaxesByExercise.has(exercise.id) || data.maxRepsByExercise.has(exercise.id);
}

function asCollectionExercise(exercise: Exercise, data: CollectionData): CollectionExercise {
  return {
    loadType: exercise.loadType,
    exactRepMaxSlotsFilled: (data.repMaxesByExercise.get(exercise.id) ?? []).filter((slot) => slot?.exact).length,
    hasBodyweightRecord: data.maxRepsByExercise.has(exercise.id),
  };
}

export interface CountedCollection {
  pinned: Exercise[];
  counted: Exercise[];
  completion: ReturnType<typeof collectionCompletion>;
}

export function countCollection(allExercises: Exercise[], data: CollectionData): CountedCollection {
  const exercises = allExercises.filter((exercise) => exercise.modality === 'lift');
  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const pinned = data.pinnedExerciseIds
    .map((id) => byId.get(id))
    .filter((exercise): exercise is Exercise => exercise !== undefined);
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
