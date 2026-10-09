import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_LOAD_STEP_KG,
  challengeBonusXp,
  type ChallengeDefinition,
  challengeE1rmSnapshot,
  challengeLoadExerciseIds,
  challengeRunFromStored,
  challengeTargetLoadsKg,
  DEFAULT_BALANCE,
  e1rmAtSessionStart,
  type E1rmSnapshot,
  judgeChallenge,
  type LiftSetResult,
  loadTargetKg,
  meetsLoadTarget,
  type SetResult,
  type StrengthState,
} from '@domain/index.ts';

const BODYWEIGHT_KG = 80;

const deadliftAndPullUp: ChallengeDefinition = {
  kind: 'prescription',
  groups: [
    {
      rounds: 5,
      exercises: [
        { exerciseId: 'deadlift', reps: 5, pct: 70 },
        { exerciseId: 'pull-up', reps: 5, pct: null },
      ],
    },
  ],
};

const squatCentury: ChallengeDefinition = {
  kind: 'volume',
  metric: 'reps',
  target: 100,
  exerciseId: 'squat',
  minPct: 50,
};

const tenTonDay: ChallengeDefinition = { kind: 'volume', metric: 'kg', target: 10000, exerciseId: null, minPct: null };

let position = 0;

function liftResult(
  exerciseId: string,
  effectiveLoadKg: number,
  reps: number,
  isWarmup = false,
  weightKg = effectiveLoadKg,
): LiftSetResult {
  position += 1;
  return {
    set: { id: `set-${position}`, exerciseId, position, weightKg, reps, isWarmup, effort: null },
    effortInputType: null,
    effortValue: null,
    rir: null,
    rirSource: 'cold_start',
    rirForXp: null,
    rirFlagged: false,
    intensityBonus: 1,
    coldStartXp: 0,
    e1rmBeforeKg: null,
    repsCapacityBefore: null,
    e1rmCandidateKg: null,
    repsCapacityCandidate: null,
    effectiveLoadKg,
    personalRecord: null,
    effectiveReps: 0,
    xp: 0,
    skillXp: [],
    cardio: null,
  };
}

const times = <T>(count: number, make: () => T): T[] => Array.from({ length: count }, make);

const deadliftRounds = (loadKg: number, reps = 5) => times(5, () => liftResult('deadlift', loadKg, reps));
const pullUpRounds = (reps = 5) => times(5, () => liftResult('pull-up', BODYWEIGHT_KG, reps, false, 0));
const weightedPullUp = (addedKg: number, reps: number) =>
  liftResult('weighted-pull-up', BODYWEIGHT_KG + addedKg, reps, false, addedKg);

const deadliftE1rm: E1rmSnapshot = { deadlift: 140 };
const squatE1rm: E1rmSnapshot = { squat: 100 };

const passed = (challenge: ChallengeDefinition, sets: readonly SetResult[], snapshot: E1rmSnapshot) =>
  judgeChallenge(challenge, sets, snapshot).passed;

describe('loadTargetKg and the judge floor', () => {
  it('takes 70% of a 140 kg e1RM as 98 kg and floors the judge at 97.5 kg', () => {
    expect(loadTargetKg(70, 140)).toBe(98);
    expect(meetsLoadTarget(97.5, loadTargetKg(70, 140))).toBe(true);
    expect(meetsLoadTarget(97.4, loadTargetKg(70, 140))).toBe(false);
    expect(CHALLENGE_LOAD_STEP_KG).toBe(2.5);
  });

  it('has no target without a percent or an e1RM, and any load meets no target', () => {
    expect(loadTargetKg(null, 140)).toBeNull();
    expect(loadTargetKg(70, null)).toBeNull();
    expect(meetsLoadTarget(0, null)).toBe(true);
  });
});

