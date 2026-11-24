import { describe, expect, it } from 'vitest';
import {
  garminCategoryKey,
  type GarminGroupDecision,
  type GarminSet,
  type GarminSetGroup,
  garminSetGroups,
  garminSetWeight,
  garminStrengthDecision,
  type LoadType,
  MAX_SET_LOAD_KG,
  MAX_SET_REPS,
} from '@domain/index.ts';

const BENCH = 'exercise-bench';
const ROW = 'exercise-row';
const PUSH_UP = 'exercise-push-up';
const WEIGHTED_PULL_UP = 'exercise-weighted-pull-up';

function set(category: string | null, reps: number | null, weightKg: number | null): GarminSet {
  return { category, reps, weightKg };
}

function group(category: string | null, ...sets: [reps: number, weightKg: number][]): GarminSetGroup {
  return { category, sets: sets.map(([reps, weightKg]) => ({ reps, weightKg })), leftOut: 0 };
}

function decided(exerciseId: string, loadType: LoadType, filledKg: (number | null)[] = []): GarminGroupDecision {
  return { skipped: false, exercise: { id: exerciseId, loadType }, filledKg };
}

function decisionOf(
  groups: readonly GarminSetGroup[],
  decisions: readonly (GarminGroupDecision | undefined)[],
  bodyweightKnown = true,
) {
  return garminStrengthDecision(groups, decisions, bodyweightKnown);
}

const SKIPPED: GarminGroupDecision = { skipped: true, exercise: null, filledKg: [] };

describe('garminCategoryKey', () => {
  it('keeps a category Garmin named', () => {
    expect(garminCategoryKey('bench_press')).toBe('bench_press');
  });

  it.each([null, 'unknown', '', 'Bench Press', 'a'.repeat(61)])('has no key for %j', (name) => {
    expect(garminCategoryKey(name)).toBeNull();
  });
});

describe('garminSetGroups', () => {
  it('puts consecutive sets of one category in one group, in file order', () => {
    expect(
      garminSetGroups([
        set('bench_press', 8, 60),
        set('bench_press', 8, 60),
        set('bench_press', 6, 62.5),
        set('row', 10, 40),
        set('row', 10, 40),
      ]),
    ).toEqual([group('bench_press', [8, 60], [8, 60], [6, 62.5]), group('row', [10, 40], [10, 40])]);
  });

  it('starts a new group when a category comes back after another one', () => {
    const groups = garminSetGroups([set('bench_press', 8, 60), set('row', 10, 40), set('bench_press', 8, 60)]);
    expect(groups.map((each) => each.category)).toEqual(['bench_press', 'row', 'bench_press']);
  });

  it('groups a run of unknown sets as one group without a category', () => {
    expect(garminSetGroups([set(null, 12, 20), set(null, 12, 20), set('curl', 10, 15)])).toEqual([
      group(null, [12, 20], [12, 20]),
      group('curl', [10, 15]),
    ]);
  });

  it('reads a set without a weight as weight zero', () => {
    expect(garminSetGroups([set('pull_up', 5, null)])).toEqual([group('pull_up', [5, 0])]);
  });

  it('rounds a weight to the hundredth a Lift set stores', () => {
    expect(garminSetGroups([set('bench_press', 5, 45.359237)])[0].sets).toEqual([{ reps: 5, weightKg: 45.36 }]);
  });

  it.each<[string, GarminSet]>([
    ['no reps', set('plank', null, 0)],
    ['zero reps', set('plank', 0, 0)],
    ['a fraction of a rep', set('bench_press', 7.5, 60)],
    ['more reps than a Lift set allows', set('bench_press', MAX_SET_REPS + 1, 60)],
    ['more weight than a Lift set allows', set('bench_press', 5, MAX_SET_LOAD_KG + 1)],
    ['a negative weight', set('bench_press', 5, -1)],
    ['a weight that is no number', set('bench_press', 5, Number.NaN)],
  ])('leaves a set with %s out and counts it on its group', (_what, unusable) => {
    expect(garminSetGroups([set('bench_press', 8, 60), unusable, set('plank', 8, 0)])).toEqual(
      unusable.category === 'plank'
        ? [group('bench_press', [8, 60]), { ...group('plank', [8, 0]), leftOut: 1 }]
        : [{ ...group('bench_press', [8, 60]), leftOut: 1 }, group('plank', [8, 0])],
    );
  });

  it('keeps a group whose every set is left out, with no sets', () => {
    expect(garminSetGroups([set('plank', null, 0), set('plank', null, 0)])).toEqual([
      { category: 'plank', sets: [], leftOut: 2 },
    ]);
  });

  it('has no groups for an activity without sets', () => {
    expect(garminSetGroups([])).toEqual([]);
  });
});

