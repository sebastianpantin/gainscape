import type { BalanceConfig } from './balance.ts';
import type { SessionContext, Step } from './pipeline.ts';
import { isLiftResult, type LiftExerciseDef, type LiftSetResult, type SetResult } from './types.ts';

const EPLEY_REPS_PER_LOAD_RATIO = 30;
const FLOOR_TOLERANCE = 1e-9;
const REPS_MODEL_UNIT_LOAD = 1;

function measuresRepsCapacity(exercise: LiftExerciseDef): boolean {
  return exercise.loadType === 'bodyweight';
}

function effortProximity(rir: number, cfg: BalanceConfig): number {
  const repsCountedAsEffective = cfg.effectiveRirWindow + 1;
  return Math.min(1, Math.max(0, (repsCountedAsEffective - rir) / repsCountedAsEffective));
}

export function fatigueAfterSet(rir: number, cfg: BalanceConfig): number {
  return 1 - cfg.fatiguePerHardSet * effortProximity(rir, cfg);
}

function loadRatioAtFailure(reps: number): number {
  return 1 + (reps - 1) / EPLEY_REPS_PER_LOAD_RATIO;
}

function repsAtFailure(loadRatio: number): number {
  return 1 + EPLEY_REPS_PER_LOAD_RATIO * (loadRatio - 1);
}

export function fatiguedStrength(strength: number, fatigue: number, repsCapacityModel: boolean): number {
  if (!repsCapacityModel) return strength * fatigue;
  return repsAtFailure(loadRatioAtFailure(strength) * fatigue);
}

function workingLoad(result: SetResult, exercise: LiftExerciseDef): number {
  return measuresRepsCapacity(exercise) ? REPS_MODEL_UNIT_LOAD : result.effectiveLoadKg;
}

function claimedRir(result: SetResult, cfg: BalanceConfig): number {
  return result.rirForXp ?? cfg.coldStartAssumedRir;
}

function rirFloorFromLaterSets(
  checked: LiftSetResult,
  laterSets: readonly LiftSetResult[],
  exercise: LiftExerciseDef,
  cfg: BalanceConfig,
): number {
  const checkedLoad = workingLoad(checked, exercise);
  let fatigueSinceChecked = fatigueAfterSet(claimedRir(checked, cfg), cfg);
  let floor = 0;
  for (const later of laterSets) {
    const laterLoad = workingLoad(later, exercise);
    if (laterLoad > 0) {
      const demonstratedStrength = laterLoad * loadRatioAtFailure(later.set.reps);
      const freshRepsAtCheckedLoad = repsAtFailure(demonstratedStrength / (fatigueSinceChecked * checkedLoad));
      const impliedRir = Math.floor(
        freshRepsAtCheckedLoad - checked.set.reps - cfg.fatigueToleranceReps + FLOOR_TOLERANCE,
      );
      floor = Math.max(floor, impliedRir);
    }
    fatigueSinceChecked *= fatigueAfterSet(claimedRir(later, cfg), cfg);
  }
  return floor;
}

export const checkFatigue: Step = (ctx: SessionContext) => {
  const workingSets = ctx.sets.filter(isLiftResult).filter((result) => !result.set.isWarmup);
  const sets = ctx.sets.map((result): SetResult => {
    if (!isLiftResult(result) || result.set.isWarmup || result.rirForXp === null) return result;
    const exercise = ctx.deps.catalog.exercises.get(result.set.exerciseId)!;
    if (exercise.modality === 'cardio' || workingLoad(result, exercise) <= 0) return result;
    const laterSets = workingSets.filter(
      (other) => other.set.exerciseId === result.set.exerciseId && other.set.position > result.set.position,
    );
    const floor = rirFloorFromLaterSets(result, laterSets, exercise, ctx.cfg);
    if (floor <= result.rirForXp) return result;
    return {
      ...result,
      rirForXp: floor,
      rirFlagged: result.rirSource === 'logged' || result.rirFlagged,
      intensityBonus: 1,
    };
  });
  return { ...ctx, sets };
};