describe('judgeChallenge prescription (Deadlift and Pull-up)', () => {
  it('passes 5 rounds of 5 deadlifts at 97.5 kg and 5 pull-ups', () => {
    expect(passed(deadliftAndPullUp, [...deadliftRounds(97.5), ...pullUpRounds()], deadliftE1rm)).toBe(true);
  });

  it('fails when one deadlift set is at 95 kg', () => {
    const sets = [...deadliftRounds(97.5).slice(1), liftResult('deadlift', 95, 5), ...pullUpRounds()];
    expect(passed(deadliftAndPullUp, sets, deadliftE1rm)).toBe(false);
  });

  it('fails when one deadlift set has 4 reps', () => {
    const sets = [...deadliftRounds(97.5).slice(1), liftResult('deadlift', 97.5, 4), ...pullUpRounds()];
    expect(passed(deadliftAndPullUp, sets, deadliftE1rm)).toBe(false);
  });

  it('fails when one round has 4 pull-ups', () => {
    const sets = [...deadliftRounds(97.5), ...pullUpRounds().slice(1), liftResult('pull-up', BODYWEIGHT_KG, 4)];
    expect(passed(deadliftAndPullUp, sets, deadliftE1rm)).toBe(false);
  });

  it('fails a percent target without an e1RM, whatever the load', () => {
    expect(passed(deadliftAndPullUp, [...deadliftRounds(200), ...pullUpRounds()], {})).toBe(false);
    expect(passed(deadliftAndPullUp, [...deadliftRounds(200), ...pullUpRounds()], { deadlift: null })).toBe(false);
  });

  it('passes when the sets are not alternated', () => {
    const interleaved = deadliftRounds(97.5).flatMap((deadlift, round) => [deadlift, pullUpRounds()[round]]);
    const deadliftsFirst = [...interleaved].sort((a, b) =>
      a.set.exerciseId === b.set.exerciseId
        ? a.set.position - b.set.position
        : a.set.exerciseId === 'deadlift'
          ? -1
          : 1,
    );
    expect(passed(deadliftAndPullUp, deadliftsFirst, deadliftE1rm)).toBe(true);
  });

  it('never counts a warm-up set', () => {
    const sets = [...deadliftRounds(97.5).slice(1), liftResult('deadlift', 97.5, 5, true), ...pullUpRounds()];
    expect(passed(deadliftAndPullUp, sets, deadliftE1rm)).toBe(false);
  });
});

describe('judgeChallenge volume', () => {
  it('passes Squat Century with 10 × 10 at the 50 kg floor', () => {
    expect(
      passed(
        squatCentury,
        times(10, () => liftResult('squat', 50, 10)),
        squatE1rm,
      ),
    ).toBe(true);
  });

  it('counts only reps at the floor, so 9 × 10 at 50 kg and 1 × 10 at 45 kg fails with 90 reps', () => {
    const sets = [...times(9, () => liftResult('squat', 50, 10)), liftResult('squat', 45, 10)];
    expect(passed(squatCentury, sets, squatE1rm)).toBe(false);
  });

  it('counts no squat reps without an e1RM, whatever the load', () => {
    expect(
      passed(
        squatCentury,
        times(10, () => liftResult('squat', 200, 10)),
        {},
      ),
    ).toBe(false);
  });

  it('never counts warm-up reps', () => {
    const sets = [...times(9, () => liftResult('squat', 50, 10)), liftResult('squat', 50, 10, true)];
    expect(passed(squatCentury, sets, squatE1rm)).toBe(false);
  });

  it('counts only the named exercise', () => {
    const sets = [...times(9, () => liftResult('squat', 50, 10)), liftResult('deadlift', 200, 10)];
    expect(passed(squatCentury, sets, squatE1rm)).toBe(false);
  });

  it('passes Ten-Ton Day at 10,000 kg and fails at 9,900 kg', () => {
    const fourBlocks = times(20, () => liftResult('squat', 100, 5));
    expect(passed(tenTonDay, fourBlocks, {})).toBe(true);
    expect(passed(tenTonDay, [...fourBlocks.slice(1), liftResult('squat', 100, 4)], {})).toBe(false);
  });

  it('adds the volume of every lift but never warm-ups', () => {
    const mixed = [...times(10, () => liftResult('squat', 100, 5)), ...times(10, () => liftResult('bench', 100, 5))];
    expect(passed(tenTonDay, mixed, {})).toBe(true);
    expect(passed(tenTonDay, [...mixed.slice(1), liftResult('squat', 100, 5, true)], {})).toBe(false);
  });

  it('counts no bodyweight toward kg volume, only the load added to a bodyweight lift', () => {
    const squats = times(18, () => liftResult('squat', 100, 5));
    const bodyweightOnly = times(100, () => liftResult('pull-up', BODYWEIGHT_KG, 10, false, 0));
    expect(passed(tenTonDay, [...squats, ...bodyweightOnly], {})).toBe(false);
    expect(passed(tenTonDay, [...squats, ...times(9, () => weightedPullUp(20, 5))], {})).toBe(false);
    expect(passed(tenTonDay, [...squats, ...times(10, () => weightedPullUp(20, 5))], {})).toBe(true);
  });
});

