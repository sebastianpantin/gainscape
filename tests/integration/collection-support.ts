import { expect } from 'vitest';
import { EXERCISE_COLUMNS, type ExerciseRow, toExercise } from '../../web/src/lib/catalog-rules.ts';
import { COLLECTION_COLUMNS, collectionDataFrom, countCollection } from '../../web/src/lib/collection-rules.ts';
import type { TestUser } from './local-stack.ts';

async function visibleExercises(user: TestUser) {
  const { data, error } = await user.client.from('exercises').select(EXERCISE_COLUMNS).order('name');
  expect(error).toBeNull();
  return (data as unknown as ExerciseRow[]).map(toExercise);
}

async function collectionRows(user: TestUser) {
  const [repMaxes, bodyweightRecords, strengths, pins, cardioRecords] = await Promise.all([
    user.client.from('rep_maxes').select(COLLECTION_COLUMNS.repMaxes).eq('user_id', user.id),
    user.client.from('bodyweight_rep_records').select(COLLECTION_COLUMNS.bodyweightRecords).eq('user_id', user.id),
    user.client.from('exercise_maxes').select(COLLECTION_COLUMNS.strengths).eq('user_id', user.id),
    user.client
      .from('pinned_exercises')
      .select(COLLECTION_COLUMNS.pins)
      .eq('user_id', user.id)
      .order('position')
      .order('created_at'),
    user.client.from('cardio_records').select(COLLECTION_COLUMNS.cardioRecords).eq('user_id', user.id),
  ]);
  for (const result of [repMaxes, bodyweightRecords, strengths, pins, cardioRecords]) expect(result.error).toBeNull();
  return {
    repMaxes: repMaxes.data!,
    bodyweightRecords: bodyweightRecords.data!,
    strengths: strengths.data!,
    pins: pins.data!,
    cardioRecords: cardioRecords.data!,
  };
}

export async function webCollectionCounts(user: TestUser): Promise<{ filledSlots: number; totalSlots: number }> {
  const [exercises, rows] = await Promise.all([visibleExercises(user), collectionRows(user)]);
  const { completion } = countCollection(exercises, collectionDataFrom(rows));
  return { filledSlots: completion.filledSlots, totalSlots: completion.totalSlots };
}
