import { type BalanceConfig, DEFAULT_BALANCE, xpForLevel } from '../../supabase/functions/_shared/domain/index.ts';
import {
  type BandReport,
  CARDIO_BANDS,
  type CardioBandReport,
  type CardioProfileResults,
  evaluateBands,
  evaluateCardioBands,
  type ProfileResults,
} from './bands.ts';
import {
  type CardioSimulationOptions,
  intervalSessionAgilityXp,
  simulateCardioProfile,
  steadyAgilityBoutXp,
} from './cardio-simulate.ts';
import { CARDIO_SIM_SKILLS } from './catalog.ts';
import { CARDIO_PROFILES, PROFILES } from './profiles.ts';
import { firstSkillToLevel99, type SimulationOptions, simulateProfile, WEEKS_PER_YEAR } from './simulate.ts';

const UNIT_XP_PER_EFFECTIVE_REP = 1000;
const TUNING_YEARS = 8;
const XP_SEARCH_RANGE = { lowest: 50, highest: 2000, step: 5 };
const BONUS_MAX_GRID = [1.2, 1.22, 1.24, 1.26, 1.28, 1.3];
const BONUS_FULL_GRID = [0.9, 0.95];

export interface TuningCandidate {
  intensityBonusMax: number;
  intensityBonusFull: number;
  report: BandReport;
}

function simulateAllProfiles(cfg: BalanceConfig, options: SimulationOptions): ProfileResults {
  return {
    hypertrophy: simulateProfile(PROFILES.hypertrophy, cfg, options),
    strength: simulateProfile(PROFILES.strength, cfg, options),
    balanced: simulateProfile(PROFILES.balanced, cfg, options),
    casual: simulateProfile(PROFILES.casual, cfg, options),
  };
}

export function simulateCommittedConstantsUntilLegsReach99(): ProfileResults {
  return simulateAllProfiles(DEFAULT_BALANCE, { stopWhenSkillsReach99: ['legs'] });
}

function bestXpFor(results: ProfileResults, simulatedXp: number): BandReport {
  const comparedSkill = firstSkillToLevel99(results.hypertrophy) ?? mostTrainedSkill(results);
  let best: BandReport | null = null;
  for (let xp = XP_SEARCH_RANGE.lowest; xp <= XP_SEARCH_RANGE.highest; xp += XP_SEARCH_RANGE.step) {
    const report = evaluateBands(results, comparedSkill, xp, simulatedXp);
    if (best === null || isBetter(report, best)) best = report;
  }
  return best!;
}

function isBetter(candidate: BandReport, incumbent: BandReport): boolean {
  if (candidate.violation !== incumbent.violation) return candidate.violation < incumbent.violation;
  return candidate.distanceFromTargetYears < incumbent.distanceFromTargetYears;
}

function mostTrainedSkill(results: ProfileResults): string {
  const finalXp = Object.entries(results.hypertrophy.cumulativeXpByWeek).map(
    ([skill, weekly]) => [skill, weekly.at(-1) ?? 0] as const,
  );
  return finalXp.sort((a, b) => b[1] - a[1])[0][0];
}

export function tune(): TuningCandidate[] {
  const candidates: TuningCandidate[] = [];
  for (const intensityBonusMax of BONUS_MAX_GRID) {
    for (const intensityBonusFull of BONUS_FULL_GRID) {
      const cfg = {
        ...DEFAULT_BALANCE,
        xpPerEffectiveRep: UNIT_XP_PER_EFFECTIVE_REP,
        intensityBonusMax,
        intensityBonusFull,
      };
      const results = simulateAllProfiles(cfg, { maxYears: TUNING_YEARS });
      candidates.push({ intensityBonusMax, intensityBonusFull, report: bestXpFor(results, UNIT_XP_PER_EFFECTIVE_REP) });
    }
  }
  return candidates.sort(
    (a, b) =>
      a.report.violation - b.report.violation ||
      a.report.hypertrophyVsStrengthGap - b.report.hypertrophyVsStrengthGap ||
      a.report.distanceFromTargetYears - b.report.distanceFromTargetYears,
  );
}

const UNIT_CARDIO_XP_PER_WORK_MINUTE = 1000;
const CARDIO_TUNING_YEARS = 1;

function simulateCardio(cfg: BalanceConfig, options: CardioSimulationOptions): CardioProfileResults {
  const profile = CARDIO_PROFILES.cardio_balanced;
  return {
    balanced: simulateCardioProfile(profile, cfg, options),
    steadyAgilityBoutXp: steadyAgilityBoutXp(profile, cfg),
    intervalSessionAgilityXp: intervalSessionAgilityXp(profile, cfg),
  };
}

export function simulateCommittedCardioConstantsUntilBothReach99(): CardioProfileResults {
  return simulateCardio(DEFAULT_BALANCE, { stopWhenAllSkillsReach99: true });
}

export function tuneCardio(): CardioBandReport {
  const unitRates = Object.fromEntries(CARDIO_SIM_SKILLS.map((skill) => [skill.key, UNIT_CARDIO_XP_PER_WORK_MINUTE]));
  const results = simulateCardio(
    { ...DEFAULT_BALANCE, cardioXpPerWorkMinute: unitRates },
    { maxYears: CARDIO_TUNING_YEARS },
  );
  const targetWeeklyXp = xpForLevel(99) / (CARDIO_BANDS.balancedTargetYears * WEEKS_PER_YEAR);
  const rates = Object.fromEntries(
    CARDIO_SIM_SKILLS.map((skill) => {
      const weekly = results.balanced.cumulativeXpByWeek[skill.key];
      const unitWeeklyXp = weekly.at(-1)! / weekly.length;
      return [skill.key, Math.round((UNIT_CARDIO_XP_PER_WORK_MINUTE * targetWeeklyXp) / unitWeeklyXp)];
    }),
  );
  return evaluateCardioBands(results, rates, unitRates);
}