describe('judgeChallenge properties', () => {
  const exerciseIds = ['deadlift', 'pull-up', 'squat', 'bench'] as const;
  const setArb = fc.record({
    exerciseId: fc.constantFrom(...exerciseIds),
    loadSteps: fc.integer({ min: 0, max: 60 }),
    reps: fc.integer({ min: 1, max: 12 }),
    isWarmup: fc.boolean(),
  });
  const challengeArb = fc.constantFrom(deadliftAndPullUp, squatCentury, tenTonDay, {
    ...tenTonDay,
    target: 2000,
  } satisfies ChallengeDefinition);
  const snapshotArb = fc.record({
    deadlift: fc.option(fc.integer({ min: 60, max: 250 }), { nil: null }),
    squat: fc.option(fc.integer({ min: 60, max: 250 }), { nil: null }),
  });
  const toResults = (drafts: readonly { exerciseId: string; loadSteps: number; reps: number; isWarmup: boolean }[]) =>
    drafts.map((draft) => liftResult(draft.exerciseId, draft.loadSteps * 2.5, draft.reps, draft.isWarmup));
  const passingBaseline = () => [...deadliftRounds(97.5), ...pullUpRounds()];

  it('never turns a pass into a fail with more reps or more load', () => {
    fc.assert(
      fc.property(
        challengeArb,
        fc.array(setArb, { maxLength: 40 }),
        fc.array(fc.record({ reps: fc.nat(5), loadSteps: fc.nat(8) }), { minLength: 50, maxLength: 50 }),
        snapshotArb,
        (challenge, drafts, boosts, snapshot) => {
          const sets = [...passingBaseline(), ...toResults(drafts)];
          const boosted = sets.map((result, index) => ({
            ...result,
            set: { ...result.set, reps: result.set.reps + boosts[index % boosts.length].reps },
            effectiveLoadKg: result.effectiveLoadKg + boosts[index % boosts.length].loadSteps * 2.5,
          }));
          if (passed(challenge, sets, snapshot)) expect(passed(challenge, boosted, snapshot)).toBe(true);
        },
      ),
    );
  });

  it('keeps a prescription verdict when sets of another exercise are added', () => {
    fc.assert(
      fc.property(
        fc.array(setArb, { maxLength: 30 }),
        fc.array(
          setArb.map((draft) => ({ ...draft, exerciseId: 'bench' })),
          { maxLength: 10 },
        ),
        fc.boolean(),
        snapshotArb,
        (drafts, extra, withBaseline, snapshot) => {
          const sets = [...(withBaseline ? passingBaseline() : []), ...toResults(drafts)];
          expect(passed(deadliftAndPullUp, [...sets, ...toResults(extra)], snapshot)).toBe(
            passed(deadliftAndPullUp, sets, snapshot),
          );
        },
      ),
    );
  });

  it('gives deep-equal verdicts on two runs and ignores set order', () => {
    fc.assert(
      fc.property(
        challengeArb,
        fc.array(setArb, { maxLength: 40 }),
        fc.boolean(),
        snapshotArb,
        fc.integer(),
        (challenge, drafts, withBaseline, snapshot, seed) => {
          const sets = [...(withBaseline ? passingBaseline() : []), ...toResults(drafts)];
          const verdict = judgeChallenge(challenge, sets, snapshot);
          expect(judgeChallenge(challenge, sets, snapshot)).toEqual(verdict);
          const shuffled = sets
            .map((result, index) => ({ result, key: Math.imul(index + 1, seed | 1) >>> 0 }))
            .sort((a, b) => a.key - b.key)
            .map(({ result }, index) => ({ ...result, set: { ...result.set, position: index } }));
          expect(judgeChallenge(challenge, shuffled, snapshot)).toEqual(verdict);
        },
      ),
    );
  });
});

