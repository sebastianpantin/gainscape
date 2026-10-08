import { CARDIO_RECORD_KINDS } from '@domain/types.ts';
import { z } from 'zod';
import { cachedExerciseSchema, readCachedExercises } from '../lib/catalog-cache.ts';
import { type Exercise } from '../lib/catalog-rules.ts';
import { type CollectionRows } from '../lib/collection-rules.ts';
import { userCache } from './cache-first.ts';

export const OFFLINE_COLLECTION_NOTICE = 'Offline: using your saved collection log.';

export interface SavedCollection {
  exercises: Exercise[];
  rows: CollectionRows;
}

const numeric = z.union([z.number(), z.string()]);

const collectionRowsSchema = z.object({
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
  return collectionCache.read(storage, userId)?.exercises ?? (storage && readCachedExercises(storage, userId));
}
