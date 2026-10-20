import { describe, expect, it } from 'vitest';
import {
  type BalanceConfig,
  boutDurationSeconds,
  CARDIO_BOUNDS,
  CARDIO_EFFORT_LEVELS,
  countedWorkSeconds,
  DEFAULT_BALANCE,
  effortInputFromStored,
  intervalDurationSeconds,
  isPaceImplausible,
  KindMismatchError,
  paceBonus,
  processSession,
  resolveEffort,
  type SessionInput,
  type SetInput,
  speedRatio,
} from '@domain/index.ts';
import { aBout, aSet, catalog, freshUser, hard, RUN_REFERENCE_PACE_S_PER_KM, TEST_BALANCE } from './fixtures.ts';

const CARDIO_BALANCE: BalanceConfig = Object.freeze({
  ...TEST_BALANCE,
  cardioXpPerWorkMinute: Object.freeze({ endurance: 100, agility: 200, mobility: 50 }),
});

const moderate = { type: 'cardio', level: 'moderate' } as const;
const hardBout = { type: 'cardio', level: 'hard' } as const;
const THIRTY_MINUTES_S = 1800;

function distanceAtSpeedRatio(ratio: number, durationS: number): number {
  return (ratio * durationS * 1000) / RUN_REFERENCE_PACE_S_PER_KM;
}

function run(sets: SetInput[], cfg: BalanceConfig = CARDIO_BALANCE) {
  const session: SessionInput = { id: 'cardio-session', startedAt: '2026-09-28T10:00:00.000Z', sets };
  return processSession(freshUser, session, cfg, { catalog }).outputs;
}

describe('walking pace', () => {
  it('earns no more XP for a 6:00/km bout than the same bout logged as running', () => {
    const distanceM = (THIRTY_MINUTES_S * 1000) / 360;
    const asWalk = run([aBout('walk', THIRTY_MINUTES_S, moderate, { distanceM })]);
    const asRun = run([aBout('run', THIRTY_MINUTES_S, moderate, { distanceM })]);
    expect(asWalk.sets[0].cardio?.paceBonus).toBe(1);
    expect(asWalk.sets[0].xp).toBeLessThanOrEqual(asRun.sets[0].xp);
  });
});

describe('cardio effort', () => {
  it('resolves a logged cardio level to its stored value', () => {
    expect(resolveEffort({ type: 'cardio', level: 'hard' }, DEFAULT_BALANCE, 'cardio')).toEqual({
      effortInputType: 'cardio',
      effortValue: 3,
      loggedRir: null,
    });
  });

  it('round-trips every cardio level through its stored value', () => {
    for (const level of CARDIO_EFFORT_LEVELS) {
      const { effortInputType, effortValue } = resolveEffort({ type: 'cardio', level }, DEFAULT_BALANCE, 'cardio');
      expect(effortInputFromStored(effortInputType, effortValue, DEFAULT_BALANCE)).toEqual({ type: 'cardio', level });
    }
    expect(effortInputFromStored('cardio', 3, DEFAULT_BALANCE)).toEqual({ type: 'cardio', level: 'hard' });
  });

  it('rejects a stored cardio value outside 1 to 4', () => {
    expect(() => effortInputFromStored('cardio', 5, DEFAULT_BALANCE)).toThrow(RangeError);
  });

  it('throws when a lift set carries a cardio effort', () => {
    expect(() => resolveEffort({ type: 'cardio', level: 'easy' }, DEFAULT_BALANCE, 'lift')).toThrow(RangeError);
  });

  it('throws when a cardio bout carries a lift effort', () => {
    expect(() => resolveEffort(hard, DEFAULT_BALANCE, 'cardio')).toThrow(RangeError);
    expect(() => resolveEffort({ type: 'rir', value: 2 }, DEFAULT_BALANCE, 'cardio')).toThrow(RangeError);
    expect(() => resolveEffort({ type: 'rpe', value: 8 }, DEFAULT_BALANCE, 'cardio')).toThrow(RangeError);
  });

  it('accepts a missing effort on either kind', () => {
    const missing = { effortInputType: null, effortValue: null, loggedRir: null };
    expect(resolveEffort(null, DEFAULT_BALANCE, 'cardio')).toEqual(missing);
    expect(resolveEffort(null, DEFAULT_BALANCE, 'lift')).toEqual(missing);
  });

  it('derives a missing cardio effort as moderate with a default source', () => {
    const [result] = run([aBout('run', 1800, null)]).sets;
    expect(result).toMatchObject({ effortInputType: null, effortValue: null, rirSource: 'default', rir: null });
    expect(result.cardio?.effort).toBe('moderate');
  });

  it('clamps a logged effort to the activity maximum at derive time and keeps the stored input', () => {
    const [result] = run([aBout('walk', 1800, { type: 'cardio', level: 'hard' })]).sets;
    expect(result).toMatchObject({ effortInputType: 'cardio', effortValue: 3, rirSource: 'logged' });
    expect(result.cardio?.effort).toBe('moderate');
  });

  it('rejects mismatched efforts inside a session', () => {
    expect(() => run([aSet('bench', 60, 8, { type: 'cardio', level: 'hard' })])).toThrow(RangeError);
    expect(() => run([aBout('run', 1800, hard)])).toThrow(RangeError);
  });

  it('rejects a bout on a lift exercise and a lift set on a cardio exercise', () => {
    expect(() => run([aBout('bench', 1800, null)])).toThrow(KindMismatchError);
    expect(() => run([aSet('run', 60, 8, hard)])).toThrow(KindMismatchError);
  });

  it('leaves lift results without a cardio part', () => {
    const [result] = run([aSet('bench', 60, 8, hard)]).sets;
    expect(result.cardio).toBeNull();
  });
});

