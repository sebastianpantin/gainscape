import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE, GEAR_SLOTS, type GearLoadout } from '@domain/index.ts';
import {
  BANDS,
  type BandReport,
  CARDIO_BANDS,
  CHALLENGE_BANDS,
  type CardioBandReport,
  type CardioProfileResults,
  evaluateBands,
  evaluateCardioBands,
  evaluateMobilityBands,
  GEAR_BANDS,
  MOBILITY_BANDS,
  type ProfileResults,
} from '../../scripts/balance/bands.ts';
import { simulateCardioProfile } from '../../scripts/balance/cardio-simulate.ts';
import { CARDIO_SIM_SKILLS, MOBILITY_SIM_SKILLS, SIM_SKILLS } from '../../scripts/balance/catalog.ts';
import { CARDIO_PROFILES, MOBILITY_PROFILES, PROFILES } from '../../scripts/balance/profiles.ts';
import {
  ALWAYS_MET_CHALLENGE,
  firstSkillToLevel99,
  simulateProfile,
  WEEKS_PER_YEAR,
} from '../../scripts/balance/simulate.ts';
import {
  simulateCommittedCardioConstantsUntilBothReach99,
  simulateCommittedConstantsUntilLegsReach99,
} from '../../scripts/balance/tune.ts';

const SIMULATION_TIMEOUT_MS = 120_000;

let results: ProfileResults;
let report: BandReport;

beforeAll(() => {
  results = simulateCommittedConstantsUntilLegsReach99();
  report = evaluateBands(results, 'legs', DEFAULT_BALANCE.xpPerEffectiveRep, DEFAULT_BALANCE.xpPerEffectiveRep);
}, SIMULATION_TIMEOUT_MS);

describe('balance bands with the committed constants', () => {
  it('compares the skill the hypertrophy lifter maxes first', () => {
    expect(firstSkillToLevel99(results.hypertrophy)).toBe('legs');
  });

  it('(a) takes a balanced 3x/week lifter 2–3 years to reach 99', () => {
    const [lowest, highest] = BANDS.balancedLifterYears;
    expect(report.years.balanced).toBeGreaterThanOrEqual(lowest);
    expect(report.years.balanced).toBeLessThanOrEqual(highest);
    expect(report.passes.a).toBe(true);
  });

  it('(b) keeps hypertrophy and strength training within 15% of each other', () => {
    expect(report.hypertrophyVsStrengthGap).toBeLessThanOrEqual(BANDS.focusedLifterMaxGap);
  });

  it('(d) slows a casual lifter in proportion to their effort', () => {
    expect(Math.abs(report.casualTimeRatio / report.casualEffortRatio - 1)).toBeLessThanOrEqual(
      BANDS.casualRatioTolerance,
    );
  });

  it('(e) ends the first week of a balanced lifter between legs level 20 and 40', () => {
    const [lowest, highest] = BANDS.balancedWeekOneLevel;
    expect(report.balancedWeekOneLevel).toBeGreaterThanOrEqual(lowest);
    expect(report.balancedWeekOneLevel).toBeLessThanOrEqual(highest);
    expect(report.passes.e).toBe(true);
  });

  it('actually reaches level 99 for every profile within the 40-year horizon', () => {
    for (const result of Object.values(results)) expect(result.weeksToLevel99.legs).not.toBeNull();
  });
});

let cardioResults: CardioProfileResults;
let cardioReport: CardioBandReport;

beforeAll(() => {
  cardioResults = simulateCommittedCardioConstantsUntilBothReach99();
  cardioReport = evaluateCardioBands(
    cardioResults,
    DEFAULT_BALANCE.cardioXpPerWorkMinute,
    DEFAULT_BALANCE.cardioXpPerWorkMinute,
  );
}, SIMULATION_TIMEOUT_MS);

