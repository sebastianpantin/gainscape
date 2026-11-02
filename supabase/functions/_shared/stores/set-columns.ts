import { type PrescriptionPayload, type SetPayload } from '../session-payload.ts';
import {
  type BalanceConfig,
  encodeStoredSet,
  type PrescriptionSnapshot,
  resolveEffort,
  type SetResult,
  setKind,
  storableSnapshots,
  storedSetColumnRow,
  type WritableSet,
} from '../domain/index.ts';

export function inputColumnsWithEffort(set: WritableSet, cfg: BalanceConfig) {
  const effort = resolveEffort(set.effort, cfg, setKind(set));
  return storedSetColumnRow(encodeStoredSet(set, set.kind === 'cardio' ? null : set.effectiveLoadKg, effort));
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
  return {
    ...storedSetColumnRow(encodeStoredSet(result.set, result.effectiveLoadKg, result)),
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

const NO_PRESCRIPTION_SNAPSHOT: PrescriptionSnapshotColumns = Object.freeze({
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
