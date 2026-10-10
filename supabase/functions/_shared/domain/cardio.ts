import type { BalanceConfig } from './balance.ts';
import { roundTo } from './math.ts';
import {
  CARDIO_EFFORT_LEVELS,
  type CardioEffortLevel,
  type CardioExerciseDef,
  type CardioInterval,
  type CardioSetInput,
  type EffortInput,
  type SkillXp,
} from './types.ts';
import { FLOAT_NOISE_DECIMALS, FULL_SHARE_BASIS_POINTS, roundXp } from './xp.ts';

export const SECONDS_PER_MINUTE = 60;
export const METRES_PER_KM = 1000;
export const MOBILITY_SKILL_KEY = 'mobility';

export const CARDIO_BOUNDS = Object.freeze({
  steadyDurationS: Object.freeze({ min: 60, max: 14_400 }),
  intervalDurationS: Object.freeze({ min: 5, max: 14_400 }),
  intervalRounds: Object.freeze({ min: 1, max: 100 }),
  intervalWorkS: Object.freeze({ min: 5, max: 3600 }),
  intervalRestS: Object.freeze({ min: 0, max: 3600 }),
  distanceM: Object.freeze({ min: 1, max: 200_000 }),
});

const DEFAULT_CARDIO_EFFORT: CardioEffortLevel = 'moderate';

export function intervalDurationSeconds(interval: CardioInterval): number {
  return interval.rounds * interval.workS + (interval.rounds - 1) * interval.restS;
}

export function boutDurationSeconds(bout: { durationS: number; interval: CardioInterval | null }): number {
  return bout.interval === null ? bout.durationS : intervalDurationSeconds(bout.interval);
}

export function countedWorkSeconds(bout: Pick<CardioSetInput, 'durationS' | 'interval'>): number {
  return bout.interval === null ? bout.durationS : bout.interval.rounds * bout.interval.workS;
}

export function derivedCardioEffort(effort: EffortInput, maxEffort: CardioEffortLevel): CardioEffortLevel {
  const logged = effort?.type === 'cardio' ? effort.level : DEFAULT_CARDIO_EFFORT;
  const ceiling = CARDIO_EFFORT_LEVELS.indexOf(maxEffort);
  return CARDIO_EFFORT_LEVELS[Math.min(CARDIO_EFFORT_LEVELS.indexOf(logged), ceiling)];
}

export function paceSPerKm(durationS: number, distanceM: number): number {
  return (durationS * METRES_PER_KM) / distanceM;
}

export function speedRatio(referencePaceSPerKm: number, distanceM: number, durationS: number): number {
  return (referencePaceSPerKm * distanceM) / (METRES_PER_KM * durationS);
}

export function paceBonus(ratio: number, cfg: BalanceConfig): number {
  const progress = Math.min(1, Math.max(0, (ratio - cfg.paceBonusStart) / (cfg.paceBonusFull - cfg.paceBonusStart)));
  return roundTo(FLOAT_NOISE_DECIMALS, 1 + (cfg.paceBonusMax - 1) * progress);
}

export function isPaceImplausible(ratio: number, cfg: BalanceConfig): boolean {
  return ratio > cfg.paceImplausibleRatio;
}

export interface BoutPace {
  paceBonus: number;
  paceFlagged: boolean;
}

const NO_PACE_BONUS: BoutPace = Object.freeze({ paceBonus: 1, paceFlagged: false });

export function boutPace(bout: CardioSetInput, exercise: CardioExerciseDef, cfg: BalanceConfig): BoutPace {
  const referencePaceSPerKm = exercise.cardio.referencePaceSPerKm;
  if (bout.interval !== null || bout.distanceM === null || referencePaceSPerKm === null || !exercise.builtIn) {
    return NO_PACE_BONUS;
  }
  const ratio = speedRatio(referencePaceSPerKm, bout.distanceM, bout.durationS);
  if (isPaceImplausible(ratio, cfg)) return { paceBonus: 1, paceFlagged: true };
  return { paceBonus: paceBonus(ratio, cfg), paceFlagged: false };
}

export interface CardioXpBout {
  xpCountedWorkS: number;
  effort: CardioEffortLevel;
  paceBonus: number;
  steady: boolean;
}

export interface CardioSkillShare {
  skillId: string;
  skillKey: string;
  shareBasisPoints: number;
}

export function cardioSkillXp(bout: CardioXpBout, shares: readonly CardioSkillShare[], cfg: BalanceConfig): SkillXp[] {
  const minutes = bout.xpCountedWorkS / SECONDS_PER_MINUTE;
  return shares
    .map((share) => {
      const rate = cfg.cardioXpPerWorkMinute[share.skillKey] ?? 0;
      const steadyFactor = bout.steady ? (cfg.cardioSteadyFactor[share.skillKey] ?? 1) : 1;
      const rawXp =
        minutes *
        rate *
        steadyFactor *
        (share.shareBasisPoints / FULL_SHARE_BASIS_POINTS) *
        cfg.cardioEffortFactor[bout.effort] *
        bout.paceBonus;
      return { skillId: share.skillId, xp: roundXp(rawXp) };
    })
    .filter((part) => part.xp > 0);
}
