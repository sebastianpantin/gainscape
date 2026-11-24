import { describe, expect, it } from 'vitest';
import type { GarminSetGroup } from '@domain/index.ts';
import type { Exercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  categoryLabel,
  decisionFor,
  type GroupChoice,
  groupName,
  groupView,
  pickableLifts,
  prefilledDecisions,
  type ReviewLift,
  reviewLifts,
  strengthBadgeText,
  strengthFacts,
  UNDECIDED_GROUP,
  withFilledWeight,
  withGroupDecision,
  withSkip,
} from '../../web/src/lib/garmin/strength-review-rules.ts';

const BENCH: ReviewLift = { id: 'ex-bench', name: 'Barbell Bench Press', loadType: 'external' };
const PUSH_UP: ReviewLift = { id: 'ex-push-up', name: 'Push-up', loadType: 'bodyweight' };
const PULL_UP: ReviewLift = { id: 'ex-pull-up', name: 'Weighted Pull-up', loadType: 'bodyweight_plus' };
const LIFTS = new Map([BENCH, PUSH_UP, PULL_UP].map((lift) => [lift.id, lift]));

function group(category: string | null, ...sets: [reps: number, weightKg: number][]): GarminSetGroup {
  return { category, sets: sets.map(([reps, weightKg]) => ({ reps, weightKg })), leftOut: 0 };
}

describe('categoryLabel and groupName', () => {
  it('puts a Garmin category in plain words', () => {
    expect(categoryLabel('bench_press')).toBe('Bench press');
    expect(categoryLabel('hip_raise')).toBe('Hip raise');
    expect(categoryLabel(null)).toBe('Unknown exercise');
  });

  it('numbers the groups so two groups of one category have their own name', () => {
    const groups = [group('bench_press', [8, 60]), group('row', [10, 40]), group('bench_press', [8, 50])];
    expect(groups.map(groupName)).toEqual(['group 1, Bench press', 'group 2, Row', 'group 3, Bench press']);
  });
});

describe('pickableLifts and reviewLifts', () => {
  const lift = (id: string, overrides: Record<string, unknown> = {}) =>
    ({ id, name: id, archived: false, modality: 'lift', loadType: 'external', ...overrides }) as unknown as Exercise;
  const exercises = [
    lift('bench'),
    lift('old', { archived: true }),
    lift('plank', { measure: 'time' }),
    lift('push-up', { loadType: 'bodyweight' }),
    { id: 'run', name: 'Running', archived: false, modality: 'cardio' } as unknown as Exercise,
  ];

  it('offers active exercises that take reps, never a hold, a cardio or an archived exercise', () => {
    expect(pickableLifts(exercises).map((exercise) => exercise.id)).toEqual(['bench', 'push-up']);
    expect(reviewLifts(pickableLifts(exercises))).toEqual(
      new Map([
        ['bench', { id: 'bench', name: 'bench', loadType: 'external' }],
        ['push-up', { id: 'push-up', name: 'push-up', loadType: 'bodyweight' }],
      ]),
    );
  });
});

describe('prefilledDecisions', () => {
  it('starts each group undecided unless its category has a remembered exercise', () => {
    const groups = [group('bench_press', [8, 60]), group(null, [12, 20]), group('curl', [10, 15])];
    const remembered = new Map([
      ['bench_press', BENCH.id],
      ['curl', 'ex-gone'],
    ]);
    expect(prefilledDecisions(groups, remembered, LIFTS)).toEqual([
      { skipped: false, exercise: { id: BENCH.id, loadType: 'external' }, filledKg: [], typedWeights: [] },
      UNDECIDED_GROUP,
      UNDECIDED_GROUP,
    ]);
  });
});

describe('changing a group decision', () => {
  it('changes one group and leaves the others', () => {
    const decisions = [decisionFor(BENCH), UNDECIDED_GROUP];
    const changed = withGroupDecision(decisions, 1, () => decisionFor(PUSH_UP));
    expect(changed).toEqual([decisionFor(BENCH), decisionFor(PUSH_UP)]);
    expect(decisions[1]).toBe(UNDECIDED_GROUP);
  });

  it('starts from an undecided group when a group has no decision yet', () => {
    expect(withGroupDecision([], 1, (before) => withSkip(before, true))[1]).toEqual({
      skipped: true,
      exercise: null,
      filledKg: [],
      typedWeights: [],
    });
  });

  it('forgets filled-in weights when another exercise is picked', () => {
    const filled = withFilledWeight(decisionFor(BENCH), 0, '40', 'kg');
    expect(filled).toMatchObject({ filledKg: [40], typedWeights: ['40'] });
    expect(withGroupDecision([filled], 0, () => decisionFor(PULL_UP))[0]).toMatchObject({
      filledKg: [],
      typedWeights: [],
    });
    expect(withGroupDecision([filled], 0, () => decisionFor(BENCH))[0]).toEqual(decisionFor(BENCH));
  });

  it('keeps the exercise and the typed weights of a skipped group, so taking Skip away brings them back', () => {
    const filled = withFilledWeight(decisionFor(BENCH), 1, '42,5', 'kg');
    const skipped = withSkip(filled, true);
    expect(skipped).toMatchObject({ skipped: true, exercise: { id: BENCH.id }, typedWeights: ['', '42,5'] });
    expect(withSkip(skipped, false)).toEqual(filled);
  });
});

