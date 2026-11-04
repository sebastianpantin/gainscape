import { z } from 'zod';
import { cachedExerciseSchema, readCachedExercises } from '../lib/exercises/catalog-cache.ts';
import { type Exercise } from '../lib/exercises/catalog-rules.ts';
import { collectionRowsSchema, type CollectionRows } from '../lib/collection/collection-rules.ts';
import { userCache } from './cache-first.ts';

export const OFFLINE_COLLECTION_NOTICE = 'Offline: using your saved collection log.';

export interface SavedCollection {
  exercises: Exercise[];
  rows: CollectionRows;
}

export const collectionCache = userCache<SavedCollection>(
  'gainscape.collection.v2.',
  z.object({ exercises: z.array(cachedExerciseSchema), rows: collectionRowsSchema }),
);

export function savedExerciseList(storage: Storage | null, userId: string): Exercise[] | null {
  const collectionList = collectionCache.read(storage, userId)?.exercises ?? null;
  const exerciseList = storage && readCachedExercises(storage, userId);
  if (!collectionList || !exerciseList) return exerciseList ?? collectionList;
  const savedIds = new Set(exerciseList.map((exercise) => exercise.id));
  return [...exerciseList, ...collectionList.filter((exercise) => !savedIds.has(exercise.id))];
}
