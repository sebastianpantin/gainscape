import type { EffortLevel } from './types.ts';

export const BALANCE_VERSION = 2;
export const XP_PER_EFFECTIVE_REP = 375;
export const EFFECTIVE_RIR_WINDOW = 5;

export interface BalanceConfig {
  readonly version: number;
  readonly xpPerEffectiveRep: number;
  readonly effectiveRirWindow: number;
  readonly maxXp: number;
  readonly effortLevelRir: Readonly<Record<EffortLevel, number>>;
  readonly coldStartXpPerSet: number;
  readonly coldStartAssumedRir: number;
  readonly rirTrustMargin: number;
  readonly maxRirForStrength: number;
  readonly epleyMaxRepsToFailure: number;
  readonly e1rmWindowDays: number;
  readonly maxStrengthGainPerSession: number;
  readonly intensityBonusStart: number;
  readonly intensityBonusFull: number;
  readonly intensityBonusMax: number;
  readonly prEpsilonKg: number;
}

export const DEFAULT_BALANCE: BalanceConfig = Object.freeze({
  version: BALANCE_VERSION,
  xpPerEffectiveRep: XP_PER_EFFECTIVE_REP,
  effectiveRirWindow: EFFECTIVE_RIR_WINDOW,
  maxXp: 200_000_000,
  effortLevelRir: Object.freeze({ easy: 6, hard: 3, near_failure: 1, failure: 0 }),
  coldStartXpPerSet: XP_PER_EFFECTIVE_REP,
  coldStartAssumedRir: 2,
  rirTrustMargin: 3,
  maxRirForStrength: 5,
  epleyMaxRepsToFailure: 12,
  e1rmWindowDays: 56,
  maxStrengthGainPerSession: 0.1,
  intensityBonusStart: 0.75,
  intensityBonusFull: 0.9,
  intensityBonusMax: 1.3,
  prEpsilonKg: 0.05,
});
