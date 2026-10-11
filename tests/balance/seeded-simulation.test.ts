import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '@domain/index.ts';
import {
  intervalSessionAgilityXp,
  simulateCardioProfile,
  steadyAgilityBoutXp,
} from '../../scripts/balance/cardio-simulate.ts';
import { CARDIO_PROFILES, PROFILES } from '../../scripts/balance/profiles.ts';
import { seededRandom } from '../../scripts/balance/random.ts';
import { simulateProfile } from '../../scripts/balance/simulate.ts';

const LIFT_SKILLS_BUT_LEGS = { chest: null, back: null, shoulders: null, arms: null, core: null, grip: null };

describe('seededRandom', () => {
  it('replays the same sequence for a seed', () => {
    const random = seededRandom(42);
    expect([random.next(), random.next(), random.next()]).toEqual([
      0.6011037519201636, 0.44829055899754167, 0.8524657934904099,
    ]);
    expect([random.integerBetween(1, 6), random.integerBetween(1, 6), random.integerBetween(-1, 1)]).toEqual([5, 2, 0]);
  });

  it('draws integers within both bounds and reaches each end', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: 0, max: 5 }),
        (seed, low, span) => {
          const random = seededRandom(seed);
          const draws = Array.from({ length: 400 }, () => random.integerBetween(low, low + span));
          expect(draws.every((value) => Number.isInteger(value) && value >= low && value <= low + span)).toBe(true);
          expect(draws).toContain(low);
          expect(draws).toContain(low + span);
        },
      ),
    );
  });
});

describe('seeded simulation with the committed constants', () => {
  it.each([
    ['hypertrophy', 51, [17737, 39243, 60327], 117.8921568627451],
    ['strength', 51, [19722, 41565, 62454], 93.56862745098037],
    ['balanced', 131, [8335, 15791, 22405], 42.76335877862606],
    ['casual', 249, [3340, 7516, 11493], 24.296787148594476],
  ] as const)('replays the %s lifter exactly', (name, weeks, firstWeeksLegsXp, weeklyLegsEffectiveReps) => {
    const result = simulateProfile(PROFILES[name], DEFAULT_BALANCE, { stopWhenSkillsReach99: ['legs'] });
    expect(result.weeksSimulated).toBe(weeks);
    expect(result.weeksToLevel99).toEqual({ ...LIFT_SKILLS_BUT_LEGS, legs: weeks });
    expect(result.cumulativeXpByWeek.legs.slice(0, 3)).toEqual(firstWeeksLegsXp);
    expect(result.averageWeeklyEffectiveRepsBySkill.legs).toBe(weeklyLegsEffectiveReps);
  });

  it('replays the balanced cardio athlete exactly', () => {
    const profile = CARDIO_PROFILES.cardio_balanced;
    const result = simulateCardioProfile(profile, DEFAULT_BALANCE, { stopWhenAllSkillsReach99: true });
    expect(result.weeksSimulated).toBe(131);
    expect(result.weeksToLevel99).toEqual({ endurance: 131, agility: 131 });
    expect(result.cumulativeXpByWeek.agility.slice(0, 3)).toEqual([7668, 15336, 23004]);
    expect(result.cumulativeXpByWeek.endurance.slice(0, 3)).toEqual([7598, 15355, 22925]);
    expect(steadyAgilityBoutXp(profile, DEFAULT_BALANCE)).toBe(3195);
    expect(intervalSessionAgilityXp(profile, DEFAULT_BALANCE)).toBe(3834);
  });
});