describe('garminSetWeight', () => {
  it('takes a recorded weight on an exercise with an external load as it is', () => {
    expect(garminSetWeight({ reps: 8, weightKg: 60 }, 'external', null)).toEqual({ source: 'recorded', weightKg: 60 });
  });

  it('asks for the weight of a zero-weight set on an exercise with an external load', () => {
    expect(garminSetWeight({ reps: 8, weightKg: 0 }, 'external', null)).toEqual({ source: 'asked', weightKg: null });
    expect(garminSetWeight({ reps: 8, weightKg: 0 }, 'external', 42.5)).toEqual({ source: 'asked', weightKg: 42.5 });
  });

  it.each([0, 0.004, -5, Number.NaN, MAX_SET_LOAD_KG + 1])('does not accept %j as a filled-in weight', (filledKg) => {
    expect(garminSetWeight({ reps: 8, weightKg: 0 }, 'external', filledKg)).toEqual({
      source: 'asked',
      weightKg: null,
    });
  });

  it('rounds a filled-in weight to the hundredth', () => {
    expect(garminSetWeight({ reps: 8, weightKg: 0 }, 'external', 45.359237).weightKg).toBe(45.36);
  });

  it('never lets a filled-in weight replace a weight Garmin recorded', () => {
    expect(garminSetWeight({ reps: 8, weightKg: 60 }, 'external', 100)).toEqual({ source: 'recorded', weightKg: 60 });
  });

  it('takes a zero weight on a bodyweight exercise as it is, with or without added weight allowed', () => {
    expect(garminSetWeight({ reps: 8, weightKg: 0 }, 'bodyweight', null)).toEqual({ source: 'recorded', weightKg: 0 });
    expect(garminSetWeight({ reps: 8, weightKg: 0 }, 'bodyweight_plus', null)).toEqual({
      source: 'recorded',
      weightKg: 0,
    });
  });

  it('keeps an added weight on a bodyweight exercise that allows one', () => {
    expect(garminSetWeight({ reps: 5, weightKg: 12.5 }, 'bodyweight_plus', null)).toEqual({
      source: 'recorded',
      weightKg: 12.5,
    });
  });

  it('leaves a weight out on an exercise that takes none, and says so', () => {
    expect(garminSetWeight({ reps: 12, weightKg: 10 }, 'bodyweight', null)).toEqual({
      source: 'left_out',
      weightKg: 0,
    });
  });
});

