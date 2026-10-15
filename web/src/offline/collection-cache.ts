import { CARDIO_RECORD_KINDS } from '@domain/types.ts';
import { z } from 'zod';
import { cachedExerciseSchema, readCachedExercises } from '../lib/exercises/catalog-cache.ts';
import { type Exercise } from '../lib/exercises/catalog-rules.ts';
import { type CollectionRows } from '../lib/collection/collection-rules.ts';
import { userCache } from './cache-first.ts';

export const OFFLINE_COLLECTION_NOTICE = 'Offline: using your saved collection log.';

export interface SavedCollection {
  exercises: Exercise[];
  rows: CollectionRows;
}

const numeric = z.union([z.number(), z.string()]);

export const collectionRowsSchema = z.object({
  repMaxes: z.array(
    z.object({ exercise_id: z.string(), reps: z.number(), load_kg: numeric, exact_set_id: z.string().nullable() }),
  ),
  bodyweightRecords: z.array(z.object({ exercise_id: z.string(), max_reps: z.number() })),
  strengths: z.array(
    z.object({ exercise_id: z.string(), e1rm_kg: numeric.nullable(), reps_capacity: z.number().nullable() }),
  ),
  pins: z.array(z.object({ exercise_id: z.string(), position: z.number() })),
  cardioRecords: z.array(z.object({ exercise_id: z.string(), kind: z.enum(CARDIO_RECORD_KINDS), value: numeric })),
});

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
