import { describe, expect, it } from 'vitest';
import type { RecentSet } from '../../web/src/lib/last-session-rules.ts';
import {
  DELOAD_FRACTION,
  FATIGUE_SESSIONS,
  fatigueAdvice,
  nextWeightHint,
  progressionStep,
  READY_RIR,
} from '../../web/src/lib/progression-rules.ts';

const set = (weightKg: number, reps: number, loggedRir: number | null = null): RecentSet => ({
  weightKg,
  reps,
  loggedRir,
});
const threeOf = (weightKg: number, reps: number, loggedRir: number | null) => [
  set(weightKg, reps, loggedRir),
  set(weightKg, reps, loggedRir),
  set(weightKg, reps, loggedRir),
];

describe('progressionStep', () => {
  it('adds the smallest plate on each side of a barbell', () => {
    expect(progressionStep('kg', [25, 20, 10, 5, 2.5, 1.25])).toBe(2.5);
    expect(progressionStep('kg', [20, 10, 5, 2.5])).toBe(5);
    expect(progressionStep('lb', [45, 25, 10, 5, 2.5])).toBe(5);
  });

  it('steps 2.5 kg or 5 lb without a barbell', () => {
    expect(progressionStep('kg', null)).toBe(2.5);
    expect(progressionStep('lb', null)).toBe(5);
    expect(progressionStep('kg', [])).toBe(2.5);
  });
});

describe('nextWeightHint', () => {
  it('suggests more weight when every set hit its reps with reps in reserve', () => {
    expect(READY_RIR).toBe(2);
    expect(nextWeightHint(threeOf(80, 5, 2), 'external', null, 'kg', 2.5)).toBe(
      'Try 82.5 kg: every set hit 5 reps last time',
    );
    expect(nextWeightHint(threeOf(80, 5, 3), 'external', null, 'lb', 5)).toBe(
      'Try 181.4 lb: every set hit 5 reps last time',
    );
  });

  it('judges only the heaviest sets', () => {
    const sets = [set(60, 5, 4), ...threeOf(80, 5, 2), set(60, 12, 0)];
    expect(nextWeightHint(sets, 'external', null, 'kg', 2.5)).toBe('Try 82.5 kg: every set hit 5 reps last time');
  });

  it('waits while a set was too hard to add weight', () => {
    expect(nextWeightHint([set(80, 5, 2), set(80, 5, 1.5)], 'external', null, 'kg', 2.5)).toBeNull();
  });

  it('needs logged effort on every set unless a rep range says when to move up', () => {
    expect(nextWeightHint([set(80, 5, 2), set(80, 5, null)], 'external', null, 'kg', 2.5)).toBeNull();
    const range = { repsMin: 8, repsMax: 12 };
    expect(nextWeightHint(threeOf(50, 12, null), 'external', range, 'kg', 2.5)).toBe(
      'Try 52.5 kg: every set hit 12 reps last time',
    );
  });

  it('keeps building reps inside a rep range before adding weight', () => {
    const range = { repsMin: 8, repsMax: 12 };
    expect(nextWeightHint([set(50, 12, 3), set(50, 10, 2), set(50, 9, 2)], 'external', range, 'kg', 2.5)).toBeNull();
    expect(nextWeightHint(threeOf(50, 12, 1), 'external', range, 'kg', 2.5)).toBeNull();
  });

  it('suggests staying at the weight when a set fell short of its reps', () => {
    expect(nextWeightHint([set(80, 5, 2), set(80, 5, 1), set(80, 4, 0)], 'external', null, 'kg', 2.5)).toBe(
      'Stay at 80 kg until every set hits 5 reps',
    );
    const range = { repsMin: 8, repsMax: 12 };
    expect(nextWeightHint([set(50, 9, 1), set(50, 7, 0)], 'external', range, 'kg', 2.5)).toBe(
      'Stay at 50 kg until every set hits 8 reps',
    );
  });

  it('suggests one more rep for a bodyweight lift', () => {
    expect(nextWeightHint(threeOf(0, 8, 2), 'bodyweight', null, 'kg', 2.5)).toBe(
      'Try 9 reps: every set hit 8 reps last time',
    );
    expect(nextWeightHint(threeOf(0, 8, 2), 'bodyweight_plus', null, 'kg', 2.5)).toBe(
      'Try 9 reps: every set hit 8 reps last time',
    );
    expect(nextWeightHint([set(0, 8, 1), set(0, 6, 0)], 'bodyweight', null, 'kg', 2.5)).toBe(
      'Aim for 8 reps on every set',
    );
  });

  it('adds weight to a weighted bodyweight lift', () => {
    expect(nextWeightHint(threeOf(10, 6, 2), 'bodyweight_plus', null, 'kg', 2.5)).toBe(
      'Try +12.5 kg: every set hit 6 reps last time',
    );
    expect(nextWeightHint([set(10, 6, 1), set(10, 4, 0)], 'bodyweight_plus', null, 'kg', 2.5)).toBe(
      'Stay at +10 kg until every set hits 6 reps',
    );
  });

  it('gives no hint without a last session or with an unloaded external lift', () => {
    expect(nextWeightHint(undefined, 'external', null, 'kg', 2.5)).toBeNull();
    expect(nextWeightHint([], 'external', null, 'kg', 2.5)).toBeNull();
    expect(nextWeightHint(threeOf(0, 5, 3), 'external', null, 'kg', 2.5)).toBeNull();
  });
});