describe('challengeBonusXp', () => {
  it.each([
    [1000, 250],
    [55, 14],
    [2, 1],
    [1, 0],
    [0, 0],
  ])('pays %i base XP a %i XP bonus', (baseXp, expected) => {
    expect(challengeBonusXp(baseXp, DEFAULT_BALANCE)).toBe(expected);
  });

  it('keeps the challenge percent at 25', () => {
    expect(DEFAULT_BALANCE.challengeBonusPercent).toBe(25);
  });

  it.each([12.5, -1, Number.NaN])('rejects a challenge percent of %d', (challengeBonusPercent) => {
    expect(() => challengeBonusXp(1000, { challengeBonusPercent })).toThrow(RangeError);
  });
});

describe('e1rmAtSessionStart and challengeE1rmSnapshot', () => {
  const strength: StrengthState = {
    deadlift: { windowMax: 140, fallbackMax: 120, hasPriorSession: true },
    squat: { windowMax: null, fallbackMax: 110, hasPriorSession: true },
    'pull-up': { windowMax: 12, fallbackMax: null, hasPriorSession: true },
  };

  it('takes the window max, then the fallback max, then null', () => {
    expect(e1rmAtSessionStart(strength, 'deadlift')).toBe(140);
    expect(e1rmAtSessionStart(strength, 'squat')).toBe(110);
    expect(e1rmAtSessionStart(strength, 'bench')).toBeNull();
  });

  it('snapshots only the exercises with a load percent', () => {
    expect(challengeE1rmSnapshot(deadliftAndPullUp, strength)).toEqual({ deadlift: 140 });
    expect(challengeE1rmSnapshot(squatCentury, strength)).toEqual({ squat: 110 });
    expect(challengeE1rmSnapshot(tenTonDay, strength)).toEqual({});
    expect(challengeE1rmSnapshot(squatCentury, {})).toEqual({ squat: null });
  });
});

describe('challengeLoadExerciseIds and challengeTargetLoadsKg', () => {
  it('lists the exercises that carry a load percent', () => {
    expect(challengeLoadExerciseIds(deadliftAndPullUp)).toEqual(['deadlift']);
    expect(challengeLoadExerciseIds(squatCentury)).toEqual(['squat']);
    expect(challengeLoadExerciseIds(tenTonDay)).toEqual([]);
  });

  it('gives the judge floor of every snapshot exercise, or null without an e1RM', () => {
    const run = { challengeId: 'c', key: 'k', name: 'n', definition: deadliftAndPullUp };
    expect(challengeTargetLoadsKg({ ...run, e1rmKg: { deadlift: 140 } })).toEqual({ deadlift: 97.5 });
    expect(challengeTargetLoadsKg({ ...run, e1rmKg: { deadlift: 150 } })).toEqual({ deadlift: 105 });
    expect(challengeTargetLoadsKg({ ...run, e1rmKg: { deadlift: null } })).toEqual({ deadlift: null });
    expect(challengeTargetLoadsKg({ ...run, definition: tenTonDay, e1rmKg: {} })).toEqual({});
  });
});

describe('challengeRunFromStored', () => {
  const stored = {
    challengeId: '7d0c3f1e-0000-4000-8000-000000000001',
    key: 'deadlift_and_pull_up',
    name: 'Deadlift and Pull-up',
    definition: deadliftAndPullUp,
    e1rmKg: { deadlift: 140 },
  };

  it('reads a stored challenge run', () => {
    expect(challengeRunFromStored(stored)).toEqual(stored);
    expect(challengeRunFromStored({ ...stored, definition: squatCentury, e1rmKg: { squat: null } })).toEqual({
      ...stored,
      definition: squatCentury,
      e1rmKg: { squat: null },
    });
  });

  it('reads a missing run as null', () => {
    expect(challengeRunFromStored(null)).toBeNull();
    expect(challengeRunFromStored(undefined)).toBeNull();
  });

  it.each<[string, unknown]>([
    ['a string', 'deadlift_and_pull_up'],
    ['an array', [stored]],
    ['a missing name', { ...stored, name: undefined }],
    ['an unknown kind', { ...stored, definition: { kind: 'timed' } }],
    ['a group without exercises', { ...stored, definition: { kind: 'prescription', groups: [{ rounds: 5 }] } }],
    ['a non-numeric percent', { ...stored, definition: { ...squatCentury, minPct: '50' } }],
    ['an unknown metric', { ...stored, definition: { ...tenTonDay, metric: 'sets' } }],
    ['a non-numeric e1RM', { ...stored, e1rmKg: { deadlift: '140' } }],
  ])('rejects %s', (_case, value) => {
    expect(() => challengeRunFromStored(value)).toThrow(RangeError);
  });
});
