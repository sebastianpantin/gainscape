import { isLiftResult, KindMismatchError, type LiftSetInput, type SetResult } from '../domain/index.ts';

export function inputSetColumns(
  set: Pick<LiftSetInput, 'id' | 'exerciseId' | 'position' | 'weightKg' | 'reps' | 'isWarmup'>,
  effectiveLoadKg: number,
  effort: Pick<SetResult, 'effortInputType' | 'effortValue'>,
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
  };
}

export function newSetRow(result: SetResult, sessionId: string, userId: string) {
  if (!isLiftResult(result)) throw new KindMismatchError(result.set.exerciseId);
  return {
    ...inputSetColumns(result.set, result.effectiveLoadKg, result),
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
