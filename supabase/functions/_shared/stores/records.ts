import type { Transaction } from '../db.ts';
import { type BodyweightRepRecord, REP_MAX_SLOT_COUNT, type RecordState, type RepMaxSlot } from '../domain/index.ts';

export async function loadRecords(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
): Promise<RecordState> {
  const repMaxRows = await tx`
    select exercise_id, reps, load_kg, set_id, achieved_at, exact_set_id
    from public.rep_maxes
    where user_id = ${userId} and exercise_id = any(${exerciseIds as string[]}::uuid[])`;
  const bodyweightRows = await tx`
    select exercise_id, max_reps, set_id, achieved_at
    from public.bodyweight_rep_records
    where user_id = ${userId} and exercise_id = any(${exerciseIds as string[]}::uuid[])`;

  const repMaxes: Record<string, (RepMaxSlot | null)[]> = {};
  for (const row of repMaxRows) {
    const slots = repMaxes[row.exercise_id] ?? Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
    slots[row.reps - 1] = {
      loadKg: Number(row.load_kg),
      setId: row.set_id,
      achievedAt: new Date(row.achieved_at).toISOString(),
      exactSetId: row.exact_set_id,
    };
    repMaxes[row.exercise_id] = slots;
  }

  const bodyweightReps: Record<string, BodyweightRepRecord> = {};
  for (const row of bodyweightRows) {
    bodyweightReps[row.exercise_id] = {
      maxReps: row.max_reps,
      setId: row.set_id,
      achievedAt: new Date(row.achieved_at).toISOString(),
    };
  }
  return { repMaxes, bodyweightReps };
}

export async function saveRecords(
  tx: Transaction,
  userId: string,
  records: RecordState,
  exerciseIds: readonly string[],
): Promise<void> {
  const repMaxRows = exerciseIds.flatMap((exerciseId) =>
    (records.repMaxes[exerciseId] ?? []).flatMap((slot, index) =>
      slot === null
        ? []
        : [
            {
              user_id: userId,
              exercise_id: exerciseId,
              reps: index + 1,
              load_kg: slot.loadKg,
              set_id: slot.setId,
              achieved_at: slot.achievedAt,
              exact_set_id: slot.exactSetId,
            },
          ],
    ),
  );
  if (repMaxRows.length > 0) {
    await tx`
      insert into public.rep_maxes ${tx(repMaxRows)}
      on conflict (user_id, exercise_id, reps) do update
        set load_kg = excluded.load_kg, set_id = excluded.set_id,
            achieved_at = excluded.achieved_at, exact_set_id = excluded.exact_set_id`;
  }

  const bodyweightRows = exerciseIds
    .filter((exerciseId) => records.bodyweightReps[exerciseId])
    .map((exerciseId) => {
      const record = records.bodyweightReps[exerciseId];
      return {
        user_id: userId,
        exercise_id: exerciseId,
        max_reps: record.maxReps,
        set_id: record.setId,
        achieved_at: record.achievedAt,
      };
    });
  if (bodyweightRows.length > 0) {
    await tx`
      insert into public.bodyweight_rep_records ${tx(bodyweightRows)}
      on conflict (user_id, exercise_id) do update
        set max_reps = excluded.max_reps, set_id = excluded.set_id, achieved_at = excluded.achieved_at`;
  }
}

export async function replaceAllRecords(tx: Transaction, userId: string, records: RecordState): Promise<void> {
  await tx`delete from public.rep_maxes where user_id = ${userId}`;
  await tx`delete from public.bodyweight_rep_records where user_id = ${userId}`;
  const exerciseIds = [...new Set([...Object.keys(records.repMaxes), ...Object.keys(records.bodyweightReps)])];
  await saveRecords(tx, userId, records, exerciseIds);
}