describe('fatigueAdvice', () => {
  const newestFirst = (...sessions: RecentSet[][]) => sessions;

  it('flags a lift that felt harder three sessions in a row at the same weight', () => {
    expect(FATIGUE_SESSIONS).toBe(3);
    expect(DELOAD_FRACTION).toBe(0.9);
    const sessions = newestFirst(threeOf(80, 5, 1), threeOf(80, 5, 2), threeOf(80, 5, 3));
    expect(fatigueAdvice(sessions, 'external', 'kg', 2.5)).toBe(
      'Felt harder 3 sessions in a row at 80 kg: consider a lighter day at 72.5 kg',
    );
  });

  it('flags a lift whose reps dropped three sessions in a row at the same weight', () => {
    const sessions = newestFirst(
      [set(100, 5), set(100, 3)],
      [set(100, 5), set(100, 4)],
      [set(100, 5), set(100, 5), set(60, 12)],
    );
    expect(fatigueAdvice(sessions, 'external', 'kg', 2.5)).toBe(
      'Reps dropped 3 sessions in a row at 100 kg: consider a lighter day at 90 kg',
    );
    expect(fatigueAdvice(sessions, 'external', 'lb', 5)).toBe(
      'Reps dropped 3 sessions in a row at 220.5 lb: consider a lighter day at 200 lb',
    );
  });

  it('stays quiet while the lift still has reps in reserve', () => {
    const sessions = newestFirst(threeOf(80, 5, 2), threeOf(80, 5, 3), threeOf(80, 5, 4));
    expect(fatigueAdvice(sessions, 'external', 'kg', 2.5)).toBeNull();
  });

  it('stays quiet when effort or reps held steady, the weight changed or there are too few sessions', () => {
    const steady = newestFirst(threeOf(80, 5, 1), threeOf(80, 5, 1), threeOf(80, 5, 3));
    expect(fatigueAdvice(steady, 'external', 'kg', 2.5)).toBeNull();
    const heavier = newestFirst(threeOf(82.5, 5, 1), threeOf(80, 5, 2), threeOf(80, 5, 3));
    expect(fatigueAdvice(heavier, 'external', 'kg', 2.5)).toBeNull();
    const unrated = newestFirst(threeOf(80, 5, 1), threeOf(80, 5, null), threeOf(80, 5, 3));
    expect(fatigueAdvice(unrated, 'external', 'kg', 2.5)).toBeNull();
    expect(fatigueAdvice(newestFirst(threeOf(80, 5, 1), threeOf(80, 5, 2)), 'external', 'kg', 2.5)).toBeNull();
    expect(fatigueAdvice(undefined, 'external', 'kg', 2.5)).toBeNull();
  });

  it('suggests an easier day for a bodyweight lift and a lighter load for a weighted one', () => {
    const bodyweight = newestFirst([set(0, 6), set(0, 5)], [set(0, 7), set(0, 6)], [set(0, 8), set(0, 7)]);
    expect(fatigueAdvice(bodyweight, 'bodyweight', 'kg', 2.5)).toBe(
      'Reps dropped 3 sessions in a row: consider an easier day with fewer reps',
    );
    const weighted = newestFirst(threeOf(20, 5, 0), threeOf(20, 5, 1), threeOf(20, 5, 2));
    expect(fatigueAdvice(weighted, 'bodyweight_plus', 'kg', 2.5)).toBe(
      'Felt harder 3 sessions in a row at +20 kg: consider a lighter day at +17.5 kg',
    );
  });
});