describe('countedWorkSeconds', () => {
  it('counts the duration of a steady bout', () => {
    expect(countedWorkSeconds({ durationS: 1800, interval: null })).toBe(1800);
  });

  it('counts only the work of an interval bout', () => {
    const interval = { workS: 60, restS: 60, rounds: 10 };
    expect(countedWorkSeconds({ durationS: intervalDurationSeconds(interval), interval })).toBe(600);
  });
});

describe('intervalDurationSeconds', () => {
  it('adds the rest between rounds but not after the last one', () => {
    expect(intervalDurationSeconds({ workS: 60, restS: 60, rounds: 10 })).toBe(1140);
    expect(intervalDurationSeconds({ workS: 5, restS: 0, rounds: 1 })).toBe(5);
  });
});

describe('boutDurationSeconds', () => {
  it('uses the logged duration of a steady bout and the full interval span otherwise', () => {
    expect(boutDurationSeconds({ durationS: 1800, interval: null })).toBe(1800);
    expect(boutDurationSeconds({ durationS: 1800, interval: { workS: 60, restS: 60, rounds: 10 } })).toBe(1140);
  });
});

describe('CARDIO_BOUNDS', () => {
  it('matches the logging limits of steady and interval bouts', () => {
    expect(CARDIO_BOUNDS).toEqual({
      steadyDurationS: { min: 60, max: 14_400 },
      intervalDurationS: { min: 5, max: 14_400 },
      intervalRounds: { min: 1, max: 100 },
      intervalWorkS: { min: 5, max: 3600 },
      intervalRestS: { min: 0, max: 3600 },
      distanceM: { min: 1, max: 200_000 },
    });
  });
});

describe('paceBonus', () => {
  it('rises linearly from the reference pace to the full bonus', () => {
    expect(paceBonus(1, DEFAULT_BALANCE)).toBe(1);
    expect(paceBonus(1.2, DEFAULT_BALANCE)).toBe(1.2);
    expect(paceBonus(1.3, DEFAULT_BALANCE)).toBe(1.3);
    expect(paceBonus(2, DEFAULT_BALANCE)).toBe(1.3);
  });

  it('gives no bonus below the reference pace', () => {
    expect(paceBonus(0.8, DEFAULT_BALANCE)).toBe(1);
  });

  it('flags only speed ratios above the implausible limit', () => {
    expect(isPaceImplausible(2.5, DEFAULT_BALANCE)).toBe(false);
    expect(isPaceImplausible(2.51, DEFAULT_BALANCE)).toBe(true);
  });

  it('measures speed against the reference pace', () => {
    expect(speedRatio(360, 6000, 1800)).toBeCloseTo(1.2, 9);
  });
});