describe('garminStrengthDecision', () => {
  const groups = [group('bench_press', [8, 60], [8, 60]), group(null, [12, 0]), group('row', [10, 40])];

  it('needs an exercise while a group has neither an exercise nor Skip', () => {
    const needsExercise = { status: 'needs_exercise' };
    expect(decisionOf(groups, [decided(BENCH, 'external'), undefined, SKIPPED])).toEqual(needsExercise);
    expect(decisionOf(groups, [])).toEqual(needsExercise);
    expect(
      decisionOf(groups, [decided(BENCH, 'external'), { skipped: false, exercise: null, filledKg: [] }, SKIPPED]),
    ).toEqual(needsExercise);
  });

  it('needs a weight while an asked-for weight is missing and every group has an exercise', () => {
    expect(decisionOf(groups, [decided(BENCH, 'external'), decided(ROW, 'external'), SKIPPED])).toEqual({
      status: 'needs_weight',
    });
  });

  it('names the exercise first when one group needs an exercise and another a weight', () => {
    expect(decisionOf(groups, [decided(BENCH, 'external'), decided(ROW, 'external'), undefined])).toEqual({
      status: 'needs_exercise',
    });
  });

  it('returns the Lift sets in file order once every group is decided, and the picks to remember', () => {
    expect(
      decisionOf(groups, [decided(BENCH, 'external'), decided(ROW, 'external', [25]), decided(ROW, 'external')]),
    ).toEqual({
      status: 'ready',
      sets: [
        { exerciseId: BENCH, reps: 8, weightKg: 60 },
        { exerciseId: BENCH, reps: 8, weightKg: 60 },
        { exerciseId: ROW, reps: 12, weightKg: 25 },
        { exerciseId: ROW, reps: 10, weightKg: 40 },
      ],
      picks: [
        { category: 'bench_press', exerciseId: BENCH },
        { category: 'row', exerciseId: ROW },
      ],
    });
  });

  it('leaves the sets of a skipped group out and remembers no pick for it', () => {
    expect(decisionOf(groups, [decided(BENCH, 'external'), SKIPPED, SKIPPED])).toEqual({
      status: 'ready',
      sets: [
        { exerciseId: BENCH, reps: 8, weightKg: 60 },
        { exerciseId: BENCH, reps: 8, weightKg: 60 },
      ],
      picks: [{ category: 'bench_press', exerciseId: BENCH }],
    });
  });

  it('lets Skip win over an exercise picked before', () => {
    const skippedAfterPick: GarminGroupDecision = { ...decided(BENCH, 'external'), skipped: true };
    expect(decisionOf([group('bench_press', [8, 60])], [skippedAfterPick])).toEqual({
      status: 'nothing_chosen',
    });
  });

  it('has nothing to import when every group is skipped', () => {
    expect(decisionOf(groups, [SKIPPED, SKIPPED, SKIPPED])).toEqual({ status: 'nothing_chosen' });
  });

  it('needs no decision for a group whose every set was left out', () => {
    const withEmptyGroup = [group('bench_press', [8, 60]), { category: 'plank', sets: [], leftOut: 2 }];
    expect(decisionOf(withEmptyGroup, [decided(BENCH, 'external')])).toMatchObject({
      status: 'ready',
      picks: [{ category: 'bench_press', exerciseId: BENCH }],
    });
  });

  it('sends weight zero for a set whose weight the chosen exercise does not take', () => {
    expect(decisionOf([group('push_up', [12, 10])], [decided(PUSH_UP, 'bodyweight')])).toMatchObject({
      status: 'ready',
      sets: [{ exerciseId: PUSH_UP, reps: 12, weightKg: 0 }],
    });
  });

  it('keeps the added weight under a bodyweight exercise that allows one', () => {
    expect(
      decisionOf([group('pull_up', [5, 12.5], [5, 0])], [decided(WEIGHTED_PULL_UP, 'bodyweight_plus')]),
    ).toMatchObject({
      status: 'ready',
      sets: [
        { exerciseId: WEIGHTED_PULL_UP, reps: 5, weightKg: 12.5 },
        { exerciseId: WEIGHTED_PULL_UP, reps: 5, weightKg: 0 },
      ],
    });
  });

  it('remembers the last pick when one category got two exercises in one activity', () => {
    const twice = [group('bench_press', [8, 60]), group('row', [10, 40]), group('bench_press', [8, 50])];
    const decision = decisionOf(twice, [
      decided(BENCH, 'external'),
      decided(ROW, 'external'),
      decided(PUSH_UP, 'bodyweight'),
    ]);
    expect(decision).toMatchObject({
      picks: expect.arrayContaining([
        { category: 'row', exerciseId: ROW },
        { category: 'bench_press', exerciseId: PUSH_UP },
      ]),
    });
    expect(decision.status === 'ready' && decision.picks).toHaveLength(2);
  });

  it('needs the bodyweight of the user before a bodyweight exercise can be imported', () => {
    const pushUps = [group('push_up', [12, 0])];
    const pullUps = [group('pull_up', [5, 10])];
    expect(decisionOf(pushUps, [decided(PUSH_UP, 'bodyweight')], false)).toEqual({ status: 'needs_bodyweight' });
    expect(decisionOf(pullUps, [decided(WEIGHTED_PULL_UP, 'bodyweight_plus')], false)).toEqual({
      status: 'needs_bodyweight',
    });
    expect(decisionOf(pushUps, [decided(PUSH_UP, 'bodyweight')], true).status).toBe('ready');
  });

  it('needs no bodyweight for exercises with an external load, or for a skipped bodyweight group', () => {
    const mixed = [group('bench_press', [8, 60]), group('push_up', [12, 0])];
    expect(decisionOf(mixed, [decided(BENCH, 'external'), SKIPPED], false).status).toBe('ready');
    expect(
      decisionOf(mixed, [decided(BENCH, 'external'), { ...decided(PUSH_UP, 'bodyweight'), skipped: true }], false)
        .status,
    ).toBe('ready');
  });

  it('remembers nothing for the group without a category', () => {
    expect(decisionOf([group(null, [12, 20])], [decided(ROW, 'external')])).toMatchObject({
      status: 'ready',
      picks: [],
    });
  });
});