describe('cardio balance bands with the committed constants', () => {
  describe.each(CARDIO_SIM_SKILLS.map((skill) => skill.key))('%s', (skill) => {
    it('(a-c) takes the balanced cardio profile 2–3 years to reach 99', () => {
      const [lowest, highest] = CARDIO_BANDS.balancedYears;
      expect(cardioReport.years[skill]).toBeGreaterThanOrEqual(lowest);
      expect(cardioReport.years[skill]).toBeLessThanOrEqual(highest);
      expect(cardioReport.passes.yearsTo99[skill]).toBe(true);
    });

    it('(e-c) ends the first week of the balanced cardio profile between level 20 and 40', () => {
      const [lowest, highest] = CARDIO_BANDS.balancedWeekOneLevel;
      expect(cardioReport.weekOneLevel[skill]).toBeGreaterThanOrEqual(lowest);
      expect(cardioReport.weekOneLevel[skill]).toBeLessThanOrEqual(highest);
      expect(cardioReport.passes.weekOneLevel[skill]).toBe(true);
    });

    it('actually reaches level 99 within the horizon', () => {
      expect(cardioResults.balanced.weeksToLevel99[skill]).not.toBeNull();
    });
  });

  it('(g) keeps the Agility rate at most 2.5 times the Endurance rate', () => {
    expect(cardioReport.agilityToEnduranceRateRatio).toBeLessThanOrEqual(CARDIO_BANDS.maxAgilityToEnduranceRateRatio);
    expect(cardioReport.passes.g).toBe(true);
  });

  it('(h) pays a 30-minute moderate steady Agility bout no more than one interval session', () => {
    expect(cardioReport.steadyAgilityBoutXp).toBeGreaterThan(0);
    expect(cardioReport.steadyAgilityBoutXp).toBeLessThanOrEqual(cardioReport.intervalSessionAgilityXp);
    expect(cardioReport.passes.h).toBe(true);
  });
});

describe('mobility balance bands with the committed constants', () => {
  const regular = () =>
    simulateCardioProfile(MOBILITY_PROFILES.mobility_regular, DEFAULT_BALANCE, {
      skills: MOBILITY_SIM_SKILLS,
      stopWhenAllSkillsReach99: true,
    });

  it('(m) takes three 20-minute stretching sessions a week about 3 years to reach Mobility 99', () => {
    const report = evaluateMobilityBands(regular());
    const [lowest, highest] = MOBILITY_BANDS.regularYears;
    expect(report.years).toBeGreaterThanOrEqual(lowest);
    expect(report.years).toBeLessThanOrEqual(highest);
    expect(report.passes.years).toBe(true);
  });

  it('(m-e) ends the first week of that routine between Mobility level 20 and 40', () => {
    const report = evaluateMobilityBands(regular());
    const [lowest, highest] = MOBILITY_BANDS.regularWeekOneLevel;
    expect(report.weekOneLevel).toBeGreaterThanOrEqual(lowest);
    expect(report.weekOneLevel).toBeLessThanOrEqual(highest);
    expect(report.passes.weekOneLevel).toBe(true);
  });

  it('gives Mobility no gear bonus', () => {
    const fullAscendant: GearLoadout = Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, 'ascendant']));
    const oneYear = { skills: MOBILITY_SIM_SKILLS, maxYears: 1 };
    const geared = simulateCardioProfile(MOBILITY_PROFILES.mobility_regular, DEFAULT_BALANCE, {
      ...oneYear,
      gearLoadout: fullAscendant,
    });
    const gearless = simulateCardioProfile(MOBILITY_PROFILES.mobility_regular, DEFAULT_BALANCE, oneYear);
    expect(geared.cumulativeXpByWeek.mobility.at(-1)).toBeGreaterThan(0);
    expect(geared.cumulativeXpByWeek.mobility).toEqual(gearless.cumulativeXpByWeek.mobility);
  });
});

