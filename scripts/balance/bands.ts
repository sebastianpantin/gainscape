import { levelForXp, xpForLevel } from '../../supabase/functions/_shared/domain/index.ts';
import type { SimulationResult } from './simulate.ts';
import { WEEKS_PER_YEAR } from './simulate.ts';

const LEVEL_99_XP = xpForLevel(99);

export const BANDS = Object.freeze({
  balancedLifterYears: [2, 3] as const,
  balancedLifterTargetYears: 2.5,
  focusedLifterMaxGap: 0.15,
  casualRatioTolerance: 0.2,
  balancedWeekOneLevel: [20, 40] as const,
});

export interface ProfileResults {
  hypertrophy: SimulationResult;
  strength: SimulationResult;
  balanced: SimulationResult;
  casual: SimulationResult;
}

export interface BandReport {
  xpPerEffectiveRep: number;
  comparedSkill: string;
  years: { hypertrophy: number; strength: number; balanced: number; casual: number };
  hypertrophyVsStrengthGap: number;
  casualTimeRatio: number;
  casualEffortRatio: number;
  balancedWeekOneLevel: number;
  passes: { a: boolean; b: boolean; d: boolean; e: boolean };
  violation: number;
  distanceFromTargetYears: number;
}

function yearsToLevel99(result: SimulationResult, skill: string, xpScale = 1): number {
  const weekly = result.cumulativeXpByWeek[skill];
  const reachedWeek = weekly.findIndex((xp) => xp * xpScale >= LEVEL_99_XP);
  if (reachedWeek >= 0) return (reachedWeek + 1) / WEEKS_PER_YEAR;
  const recentWeeks = Math.min(weekly.length - 1, 6 * WEEKS_PER_YEAR);
  const recentRatePerWeek = ((weekly.at(-1)! - weekly.at(-1 - recentWeeks)!) / recentWeeks) * xpScale;
  if (recentRatePerWeek <= 0) return Number.POSITIVE_INFINITY;
  return (weekly.length + (LEVEL_99_XP - weekly.at(-1)! * xpScale) / recentRatePerWeek) / WEEKS_PER_YEAR;
}

function distanceOutside(value: number, lowest: number, highest: number): number {
  if (value < lowest) return (lowest - value) / lowest;
  if (value > highest) return (value - highest) / highest;
  return 0;
}

export function evaluateBands(
  results: ProfileResults,
  comparedSkill: string,
  xpPerEffectiveRep: number,
  simulatedXpPerEffectiveRep: number,
): BandReport {
  const scale = xpPerEffectiveRep / simulatedXpPerEffectiveRep;
  const years = {
    hypertrophy: yearsToLevel99(results.hypertrophy, comparedSkill, scale),
    strength: yearsToLevel99(results.strength, comparedSkill, scale),
    balanced: yearsToLevel99(results.balanced, comparedSkill, scale),
    casual: yearsToLevel99(results.casual, comparedSkill, scale),
  };
  const hypertrophyVsStrengthGap =
    Math.abs(years.hypertrophy - years.strength) / Math.min(years.hypertrophy, years.strength);
  const casualTimeRatio = years.casual / years.balanced;
  const casualEffortRatio =
    results.balanced.averageWeeklyEffectiveRepsBySkill[comparedSkill] /
    results.casual.averageWeeklyEffectiveRepsBySkill[comparedSkill];
  const casualRatioDeviation = Math.abs(casualTimeRatio / casualEffortRatio - 1);
  const balancedWeekOneLevel = levelForXp(results.balanced.cumulativeXpByWeek[comparedSkill][0] * scale);
  const [lowestYears, highestYears] = BANDS.balancedLifterYears;
  const [lowestWeekOneLevel, highestWeekOneLevel] = BANDS.balancedWeekOneLevel;

  const violations = {
    a: distanceOutside(years.balanced, lowestYears, highestYears),
    b: Math.max(0, hypertrophyVsStrengthGap - BANDS.focusedLifterMaxGap),
    d: Math.max(0, casualRatioDeviation - BANDS.casualRatioTolerance),
    e: distanceOutside(balancedWeekOneLevel, lowestWeekOneLevel, highestWeekOneLevel),
  };
  return {
    xpPerEffectiveRep,
    comparedSkill,
    years,
    hypertrophyVsStrengthGap,
    casualTimeRatio,
    casualEffortRatio,
    balancedWeekOneLevel,
    passes: {
      a: violations.a === 0,
      b: violations.b === 0,
      d: violations.d === 0,
      e: violations.e === 0,
    },
    violation: violations.a + violations.b + violations.d + violations.e,
    distanceFromTargetYears: Math.abs(years.balanced - BANDS.balancedLifterTargetYears),
  };
}