describe('withFilledWeight', () => {
  it('reads a typed weight in the unit of the user, with a comma or a point', () => {
    expect(withFilledWeight(decisionFor(BENCH), 1, '42,5', 'kg').filledKg).toEqual([null, 42.5]);
    expect(withFilledWeight(decisionFor(BENCH), 0, '100', 'lb').filledKg).toEqual([45.36]);
  });

  it('has no weight for what is no number, keeps what was typed, and keeps the other sets', () => {
    const first = withFilledWeight(decisionFor(BENCH), 0, '40', 'kg');
    expect(withFilledWeight(first, 1, 'heavy', 'kg')).toMatchObject({
      filledKg: [40, null],
      typedWeights: ['40', 'heavy'],
    });
    expect(withFilledWeight(first, 0, '', 'kg')).toMatchObject({ filledKg: [null], typedWeights: [''] });
  });
});

describe('groupView', () => {
  const sets = group('bench_press', [8, 60], [8, 0]);

  it('shows reps and weight in the unit of the user, and reps alone for a set without weight', () => {
    expect(groupView(sets, UNDECIDED_GROUP, undefined, 'kg').sets).toEqual([
      { text: '8 × 60 kg', asksWeight: false },
      { text: '8 reps', asksWeight: false },
    ]);
    expect(groupView(group('curl', [1, 10]), UNDECIDED_GROUP, undefined, 'lb').sets[0].text).toBe('1 × 22 lb');
  });

  it('asks for the weight of a set without one only under an exercise with an external load', () => {
    const asks = (decision: GroupChoice) =>
      groupView(sets, decision, undefined, 'kg').sets.map((set) => set.asksWeight);
    expect(asks(decisionFor(BENCH))).toEqual([false, true]);
    expect(asks(withFilledWeight(decisionFor(BENCH), 1, '40', 'kg'))).toEqual([false, true]);
    expect(asks(decisionFor(PUSH_UP))).toEqual([false, false]);
    expect(asks(decisionFor(PULL_UP))).toEqual([false, false]);
    expect(asks(withSkip(decisionFor(BENCH), true))).toEqual([false, false]);
  });

  it('says how many sets were left out', () => {
    expect(groupView({ ...group('plank', [8, 0]), leftOut: 1 }, UNDECIDED_GROUP, undefined, 'kg').notes).toEqual([
      '1 set left out: no reps, or more than a set can hold.',
    ]);
    expect(groupView({ category: 'plank', sets: [], leftOut: 3 }, UNDECIDED_GROUP, undefined, 'kg').notes).toEqual([
      '3 sets left out: no reps, or more than a set can hold.',
    ]);
  });

  it('names the weight an exercise without added weight leaves out, once per weight', () => {
    const weighted = group('push_up', [12, 10], [12, 10], [10, 15], [10, 0]);
    expect(groupView(weighted, decisionFor(PUSH_UP), PUSH_UP.name, 'kg').notes).toEqual([
      'Push-up takes no added weight: 10 kg, 15 kg left out.',
    ]);
    expect(groupView(weighted, decisionFor(PULL_UP), PULL_UP.name, 'kg').notes).toEqual([]);
    expect(groupView(weighted, withSkip(decisionFor(PUSH_UP), true), PUSH_UP.name, 'kg').notes).toEqual([]);
  });
});

describe('strengthBadgeText and strengthFacts', () => {
  it('names what an undecided strength activity waits for', () => {
    expect(strengthBadgeText({ status: 'needs_exercise' })).toBe('Needs exercises');
    expect(strengthBadgeText({ status: 'needs_weight' })).toBe('Needs a weight');
    expect(strengthBadgeText({ status: 'needs_bodyweight' })).toBe('Needs your bodyweight');
    expect(strengthBadgeText({ status: 'nothing_chosen' })).toBe('Every group skipped');
    expect(strengthBadgeText({ status: 'ready', sets: [], picks: [] })).toBeNull();
  });

  it('counts the sets that can be imported and the groups', () => {
    expect(strengthFacts([group('bench_press', [8, 60], [8, 60]), { category: 'plank', sets: [], leftOut: 2 }])).toBe(
      '2 sets in 2 groups',
    );
    expect(strengthFacts([group('row', [10, 40])])).toBe('1 set in 1 group');
  });
});