describe('gear bonus bands', () => {
  const fullAscendant: GearLoadout = Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, 'ascendant']));
  const ascendantBelt: GearLoadout = { belt: 'ascendant' };
  const oneYear = { maxYears: 1 };
  const xpAfterOneYear = (result: { cumulativeXpByWeek: Record<string, number[]> }, skill: string) =>
    result.cumulativeXpByWeek[skill][WEEKS_PER_YEAR - 1];
  const gearRatios = (
    geared: { cumulativeXpByWeek: Record<string, number[]> },
    gearless: { cumulativeXpByWeek: Record<string, number[]> },
    skills: readonly string[],
  ) =>
    Object.fromEntries(
      skills
        .filter((skill) => xpAfterOneYear(gearless, skill) > 0)
        .map((skill) => [skill, xpAfterOneYear(geared, skill) / xpAfterOneYear(gearless, skill)]),
    );
  const expectWithin = (ratios: Record<string, number>, [lowest, highest]: readonly [number, number]) => {
    expect(Object.keys(ratios).length).toBeGreaterThan(0);
    for (const [skill, ratio] of Object.entries(ratios)) {
      expect(ratio, skill).toBeGreaterThanOrEqual(lowest);
      expect(ratio, skill).toBeLessThanOrEqual(highest);
    }
  };

  it('gives a balanced lifter in full Ascendant about 10% more XP on every trained lift skill after a year', () => {
    const gearless = simulateProfile(PROFILES.balanced, DEFAULT_BALANCE, oneYear);
    const geared = simulateProfile(PROFILES.balanced, DEFAULT_BALANCE, { ...oneYear, gearLoadout: fullAscendant });
    const ratios = gearRatios(
      geared,
      gearless,
      SIM_SKILLS.map((skill) => skill.key),
    );
    expect(Object.keys(ratios)).toEqual(SIM_SKILLS.map((skill) => skill.key));
    expectWithin(ratios, GEAR_BANDS.fullAscendantXpRatio);
  });

  it('gives the balanced cardio profile in full Ascendant about 10% more Endurance and Agility after a year', () => {
    const gearless = simulateCardioProfile(CARDIO_PROFILES.cardio_balanced, DEFAULT_BALANCE, oneYear);
    const geared = simulateCardioProfile(CARDIO_PROFILES.cardio_balanced, DEFAULT_BALANCE, {
      ...oneYear,
      gearLoadout: fullAscendant,
    });
    const ratios = gearRatios(
      geared,
      gearless,
      CARDIO_SIM_SKILLS.map((skill) => skill.key),
    );
    expect(Object.keys(ratios)).toEqual(CARDIO_SIM_SKILLS.map((skill) => skill.key));
    expectWithin(ratios, GEAR_BANDS.fullAscendantXpRatio);
  });

  it('boosts core but leaves chest untouched with only an Ascendant belt', () => {
    const gearless = simulateProfile(PROFILES.balanced, DEFAULT_BALANCE, oneYear);
    const geared = simulateProfile(PROFILES.balanced, DEFAULT_BALANCE, { ...oneYear, gearLoadout: ascendantBelt });
    expectWithin(gearRatios(geared, gearless, ['core']), GEAR_BANDS.beltOnlyCoreRatio);
    expect(xpAfterOneYear(geared, 'chest')).toBe(xpAfterOneYear(gearless, 'chest'));
  });

  describe('with a challenge passed every session', () => {
    const liftSkills = SIM_SKILLS.map((skill) => skill.key);
    const plain = () => simulateProfile(PROFILES.balanced, DEFAULT_BALANCE, oneYear);

    it('gives a balanced lifter about 25% more XP on every trained lift skill after a year', () => {
      const challenged = simulateProfile(PROFILES.balanced, DEFAULT_BALANCE, {
        ...oneYear,
        challenge: ALWAYS_MET_CHALLENGE,
      });
      const ratios = gearRatios(challenged, plain(), liftSkills);
      expect(Object.keys(ratios)).toEqual(liftSkills);
      expectWithin(ratios, CHALLENGE_BANDS.everySessionXpRatio);
    });

    it('adds the challenge and full Ascendant bonuses for about 35% more XP', () => {
      const boosted = simulateProfile(PROFILES.balanced, DEFAULT_BALANCE, {
        ...oneYear,
        challenge: ALWAYS_MET_CHALLENGE,
        gearLoadout: fullAscendant,
      });
      const ratios = gearRatios(boosted, plain(), liftSkills);
      expect(Object.keys(ratios)).toEqual(liftSkills);
      expectWithin(ratios, CHALLENGE_BANDS.withFullAscendantRatio);
    });
  });
});
