import { isoTimestamp, type Transaction } from '../db.ts';
import {
  type BodyweightRepRecord,
  type CardioRecordKind,
  type CardioRecords,
  REP_MAX_SLOT_COUNT,
  type RecordState,
  type RepMaxSlot,
} from '../domain/index.ts';

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
  const cardioRows = await tx`
    select exercise_id, kind, value, set_id, achieved_at
    from public.cardio_records
    where user_id = ${userId} and exercise_id = any(${exerciseIds as string[]}::uuid[])`;

  const repMaxes: Record<string, (RepMaxSlot | null)[]> = {};
  for (const row of repMaxRows) {
    const slots = repMaxes[row.exercise_id] ?? Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
    slots[row.reps - 1] = {
      loadKg: Number(row.load_kg),
      setId: row.set_id,
      achievedAt: isoTimestamp(row.achieved_at),
      exactSetId: row.exact_set_id,
    };
    repMaxes[row.exercise_id] = slots;
  }

  const bodyweightReps: Record<string, BodyweightRepRecord> = {};
  for (const row of bodyweightRows) {
    bodyweightReps[row.exercise_id] = {
      maxReps: row.max_reps,
      setId: row.set_id,
      achievedAt: isoTimestamp(row.achieved_at),
    };
  }
  const cardio: Record<string, Partial<Record<CardioRecordKind, CardioRecords[CardioRecordKind]>>> = {};
  for (const row of cardioRows) {
    cardio[row.exercise_id] = {
      ...cardio[row.exercise_id],
      [row.kind]: { value: Number(row.value), setId: row.set_id, achievedAt: isoTimestamp(row.achieved_at) },
    };
  }
  return { repMaxes, bodyweightReps, cardio };
}

export async function replaceRecordsFor(
  tx: Transaction,
  userId: string,
  exerciseIds: readonly string[],
  records: RecordState,
): Promise<void> {
  if (exerciseIds.length === 0) return;
  await tx`delete from public.rep_maxes where user_id = ${userId} and exercise_id = any(${exerciseIds as string[]}::uuid[])`;
  await tx`
    delete from public.bodyweight_rep_records
    where user_id = ${userId} and exercise_id = any(${exerciseIds as string[]}::uuid[])`;
  await tx`
    delete from public.cardio_records
    where user_id = ${userId} and exercise_id = any(${exerciseIds as string[]}::uuid[])`;

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
  if (repMaxRows.length > 0) await tx`insert into public.rep_maxes ${tx(repMaxRows)}`;

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
  if (bodyweightRows.length > 0) await tx`insert into public.bodyweight_rep_records ${tx(bodyweightRows)}`;

  const cardioRows = exerciseIds.flatMap((exerciseId) =>
    Object.entries(records.cardio[exerciseId] ?? {}).flatMap(([kind, record]) =>
      record === undefined
        ? []
        : [
            {
              user_id: userId,
              exercise_id: exerciseId,
              kind,
              value: record.value,
              set_id: record.setId,
              achieved_at: record.achievedAt,
            },
          ],
    ),
  );
  if (cardioRows.length > 0) await tx`insert into public.cardio_records ${tx(cardioRows)}`;
}
