import { describe, expect, it } from 'vitest';
import { DEFAULT_PLATE_SETTINGS } from '../../web/src/lib/plate-rules.ts';
import { warmupPlan, warmupSets } from '../../web/src/lib/warmup-rules.ts';

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

describe('warm-up plan', () => {
  it('ramps a barbell lift above the bar from the bar', () => {
    expect(warmupPlan({ weight: 100, reps: 5 }, kgSetup)).toEqual(warmupSets(100, kgSetup));
  });

  it('offers one warm-up set at the working weight and reps when a barbell lift is at the bar', () => {
    expect(warmupPlan({ weight: 20, reps: 5 }, kgSetup)).toEqual([{ weight: 20, reps: 5 }]);
  });

  it('offers one warm-up set at the working weight and reps for a lift without a barbell', () => {
    expect(warmupPlan({ weight: 12, reps: 10 }, null)).toEqual([{ weight: 12, reps: 10 }]);
  });
});
