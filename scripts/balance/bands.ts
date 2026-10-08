import { levelForXp } from '../../supabase/functions/_shared/domain/index.ts';
import { CARDIO_SIM_SKILLS } from './catalog.ts';
import type { CardioSimulationResult } from './cardio-simulate.ts';
import { LEVEL_99_XP } from './progress.ts';
import type { SimulationResult } from './simulate.ts';
import { WEEKS_PER_YEAR } from './simulate.ts';

export const BANDS = Object.freeze({
  balancedLifterYears: [2, 3] as const,
  balancedLifterTargetYears: 2.5,
  focusedLifterMaxGap: 0.15,
  casualRatioTolerance: 0.2,
  balancedWeekOneLevel: [20, 40] as const,
});

export const GEAR_BANDS = Object.freeze({
  fullAscendantXpRatio: [1.09, 1.11] as const,
  beltOnlyCoreRatio: [1.09, 1.11] as const,
});

export const CHALLENGE_BANDS = Object.freeze({
  everySessionXpRatio: [1.24, 1.26] as const,
  withFullAscendantRatio: [1.34, 1.36] as const,
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

function yearsToLevel99(result: Pick<SimulationResult, 'cumulativeXpByWeek'>, skill: string, xpScale = 1): number {
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

export const CARDIO_BANDS = Object.freeze({
  balancedYears: [2, 3] as const,
  balancedTargetYears: 2.5,
  balancedWeekOneLevel: [20, 40] as const,
  maxAgilityToEnduranceRateRatio: 2.5,
});

export interface CardioProfileResults {
  balanced: CardioSimulationResult;
  steadyAgilityBoutXp: number;
  intervalSessionAgilityXp: number;
}

export interface CardioBandReport {
  rates: Record<string, number>;
  years: Record<string, number>;
  weekOneLevel: Record<string, number>;
  agilityToEnduranceRateRatio: number;
  steadyAgilityBoutXp: number;
  intervalSessionAgilityXp: number;
  passes: { yearsTo99: Record<string, boolean>; weekOneLevel: Record<string, boolean>; g: boolean; h: boolean };
  violation: number;
}

export function evaluateCardioBands(
  results: CardioProfileResults,
  rates: Readonly<Record<string, number>>,
  simulatedRates: Readonly<Record<string, number>>,
): CardioBandReport {
  const skills = CARDIO_SIM_SKILLS.map((skill) => skill.key);
  const scaleOf = (skill: string) => rates[skill] / simulatedRates[skill];
  const [lowestYears, highestYears] = CARDIO_BANDS.balancedYears;
  const [lowestWeekOneLevel, highestWeekOneLevel] = CARDIO_BANDS.balancedWeekOneLevel;
  const years = Object.fromEntries(
    skills.map((skill) => [skill, yearsToLevel99(results.balanced, skill, scaleOf(skill))]),
  );
  const weekOneLevel = Object.fromEntries(
    skills.map((skill) => [skill, levelForXp(results.balanced.cumulativeXpByWeek[skill][0] * scaleOf(skill))]),
  );
  const agilityToEnduranceRateRatio = rates.agility / rates.endurance;
  const steadyAgilityBoutXp = results.steadyAgilityBoutXp * scaleOf('agility');
  const intervalSessionAgilityXp = results.intervalSessionAgilityXp * scaleOf('agility');

  const yearViolations = skills.map((skill) => distanceOutside(years[skill], lowestYears, highestYears));
  const weekOneViolations = skills.map((skill) =>
    distanceOutside(weekOneLevel[skill], lowestWeekOneLevel, highestWeekOneLevel),
  );
  const g = Math.max(0, agilityToEnduranceRateRatio - CARDIO_BANDS.maxAgilityToEnduranceRateRatio);
  const h = Math.max(0, steadyAgilityBoutXp - intervalSessionAgilityXp) / Math.max(1, intervalSessionAgilityXp);
  return {
    rates: { ...rates },
    years,
    weekOneLevel,
    agilityToEnduranceRateRatio,
    steadyAgilityBoutXp,
    intervalSessionAgilityXp,
    passes: {
      yearsTo99: Object.fromEntries(skills.map((skill, index) => [skill, yearViolations[index] === 0])),
      weekOneLevel: Object.fromEntries(skills.map((skill, index) => [skill, weekOneViolations[index] === 0])),
      g: g === 0,
      h: h === 0,
    },
    violation: [...yearViolations, ...weekOneViolations, g, h].reduce((sum, value) => sum + value, 0),
  };
}
