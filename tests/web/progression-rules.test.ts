import { describe, expect, it } from 'vitest';
import type { RecentSet } from '../../web/src/lib/last-session-rules.ts';
import { nextWeightHint, progressionStep, READY_RIR } from '../../web/src/lib/progression-rules.ts';

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
