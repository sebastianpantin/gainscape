import type { CardioEffortLevel, EffortLevel } from './types.ts';

const BALANCE_VERSION = 4;
const XP_PER_EFFECTIVE_REP = 165;
const EFFECTIVE_RIR_WINDOW = 5;

export interface BalanceConfig {
  readonly version: number;
  readonly xpPerEffectiveRep: number;
  readonly effectiveRirWindow: number;
  readonly maxXp: number;
  readonly effortLevelRir: Readonly<Record<EffortLevel, number>>;
  readonly coldStartXpPerSet: number;
  readonly coldStartMaxSetsPerExercise: number;
  readonly coldStartAssumedRir: number;
  readonly rirTrustMargin: number;
  readonly maxRirForStrength: number;
  readonly epleyMaxRepsToFailure: number;
  readonly e1rmWindowDays: number;
  readonly maxStrengthGainPerSession: number;
  readonly intensityBonusStart: number;
  readonly intensityBonusFull: number;
  readonly intensityBonusMax: number;
  readonly prMinGainKg: number;
  readonly fatiguePerHardSet: number;
  readonly fatigueToleranceReps: number;
  readonly cardioXpPerWorkMinute: Readonly<Record<string, number>>;
  readonly cardioSteadyFactor: Readonly<Record<string, number>>;
  readonly cardioEffortFactor: Readonly<Record<CardioEffortLevel, number>>;
  readonly paceBonusStart: number;
  readonly paceBonusFull: number;
  readonly paceBonusMax: number;
  readonly paceImplausibleRatio: number;
  readonly cardioMaxCountedMinutesPerSession: number;
}

export const DEFAULT_BALANCE: BalanceConfig = Object.freeze({
  version: BALANCE_VERSION,
  xpPerEffectiveRep: XP_PER_EFFECTIVE_REP,
  effectiveRirWindow: EFFECTIVE_RIR_WINDOW,
  maxXp: 200_000_000,
  effortLevelRir: Object.freeze({ easy: 5, hard: 3, near_failure: 1, failure: 0 }),
  coldStartXpPerSet: XP_PER_EFFECTIVE_REP,
  coldStartMaxSetsPerExercise: 8,
  coldStartAssumedRir: 2,
  rirTrustMargin: 3,
  maxRirForStrength: 5,
  epleyMaxRepsToFailure: 12,
  e1rmWindowDays: 56,
  maxStrengthGainPerSession: 0.1,
  intensityBonusStart: 0.75,
  intensityBonusFull: 0.9,
  intensityBonusMax: 1.3,
  prMinGainKg: 1,
  fatiguePerHardSet: 0.02,
  fatigueToleranceReps: 1,
  cardioXpPerWorkMinute: Object.freeze({ endurance: 126, agility: 213 }),
  cardioSteadyFactor: Object.freeze({ endurance: 1, agility: 0.5 }),
  cardioEffortFactor: Object.freeze({ easy: 0.8, moderate: 1, hard: 1.2, max: 1.4 }),
  paceBonusStart: 1,
  paceBonusFull: 1.3,
  paceBonusMax: 1.3,
  paceImplausibleRatio: 2.5,
  cardioMaxCountedMinutesPerSession: 180,
});

const LOOT_VERSION = 2;

export interface LootConfig {
  readonly version: number;
  readonly regularRollsPerDay: number;
  readonly prRollsPerDay: number;
  readonly minEffectiveReps: number;
  readonly baseChance: number;
  readonly badLuckStep: number;
  readonly maxChance: number;
}

export const DEFAULT_LOOT: LootConfig = Object.freeze({
  version: LOOT_VERSION,
  regularRollsPerDay: 5,
  prRollsPerDay: 2,
  minEffectiveReps: 1,
  baseChance: 0.1,
  badLuckStep: 0.03,
  maxChance: 0.4,
});

export type ItemRarityRank = 'common' | 'uncommon' | 'rare' | 'legendary';

export interface FeedConfig {
  readonly levelMilestone: number;
  readonly levelAlwaysFrom: number;
  readonly dropMinRarity: ItemRarityRank;
}

export const DEFAULT_FEED: FeedConfig = Object.freeze({
  levelMilestone: 10,
  levelAlwaysFrom: 90,
  dropMinRarity: 'rare',
});
