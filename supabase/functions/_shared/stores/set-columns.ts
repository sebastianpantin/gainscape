import { type DbRow, nullableNumber } from '../db.ts';
import { type PrescriptionPayload, type SetPayload } from '../session-payload.ts';
import {
  type BalanceConfig,
  type CardioSetInput,
  countedWorkSeconds,
  type LiftSetInput,
  type PrescriptionSnapshot,
  resolveEffort,
  type SetResult,
  setKind,
  storableSnapshots,
  type WritableSet,
} from '../domain/index.ts';

type EffortColumns = Pick<SetResult, 'effortInputType' | 'effortValue'>;

function liftInputColumns(
  set: Pick<LiftSetInput, 'id' | 'exerciseId' | 'position' | 'weightKg' | 'reps' | 'isWarmup'>,
  effectiveLoadKg: number,
  effort: EffortColumns,
) {
  return {
    id: set.id,
    exercise_id: set.exerciseId,
    position: set.position,
    weight_kg: set.weightKg,
    effective_load_kg: effectiveLoadKg,
    reps: set.reps,
    is_warmup: set.isWarmup,
    effort_input_type: effort.effortInputType,
    effort_value: effort.effortValue,
    duration_s: null,
    distance_m: null,
    interval_work_s: null,
    interval_rest_s: null,
    interval_rounds: null,
    counted_work_s: null,
  };
}

function cardioInputColumns(bout: CardioSetInput, effort: EffortColumns) {
  return {
    id: bout.id,
    exercise_id: bout.exerciseId,
    position: bout.position,
    weight_kg: null,
    effective_load_kg: null,
    reps: null,
    is_warmup: false,
    effort_input_type: effort.effortInputType,
    effort_value: effort.effortValue,
    duration_s: bout.durationS,
    distance_m: bout.distanceM,
    interval_work_s: bout.interval?.workS ?? null,
    interval_rest_s: bout.interval?.restS ?? null,
    interval_rounds: bout.interval?.rounds ?? null,
    counted_work_s: countedWorkSeconds(bout),
  };
}

function inputSetColumns(set: WritableSet, effort: EffortColumns) {
  return set.kind === 'cardio' ? cardioInputColumns(set, effort) : liftInputColumns(set, set.effectiveLoadKg, effort);
}

export function inputColumnsWithEffort(set: WritableSet, cfg: BalanceConfig) {
  return inputSetColumns(set, resolveEffort(set.effort, cfg, setKind(set)));
}

export function cardioFieldsFromRow(row: DbRow): Pick<CardioSetInput, 'durationS' | 'distanceM' | 'interval'> {
  return {
    durationS: row.duration_s,
    distanceM: nullableNumber(row.distance_m),
    interval:
      row.interval_rounds === null
        ? null
        : { workS: row.interval_work_s, restS: row.interval_rest_s, rounds: row.interval_rounds },
  };
}

export function derivedSetColumns(result: SetResult) {
  return {
    rir: result.rir,
    rir_source: result.rirSource,
    rir_flagged: result.rirFlagged,
    e1rm_before_kg: result.e1rmBeforeKg,
    e1rm_candidate_kg: result.e1rmCandidateKg,
    reps_capacity_candidate: result.repsCapacityCandidate,
    effective_reps: result.effectiveReps,
    xp_awarded: result.xp,
    counted_work_s: result.cardio?.countedWorkS ?? null,
    pace_flagged: result.cardio?.paceFlagged ?? false,
  };
}

export function newSetRow(result: SetResult, sessionId: string, userId: string) {
  const { set } = result;
  return {
    ...(set.kind === 'cardio'
      ? cardioInputColumns(set, result)
      : liftInputColumns(set, result.effectiveLoadKg, result)),
    session_id: sessionId,
    user_id: userId,
    ...derivedSetColumns(result),
  };
}

export function setSkillXpRows(results: readonly SetResult[], userId: string) {
  return results.flatMap((result) =>
    result.skillXp.map((part) => ({ set_id: result.set.id, skill_id: part.skillId, user_id: userId, xp: part.xp })),
  );
}

export interface PrescriptionSnapshotColumns {
  prescription_ref: string | null;
  prescribed_weight_kg: number | null;
  prescribed_reps: number | null;
  prescribed_min_reps: number | null;
  prescribed_amrap: boolean | null;
}

export const NO_PRESCRIPTION_SNAPSHOT: PrescriptionSnapshotColumns = Object.freeze({
  prescription_ref: null,
  prescribed_weight_kg: null,
  prescribed_reps: null,
  prescribed_min_reps: null,
  prescribed_amrap: null,
});

function snapshotColumns(snapshot: PrescriptionSnapshot | null): PrescriptionSnapshotColumns {
  if (snapshot === null) return NO_PRESCRIPTION_SNAPSHOT;
  return {
    prescription_ref: snapshot.ref,
    prescribed_weight_kg: snapshot.weightKg,
    prescribed_reps: snapshot.reps,
    prescribed_min_reps: snapshot.minReps,
    prescribed_amrap: snapshot.amrap,
  };
}

export function prescriptionSnapshotsBySetId(
  sets: readonly SetPayload[],
  keepsSnapshot: (prescription: PrescriptionPayload) => boolean,
): Map<string, PrescriptionSnapshotColumns> {
  const kept = sets.map((set) =>
    set.kind === 'lift' && set.prescription !== null && keepsSnapshot(set.prescription) ? set.prescription : null,
  );
  const snapshots = storableSnapshots(kept);
  return new Map(sets.map((set, index) => [set.id, snapshotColumns(snapshots[index])]));
}
