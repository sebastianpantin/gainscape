import { describe, expect, it } from 'vitest';
import type { Collection } from '../../web/src/lib/collection/collection-data.ts';
import type { LiftExercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  competitionBests,
  dotsCard,
  dotsCardFor,
  dotsHighlightText,
  dotsScore,
  POWERLIFTING_LIFT_KEYS,
} from '../../web/src/lib/stats/dots-rules.ts';

function lift(id: string, key: string | null): LiftExercise {
  return {
    id,
    key,
    name: id,
    equipment: 'barbell',
    modality: 'lift',
    loadType: 'external',
    custom: key === null,
    archived: false,
    skillShares: [],
  };
}

describe('dotsScore', () => {
  it('matches the published DOTS formula for men', () => {
    expect(dotsScore(700, 100, 'male')).toBeCloseTo(430.86, 2);
    expect(dotsScore(750, 93, 'male')).toBeCloseTo(477.19, 2);
    expect(dotsScore(600, 83, 'male')).toBeCloseTo(405.05, 2);
  });

  it('matches the published DOTS formula for women', () => {
    expect(dotsScore(400, 60, 'female')).toBeCloseTo(443.42, 2);
    expect(dotsScore(350, 57, 'female')).toBeCloseTo(400.99, 2);
  });

  it('rounds to two decimals', () => {
    expect(dotsScore(700, 100, 'male')).toBe(430.86);
  });

  it('clamps bodyweight to 40 to 210 kg for men', () => {
    expect(dotsScore(300, 35, 'male')).toBe(dotsScore(300, 40, 'male'));
    expect(dotsScore(300, 40, 'male')).toBeCloseTo(381.33, 2);
    expect(dotsScore(900, 250, 'male')).toBe(dotsScore(900, 210, 'male'));
    expect(dotsScore(900, 210, 'male')).toBeCloseTo(446.06, 2);
  });

  it('clamps bodyweight to 40 to 150 kg for women', () => {
    expect(dotsScore(500, 160, 'female')).toBe(dotsScore(500, 150, 'female'));
    expect(dotsScore(500, 150, 'female')).toBeCloseTo(385.38, 2);
    expect(dotsScore(200, 30, 'female')).toBe(dotsScore(200, 40, 'female'));
  });

  it('scores a zero total as zero', () => {
    expect(dotsScore(0, 80, 'male')).toBe(0);
  });
});

describe('dotsCard', () => {
  const allBests = new Map([
    ['back_squat', 250],
    ['barbell_bench_press', 150],
    ['deadlift', 300],
  ]);

  it('totals the squat, bench press and deadlift bests at the latest bodyweight', () => {
    expect(dotsCard({ sex: 'male', bodyweightKg: 100, bestE1rmKgByKey: allBests })).toEqual({
      kind: 'ready',
      totalKg: 700,
      bodyweightKg: 100,
      score: 430.86,
    });
  });

  it('asks for the sex before anything else', () => {
    expect(dotsCard({ sex: null, bodyweightKg: null, bestE1rmKgByKey: new Map() })).toEqual({ kind: 'needs-sex' });
  });

  it('asks for a bodyweight once the sex is set', () => {
    expect(dotsCard({ sex: 'female', bodyweightKg: null, bestE1rmKgByKey: allBests })).toEqual({
      kind: 'needs-bodyweight',
    });
  });

  it('names every missing lift in squat, bench press, deadlift order', () => {
    expect(
      dotsCard({ sex: 'male', bodyweightKg: 80, bestE1rmKgByKey: new Map([['barbell_bench_press', 100]]) }),
    ).toEqual({
      kind: 'missing-lifts',
      text: 'Log a squat and a deadlift to see your DOTS score.',
    });
    expect(dotsCard({ sex: 'male', bodyweightKg: 80, bestE1rmKgByKey: new Map() })).toMatchObject({
      text: 'Log a squat, a bench press and a deadlift to see your DOTS score.',
    });
    expect(
      dotsCard({
        sex: 'male',
        bodyweightKg: 80,
        bestE1rmKgByKey: new Map([
          ['back_squat', 100],
          ['barbell_bench_press', 80],
        ]),
      }),
    ).toMatchObject({ text: 'Log a deadlift to see your DOTS score.' });
  });

  it('uses the catalog keys of the competition lifts', () => {
    expect(POWERLIFTING_LIFT_KEYS).toEqual(['back_squat', 'barbell_bench_press', 'deadlift']);
  });
});

describe('competitionBests', () => {
  it('maps each catalog lift key to the current best e1RM, ignoring custom exercises without a key', () => {
    const bests = competitionBests(
      [lift('squat-id', 'back_squat'), lift('bench-id', 'barbell_bench_press'), lift('my-squat', null)],
      new Map([
        ['squat-id', { e1rmKg: 150, repsCapacity: null }],
        ['my-squat', { e1rmKg: 300, repsCapacity: null }],
      ]),
    );
    expect(bests).toEqual(new Map([['back_squat', 150]]));
  });
});

describe('dotsHighlightText', () => {
  it('shows the score with two decimals once it is ready', () => {
    expect(dotsHighlightText({ kind: 'ready', totalKg: 485, bodyweightKg: 105, score: 292.5 })).toBe('292.50');
  });

  it('shows nothing until the score is ready', () => {
    expect(dotsHighlightText({ kind: 'needs-sex' })).toBeNull();
    expect(dotsHighlightText({ kind: 'needs-bodyweight' })).toBeNull();
    expect(dotsHighlightText({ kind: 'missing-lifts', text: 'Log a deadlift to see your DOTS score.' })).toBeNull();
  });
});

describe('dotsCardFor', () => {
  function collectionWith(e1rmKgById: Record<string, number>): Collection {
    return {
      exercises: [lift('squat-id', 'back_squat'), lift('bench-id', 'barbell_bench_press'), lift('dead-id', 'deadlift')],
      data: {
        repMaxesByExercise: new Map(),
        maxRepsByExercise: new Map(),
        strengthByExercise: new Map(
          Object.entries(e1rmKgById).map(([id, e1rmKg]) => [id, { e1rmKg, repsCapacity: null }]),
        ),
        pinnedExerciseIds: [],
        nextPinPosition: 0,
        cardioRecords: [],
      },
    };
  }

  it('scores the profile against the collection bests of the three competition lifts', () => {
    const collection = collectionWith({ 'squat-id': 250, 'bench-id': 150, 'dead-id': 300 });
    expect(dotsCardFor({ sex: 'male', bodyweightKg: 100 }, collection)).toEqual({
      kind: 'ready',
      totalKg: 700,
      bodyweightKg: 100,
      score: 430.86,
    });
  });

  it('names the lifts the collection has no e1RM for', () => {
    const collection = collectionWith({ 'bench-id': 150 });
    expect(dotsCardFor({ sex: 'female', bodyweightKg: 60 }, collection)).toEqual({
      kind: 'missing-lifts',
      text: 'Log a squat and a deadlift to see your DOTS score.',
    });
  });
});
