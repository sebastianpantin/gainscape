import { type CardioSetInput, countedWorkSeconds, type LiftSetInput, type SetResult } from '../domain/index.ts';

type EffortColumns = Pick<SetResult, 'effortInputType' | 'effortValue'>;

export type WritableSet = (LiftSetInput & { effectiveLoadKg: number }) | CardioSetInput;

export function liftInputColumns(
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

export function cardioInputColumns(bout: CardioSetInput, effort: EffortColumns) {
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

export function inputSetColumns(set: WritableSet, effort: EffortColumns) {
  return set.kind === 'cardio' ? cardioInputColumns(set, effort) : liftInputColumns(set, set.effectiveLoadKg, effort);
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
