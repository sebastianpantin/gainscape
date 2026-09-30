import type { SetResult } from '../domain/index.ts';

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
  return {
    id: result.set.id,
    session_id: sessionId,
    user_id: userId,
    exercise_id: result.set.exerciseId,
    position: result.set.position,
    weight_kg: result.set.weightKg,
    effective_load_kg: result.effectiveLoadKg,
    reps: result.set.reps,
    is_warmup: result.set.isWarmup,
    effort_input_type: result.effortInputType,
    effort_value: result.effortValue,
    ...derivedSetColumns(result),
  };
}

export function setSkillXpRows(results: readonly SetResult[], userId: string) {
  return results.flatMap((result) =>
    result.skillXp.map((part) => ({ set_id: result.set.id, skill_id: part.skillId, user_id: userId, xp: part.xp })),
  );
}
