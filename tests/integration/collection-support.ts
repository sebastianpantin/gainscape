import { REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import type { Exercise } from '../../web/src/lib/catalog.ts';
import type { CollectionData, RepMaxSlotView } from '../../web/src/lib/collection-data.ts';
import { countCollection } from '../../web/src/lib/collection-rules.ts';
import { db } from './local-stack.ts';

async function visibleExercises(userId: string): Promise<Exercise[]> {
  const rows = await db`
    select e.id, e.name, e.equipment, e.load_type, e.owner_user_id, e.archived_at
    from public.exercises e
    where e.owner_user_id = ${userId}
       or (e.owner_user_id is null and (not e.requires_unlock or exists (
         select 1 from public.user_unlocks u where u.user_id = ${userId} and u.exercise_id = e.id)))
    order by e.name`;
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    equipment: row.equipment,
    loadType: row.load_type,
    custom: row.owner_user_id !== null,
    archived: row.archived_at !== null,
  }));
}

async function collectionData(userId: string): Promise<CollectionData> {
  const repMaxes = await db`
    select exercise_id, reps, load_kg::float, exact_set_id from public.rep_maxes where user_id = ${userId}`;
  const bodyweight =
    await db`select exercise_id, max_reps from public.bodyweight_rep_records where user_id = ${userId}`;
  const pins = await db`
    select exercise_id, position from public.pinned_exercises where user_id = ${userId} order by position, created_at`;
  const repMaxesByExercise = new Map<string, (RepMaxSlotView | null)[]>();
  for (const row of repMaxes) {
    const slots = repMaxesByExercise.get(row.exercise_id) ?? Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
    slots[row.reps - 1] = { loadKg: row.load_kg, exact: row.exact_set_id !== null };
    repMaxesByExercise.set(row.exercise_id, slots);
  }
  return {
    repMaxesByExercise,
    maxRepsByExercise: new Map(bodyweight.map((row) => [row.exercise_id, row.max_reps])),
    strengthByExercise: new Map(),
    pinnedExerciseIds: pins.map((row) => row.exercise_id),
    nextPinPosition: Math.max(-1, ...pins.map((row) => row.position)) + 1,
  };
}

export async function webCollectionCounts(userId: string): Promise<{ filledSlots: number; totalSlots: number }> {
  const { completion } = countCollection(await visibleExercises(userId), await collectionData(userId));
  return { filledSlots: completion.filledSlots, totalSlots: completion.totalSlots };
}
