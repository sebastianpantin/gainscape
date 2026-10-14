import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DEFAULT_PLATE_SETTINGS, nearestLoadable } from '../../web/src/lib/workout/plate-rules.ts';
import {
  incrementWarmupSets,
  warmupPlan,
  type WarmupRamp,
  type WarmupSet,
  warmupSets,
} from '../../web/src/lib/workout/warmup-rules.ts';

const kgSetup = DEFAULT_PLATE_SETTINGS.kg;

describe('warm-up sets', () => {
  it('ramps to 100 kg as bar × 10, 40% × 5, 60% × 3 and 80% × 2', () => {
    expect(warmupSets(100, kgSetup)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 40, reps: 5 },
      { weight: 60, reps: 3 },
      { weight: 80, reps: 2 },
    ]);
  });

  it('rounds each step to the nearest weight the plates load: 24, 36 and 48 kg for 60 kg', () => {
    expect(warmupSets(60, kgSetup)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 25, reps: 5 },
      { weight: 35, reps: 3 },
      { weight: 47.5, reps: 2 },
    ]);
  });

  it('leaves out steps that round to the bar or to an earlier step', () => {
    expect(warmupSets(30, kgSetup)).toEqual([
      { weight: 20, reps: 10 },
      { weight: 25, reps: 2 },
    ]);
  });

  it('leaves out steps that round up to the working weight', () => {
    expect(warmupSets(25, { barWeight: 20, plates: [2.5] })).toEqual([{ weight: 20, reps: 10 }]);
  });

  it('needs no warm-ups for a working weight at or below the bar', () => {
    expect(warmupSets(20, kgSetup)).toEqual([]);
    expect(warmupSets(15, kgSetup)).toEqual([]);
  });

  it('ramps to 225 lb on a 45 lb bar', () => {
    expect(warmupSets(225, DEFAULT_PLATE_SETTINGS.lb)).toEqual([
      { weight: 45, reps: 10 },
      { weight: 90, reps: 5 },
      { weight: 135, reps: 3 },
      { weight: 180, reps: 2 },
    ]);
  });

  it('uses only the plates the gym has', () => {
    expect(warmupSets(100, { barWeight: 20, plates: [20] })).toEqual([
      { weight: 20, reps: 10 },
      { weight: 60, reps: 3 },
    ]);
  });
});

describe('increment warm-up sets', () => {
  it('ramps a 30 kg dumbbell at 2.5 kg steps to 12.5 × 5, 17.5 × 3 and 25 × 2 with no bar step', () => {
    expect(incrementWarmupSets(30, 2.5)).toEqual([
      { weight: 12.5, reps: 5 },
      { weight: 17.5, reps: 3 },
      { weight: 25, reps: 2 },
    ]);
  });

  it('leaves out steps that round to nothing, repeat an earlier step or reach the working weight', () => {
    expect(incrementWarmupSets(5, 2.5)).toEqual([{ weight: 2.5, reps: 5 }]);
    expect(incrementWarmupSets(2.5, 2.5)).toEqual([]);
    expect(incrementWarmupSets(0, 2.5)).toEqual([]);
  });

  it('ramps a 50 lb dumbbell at 5 lb steps', () => {
    expect(incrementWarmupSets(50, 5)).toEqual([
      { weight: 20, reps: 5 },
      { weight: 30, reps: 3 },
      { weight: 40, reps: 2 },
    ]);
  });
});

describe('warm-up plan', () => {
  it('ramps a barbell lift above the bar from the bar', () => {
    expect(warmupPlan({ weight: 100, reps: 5 }, { kind: 'barbell', setup: kgSetup })).toEqual(warmupSets(100, kgSetup));
  });

  it('offers one warm-up set at the working weight and reps when a barbell lift is at the bar', () => {
    expect(warmupPlan({ weight: 20, reps: 5 }, { kind: 'barbell', setup: kgSetup })).toEqual([{ weight: 20, reps: 5 }]);
  });

  it('ramps a dumbbell or machine lift in load steps', () => {
    expect(warmupPlan({ weight: 30, reps: 8 }, { kind: 'increment', step: 2.5 })).toEqual(incrementWarmupSets(30, 2.5));
  });

  it('falls back to one warm-up set at the working weight when the load steps leave no ramp', () => {
    expect(warmupPlan({ weight: 2.5, reps: 12 }, { kind: 'increment', step: 2.5 })).toEqual([
      { weight: 2.5, reps: 12 },
    ]);
  });

  it('offers one warm-up set at the working weight and reps for a single ramp', () => {
    expect(warmupPlan({ weight: 12, reps: 10 }, { kind: 'single' })).toEqual([{ weight: 12, reps: 10 }]);
  });
});

describe('warm-up ramp properties', () => {
  const workingWeights = fc.double({ min: 0, max: 500, noNaN: true, noDefaultInfinity: true });
  const reps = fc.integer({ min: 1, max: 30 });
  const ramps: fc.Arbitrary<{ ramp: WarmupRamp; isOnGrid: (weight: number) => boolean; weight: number }> = fc.oneof(
    fc.tuple(fc.constantFrom(2.5, 5), workingWeights).map(([step, weight]) => ({
      ramp: { kind: 'increment' as const, step },
      isOnGrid: (weight: number) => Math.abs(weight / step - Math.round(weight / step)) < 1e-9,
      weight,
    })),
    fc
      .tuple(fc.constantFrom(DEFAULT_PLATE_SETTINGS.kg, DEFAULT_PLATE_SETTINGS.lb), workingWeights)
      .map(([setup, weight]) => ({
        ramp: { kind: 'barbell' as const, setup },
        isOnGrid: (weight: number) => nearestLoadable(weight, setup.barWeight, setup.plates) === weight,
        weight,
      })),
  );

  function isWarmupRamp(plan: readonly WarmupSet[], workingWeight: number): boolean {
    return plan.every(
      (set, index) => set.weight < workingWeight && (index === 0 || set.weight > plan[index - 1].weight),
    );
  }

  it('ramps strictly upward below any working weight, on or off the load grid, in loadable steps and at most 4 sets', () => {
    fc.assert(
      fc.property(ramps, reps, ({ ramp, isOnGrid, weight }, workingReps) => {
        const plan = warmupPlan({ weight, reps: workingReps }, ramp);
        const fellBack = plan.length === 1 && plan[0].weight === weight && plan[0].reps === workingReps;
        expect(plan.length).toBeGreaterThan(0);
        expect(plan.length).toBeLessThanOrEqual(4);
        if (!fellBack) {
          expect(isWarmupRamp(plan, weight)).toBe(true);
          expect(plan.every((set) => isOnGrid(set.weight))).toBe(true);
        }
      }),
    );
  });
});
