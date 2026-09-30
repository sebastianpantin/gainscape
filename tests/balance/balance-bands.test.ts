import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '@domain/index.ts';
import { BANDS, type BandReport, evaluateBands, type ProfileResults } from '../../scripts/balance/bands.ts';
import { firstSkillToLevel99 } from '../../scripts/balance/simulate.ts';
import { simulateCommittedConstantsUntilLegsReach99 } from '../../scripts/balance/tune.ts';

const SIMULATION_TIMEOUT_MS = 120_000;

let results: ProfileResults;
let report: BandReport;

beforeAll(() => {
  results = simulateCommittedConstantsUntilLegsReach99();
  report = evaluateBands(results, 'legs', DEFAULT_BALANCE.xpPerEffectiveRep, DEFAULT_BALANCE.xpPerEffectiveRep);
  console.log(
    'balance report',
    JSON.stringify(report.years),
    `gap ${(report.hypertrophyVsStrengthGap * 100).toFixed(1)}%`,
  );
}, SIMULATION_TIMEOUT_MS);

describe('balance bands with the committed constants', () => {
  it('compares the skill the hypertrophy lifter maxes first', () => {
    expect(firstSkillToLevel99(results.hypertrophy)).toBe('legs');
  });

  it('(a) takes a focused 4x/week lifter 5–7 years to reach 99', () => {
    const [lowest, highest] = BANDS.focusedLifterYears;
    for (const years of [report.years.hypertrophy, report.years.strength]) {
      expect(years).toBeGreaterThanOrEqual(lowest);
      expect(years).toBeLessThanOrEqual(highest);
    }
  });

  it('(b) keeps hypertrophy and strength training within 15% of each other', () => {
    expect(report.hypertrophyVsStrengthGap).toBeLessThanOrEqual(BANDS.focusedLifterMaxGap);
  });

  it('(d) slows a casual lifter in proportion to their effort', () => {
    expect(Math.abs(report.casualTimeRatio / report.casualEffortRatio - 1)).toBeLessThanOrEqual(
      BANDS.casualRatioTolerance,
    );
  });

  it('actually reaches level 99 for every profile within the 40-year horizon', () => {
    for (const result of Object.values(results)) expect(result.weeksToLevel99.legs).not.toBeNull();
  });
});
