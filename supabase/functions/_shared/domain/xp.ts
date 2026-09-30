import type { BalanceConfig } from './balance.ts';
import type { SkillXp } from './types.ts';

export const FULL_SHARE_BASIS_POINTS = 10_000;

export function effectiveReps(reps: number, rir: number, isWarmup: boolean, cfg: BalanceConfig): number {
  if (isWarmup) return 0;
  const repsWithinFailureWindow = Math.floor(cfg.effectiveRirWindow + 1 - rir);
  return Math.min(reps, Math.max(0, repsWithinFailureWindow));
}

const FLOAT_NOISE_DECIMALS = 6;

export function setXp(effectiveRepCount: number, intensityBonus: number, cfg: BalanceConfig): number {
  const rawXp = cfg.xpPerEffectiveRep * effectiveRepCount * intensityBonus;
  const factor = 10 ** FLOAT_NOISE_DECIMALS;
  return Math.round(Math.round(rawXp * factor) / factor);
}

export interface OrderedSkillShare {
  skillId: string;
  shareBasisPoints: number;
  sortOrder: number;
}

export function splitXp(xp: number, shares: readonly OrderedSkillShare[]): SkillXp[] {
  const shareTotal = shares.reduce((sum, share) => sum + share.shareBasisPoints, 0);
  if (shareTotal !== FULL_SHARE_BASIS_POINTS) {
    throw new RangeError(`skill shares sum to ${shareTotal} basis points, expected ${FULL_SHARE_BASIS_POINTS}`);
  }
  const parts = shares.map((share) => ({
    skillId: share.skillId,
    sortOrder: share.sortOrder,
    xp: Math.floor((xp * share.shareBasisPoints) / FULL_SHARE_BASIS_POINTS),
    remainder: (xp * share.shareBasisPoints) % FULL_SHARE_BASIS_POINTS,
  }));

  const largestRemainderFirst = [...parts].sort((a, b) => b.remainder - a.remainder || a.sortOrder - b.sortOrder);
  const undistributedXp = xp - parts.reduce((sum, part) => sum + part.xp, 0);
  largestRemainderFirst.slice(0, undistributedXp).forEach((part) => (part.xp += 1));

  return parts
    .filter((part) => part.xp > 0)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((part) => ({ skillId: part.skillId, xp: part.xp }));
}