describe('cardio XP', () => {
  it('awards a moderate steady bout at reference pace its minutes times the Endurance rate', () => {
    const distanceM = distanceAtSpeedRatio(1, THIRTY_MINUTES_S);
    const outputs = run([aBout('run', THIRTY_MINUTES_S, moderate, { distanceM })]);
    const expected = Math.round(30 * CARDIO_BALANCE.cardioXpPerWorkMinute.endurance);
    expect(outputs.sets[0].skillXp).toEqual([{ skillId: 'skill-endurance', xp: expected }]);
    expect(outputs.sets[0].xp).toBe(expected);
    expect(outputs.xpBySkill).toEqual({ endurance: expected });
  });

  it('applies the Agility steady factor to a steady bout on an Agility activity', () => {
    const outputs = run([aBout('sprints', THIRTY_MINUTES_S, moderate)]);
    const expected = Math.round(
      30 * CARDIO_BALANCE.cardioXpPerWorkMinute.agility * CARDIO_BALANCE.cardioSteadyFactor.agility,
    );
    expect(outputs.xpBySkill).toEqual({ agility: expected });
  });

  it('counts only interval work and gives intervals no pace bonus, even with a distance', () => {
    const interval = { workS: 60, restS: 60, rounds: 10 };
    const outputs = run([aBout('run', intervalDurationSeconds(interval), moderate, { interval, distanceM: 10_000 })]);
    expect(outputs.sets[0].cardio).toMatchObject({ countedWorkS: 600, paceBonus: 1, paceFlagged: false });
    expect(outputs.xpBySkill).toEqual({ endurance: 10 * CARDIO_BALANCE.cardioXpPerWorkMinute.endurance });
  });

  it('scales by the effort factor without the steady factor for intervals', () => {
    const interval = { workS: 30, restS: 30, rounds: 30 };
    const outputs = run([aBout('sprints', intervalDurationSeconds(interval), hardBout, { interval })]);
    expect(outputs.xpBySkill).toEqual({
      agility: Math.round(15 * CARDIO_BALANCE.cardioXpPerWorkMinute.agility * CARDIO_BALANCE.cardioEffortFactor.hard),
    });
  });

  it('pays a pace bonus of 1.2 for a steady bout 20% faster than the reference pace', () => {
    const distanceM = distanceAtSpeedRatio(1.2, THIRTY_MINUTES_S);
    const outputs = run([aBout('run', THIRTY_MINUTES_S, moderate, { distanceM })]);
    expect(outputs.sets[0].cardio).toMatchObject({ paceBonus: 1.2, paceFlagged: false });
    expect(outputs.xpBySkill).toEqual({ endurance: Math.round(30 * 100 * 1.2) });
  });

  it('caps the pace bonus at speed ratio 1.3 and above', () => {
    const distanceM = distanceAtSpeedRatio(1.6, THIRTY_MINUTES_S);
    const outputs = run([aBout('run', THIRTY_MINUTES_S, moderate, { distanceM })]);
    expect(outputs.sets[0].cardio).toMatchObject({ paceBonus: 1.3, paceFlagged: false });
  });

  it('flags an implausible pace, pays no bonus and still pays the duration', () => {
    const distanceM = distanceAtSpeedRatio(3, THIRTY_MINUTES_S);
    const outputs = run([aBout('run', THIRTY_MINUTES_S, moderate, { distanceM })]);
    expect(outputs.sets[0].cardio).toMatchObject({ paceBonus: 1, paceFlagged: true });
    expect(outputs.xpBySkill).toEqual({ endurance: 3000 });
  });

  it('gives a custom exercise no pace bonus', () => {
    const distanceM = distanceAtSpeedRatio(1.2, THIRTY_MINUTES_S);
    const outputs = run([aBout('custom-run', THIRTY_MINUTES_S, moderate, { distanceM })]);
    expect(outputs.sets[0].cardio).toMatchObject({ paceBonus: 1, paceFlagged: false });
    expect(outputs.xpBySkill).toEqual({ endurance: 3000 });
  });

  it('gives a steady bout without a distance no pace bonus', () => {
    const outputs = run([aBout('run', THIRTY_MINUTES_S, moderate)]);
    expect(outputs.sets[0].cardio).toMatchObject({ paceBonus: 1, paceFlagged: false });
  });

  it('splits a bout across skills with each skill at its own rate', () => {
    const outputs = run([aBout('row-intervals', THIRTY_MINUTES_S, moderate)]);
    expect(outputs.sets[0].skillXp).toEqual([
      { skillId: 'skill-endurance', xp: 1500 },
      { skillId: 'skill-agility', xp: 1500 },
    ]);
  });

  it('pays no XP for counted minutes beyond the session cap and keeps earlier bouts whole', () => {
    const outputs = run([
      aBout('run', 7200, moderate),
      aSet('bench', 60, 8, hard),
      aBout('run', 5400, moderate),
      aBout('run', 1800, moderate),
    ]);
    const bouts = outputs.sets.filter((result) => result.cardio !== null);
    expect(bouts.map((result) => result.cardio?.xpCountedWorkS)).toEqual([7200, 3600, 0]);
    expect(bouts.map((result) => result.cardio!.countedWorkS - result.cardio!.xpCountedWorkS)).toEqual([0, 1800, 1800]);
    expect(bouts.map((result) => result.cardio?.countedWorkS)).toEqual([7200, 5400, 1800]);
    expect(bouts.map((result) => result.xp)).toEqual([12_000, 6000, 0]);
  });

  it('earns Mobility XP at its own rate per counted minute, capped by the activity effort', () => {
    const stretch = run([aBout('stretch', THIRTY_MINUTES_S, hardBout)]);
    expect(stretch.sets[0].cardio?.effort).toBe('moderate');
    expect(stretch.xpBySkill).toEqual({ mobility: 1500 });
    const yoga = run([aBout('yoga', THIRTY_MINUTES_S, { type: 'cardio', level: 'max' })]);
    expect(yoga.sets[0].cardio?.effort).toBe('hard');
    expect(yoga.xpBySkill).toEqual({ mobility: 1800 });
  });

  it('caps Mobility minutes in their own pool, apart from the cardio cap', () => {
    const outputs = run([
      aBout('stretch', 2400, moderate),
      aBout('run', 10_800, moderate),
      aBout('yoga', 2400, moderate),
      aBout('run', 600, moderate),
    ]);
    expect(DEFAULT_BALANCE.mobilityMaxCountedMinutesPerSession).toBe(60);
    expect(outputs.sets.map((result) => result.cardio?.xpCountedWorkS)).toEqual([2400, 10_800, 1200, 0]);
    expect(outputs.sets.map((result) => result.cardio!.countedWorkS - result.cardio!.xpCountedWorkS)).toEqual([
      0, 0, 1200, 600,
    ]);
    expect(outputs.xpBySkill).toEqual({ endurance: 18_000, mobility: 3000 });
  });

  it('caps by position order, not by the order the bouts were listed', () => {
    const late = aBout('run', 7200, moderate, { position: 50 });
    const early = aBout('run', 7200, moderate, { position: 10 });
    const outputs = run([late, early]);
    expect(outputs.sets.map((result) => [result.set.id, result.cardio?.xpCountedWorkS])).toEqual([
      [early.id, 7200],
      [late.id, 3600],
    ]);
  });

  it('builds no lifting state for a bout', () => {
    const [result] = run([aBout('run', THIRTY_MINUTES_S, hardBout)]).sets;
    expect(result).toMatchObject({
      rirForXp: null,
      rirFlagged: false,
      intensityBonus: 1,
      coldStartXp: 0,
      e1rmCandidateKg: null,
      repsCapacityCandidate: null,
      effectiveLoadKg: 0,
      effectiveReps: 0,
      personalRecord: null,
    });
  });
});
