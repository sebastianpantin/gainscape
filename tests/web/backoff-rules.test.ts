import { describe, expect, it } from 'vitest';
import { type EffortInput } from '@domain/index.ts';
import { backoffSuggestion } from '../../web/src/lib/workout/backoff-rules.ts';
import { type DraftSet } from '../../web/src/offline/draft-format.ts';

let nextId = 0;

function set(weightKg: number, reps: number, effort: EffortInput, overrides: Partial<DraftSet> = {}): DraftSet {
  nextId += 1;
  return { id: `set-${nextId}`, weightKg, reps, isWarmup: false, effort, done: true, ...overrides };
}

function planned(weightKg = 0): DraftSet {
  return set(weightKg, 3, null, { done: false });
}

const CHART_PCT = {
  threeReps: { rpe8: 0.863, rpe7: 0.837 },
  twoReps: { rpe9: 0.922, rpe8: 0.892 },
};

function floorTo2point5(kg: number): number {
  return Math.floor(kg / 2.5) * 2.5;
}

function backoffKg(topKg: number, pct: { rpe8?: number; rpe9?: number; rpe7?: number }, from: 'rpe8' | 'rpe9') {
  const backoffPct = from === 'rpe9' ? pct.rpe8 : pct.rpe7;
  const topPct = from === 'rpe9' ? pct.rpe9 : pct.rpe8;
  return floorTo2point5((topKg / (topPct ?? 1)) * (backoffPct ?? 1));
}

const rpe8: EffortInput = { type: 'rpe', value: 8 };

function lift(sets: DraftSet[], loadType: 'external' | 'bodyweight' | 'bodyweight_plus' = 'external') {
  return { loadType, sets };
}

describe('backoffSuggestion', () => {
  it('takes the same reps one RPE lower from the top set e1RM, rounded down to the kg step', () => {
    const expectedKg = backoffKg(180, CHART_PCT.threeReps, 'rpe8');
    expect(expectedKg).toBe(172.5);
    expect(backoffSuggestion(lift([set(180, 3, rpe8), planned()]), 'kg')).toEqual({
      setIndex: 1,
      shown: expectedKg,
      weightKg: expectedKg,
      reps: 3,
    });
  });

  it('reads RIR 2 as RPE 8', () => {
    expect(backoffSuggestion(lift([set(180, 3, { type: 'rir', value: 2 }), planned()]), 'kg')?.shown).toBe(
      backoffKg(180, CHART_PCT.threeReps, 'rpe8'),
    );
  });

  it('reads a near failure level as RPE 9', () => {
    const top = set(200, 2, { type: 'level', level: 'near_failure' });
    expect(backoffSuggestion(lift([top, planned()]), 'kg')?.shown).toBe(backoffKg(200, CHART_PCT.twoReps, 'rpe9'));
  });

  it('offers nothing for a hard level, since RPE 7 has no lower column on the chart', () => {
    expect(backoffSuggestion(lift([set(180, 3, { type: 'level', level: 'hard' }), planned()]), 'kg')).toBeNull();
  });

  it('offers nothing for a top set rated RPE 7', () => {
    expect(backoffSuggestion(lift([set(180, 3, { type: 'rpe', value: 7 }), planned()]), 'kg')).toBeNull();
  });

  it('offers nothing past 6 reps or below RPE 7', () => {
    expect(backoffSuggestion(lift([set(180, 8, rpe8), planned()]), 'kg')).toBeNull();
    expect(backoffSuggestion(lift([set(180, 3, { type: 'rpe', value: 6 }), planned()]), 'kg')).toBeNull();
  });

  it('never takes a warm-up, an unrated set or a set not done as the top set', () => {
    expect(backoffSuggestion(lift([set(180, 3, rpe8, { isWarmup: true }), planned()]), 'kg')).toBeNull();
    expect(backoffSuggestion(lift([set(180, 3, null), planned()]), 'kg')).toBeNull();
    expect(backoffSuggestion(lift([set(180, 3, rpe8, { done: false }), planned()]), 'kg')).toBeNull();
  });

  it('leaves a program exercise alone, since the program sets its loads', () => {
    const prescription = { ref: 'top', weightKg: 180, reps: 3, minReps: null, amrap: false };
    expect(backoffSuggestion(lift([set(180, 3, rpe8, { prescription }), planned()]), 'kg')).toBeNull();
    expect(backoffSuggestion(lift([set(180, 3, rpe8), { ...planned(), prescription }]), 'kg')).toBeNull();
  });

  it('offers nothing for a lift without an external load', () => {
    expect(backoffSuggestion(lift([set(180, 3, rpe8), planned()], 'bodyweight'), 'kg')).toBeNull();
    expect(backoffSuggestion(lift([set(40, 3, rpe8), planned()], 'bodyweight_plus'), 'kg')).toBeNull();
  });

  it('takes the heaviest set, and the latest one on a tie', () => {
    const heaviest = [set(180, 3, rpe8), set(160, 3, rpe8), planned()];
    expect(backoffSuggestion(lift(heaviest), 'kg')).toMatchObject({ setIndex: 2, shown: 172.5 });
    const tied = [set(200, 3, rpe8), set(200, 1, { type: 'rpe', value: 10 }), planned()];
    expect(backoffSuggestion(lift(tied), 'kg')?.shown).toBe(190);
  });

  it('suggests on the first set not done after the top set, skipping warm-ups', () => {
    const sets = [planned(), set(180, 3, rpe8), set(0, 3, null, { isWarmup: true, done: false }), planned()];
    expect(backoffSuggestion(lift(sets), 'kg')?.setIndex).toBe(3);
    expect(backoffSuggestion(lift([planned(), set(180, 3, rpe8)]), 'kg')).toBeNull();
  });

  it('offers nothing when rounding down leaves no lighter load', () => {
    expect(backoffSuggestion(lift([set(2.5, 1, { type: 'rpe', value: 10 }), planned()]), 'kg')).toBeNull();
  });

  it('rounds down to 5 lb for a pound user and stores the kg value', () => {
    expect(backoffSuggestion(lift([set(181.44, 3, rpe8), planned()]), 'lb')).toEqual({
      setIndex: 1,
      shown: 385,
      weightKg: 174.63,
      reps: 3,
    });
  });
});
