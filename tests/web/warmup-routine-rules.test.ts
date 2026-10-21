import { describe, expect, it } from 'vitest';
import type { Exercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import {
  ROUTINE_DRILL_DURATION_S,
  routineDrills,
  routineSummary,
  WARMUP_ROUTINES,
  warmupRoutineFor,
} from '../../web/src/lib/workout/warmup-routine-rules.ts';

function drill(key: string, overrides: Partial<Extract<Exercise, { modality: 'cardio' }>> = {}): Exercise {
  return {
    id: `id-${key}`,
    key,
    name: key,
    equipment: 'bodyweight',
    custom: false,
    archived: false,
    skillShares: [],
    modality: 'cardio',
    activity: {
      paceUnit: 'per_km',
      referencePaceSPerKm: null,
      maxEffort: 'moderate',
      tracksDistance: false,
      shares: [{ skillKey: 'mobility', shareBasisPoints: 10000 }],
    },
    ...overrides,
  };
}

describe('warmupRoutineFor', () => {
  it('gives the squat, deadlift, bench and press their own four-drill routine', () => {
    expect(WARMUP_ROUTINES.map(({ liftKey, name, drillKeys }) => [liftKey, name, drillKeys.join(' ')])).toEqual([
      ['back_squat', 'Squat routine', 'leg_swings hip_circles cossack_squat squat_to_stand'],
      ['deadlift', 'Deadlift routine', 'cat_cow inchworm worlds_greatest_stretch leg_swings'],
      ['barbell_bench_press', 'Bench routine', 'arm_circles band_pull_apart open_book_rotation scapular_push_up'],
      ['overhead_press', 'Press routine', 'arm_circles band_pull_apart open_book_rotation wall_slide'],
    ]);
    expect(warmupRoutineFor('deadlift')?.name).toBe('Deadlift routine');
  });

  it('has no routine for any other lift or a custom lift without a key', () => {
    expect(warmupRoutineFor('dumbbell_curl')).toBeUndefined();
    expect(warmupRoutineFor(null)).toBeUndefined();
    expect(warmupRoutineFor(undefined)).toBeUndefined();
  });
});

describe('routineSummary', () => {
  it('counts the drills and their minutes at one minute each', () => {
    expect(ROUTINE_DRILL_DURATION_S).toBe(60);
    expect(routineSummary(warmupRoutineFor('back_squat')!)).toBe('4 drills · 4 min');
  });
});

describe('routineDrills', () => {
  const squat = warmupRoutineFor('back_squat')!;
  const catalog = ['squat_to_stand', 'hip_circles', 'cossack_squat', 'leg_swings'].map((key) => drill(key));

  it('finds the drills in routine order', () => {
    expect(routineDrills(squat, catalog)?.map((exercise) => exercise.key)).toEqual([
      'leg_swings',
      'hip_circles',
      'cossack_squat',
      'squat_to_stand',
    ]);
  });

  it('has no drills when one is missing, archived or not a timed activity', () => {
    expect(routineDrills(squat, catalog.slice(1))).toBeNull();
    expect(routineDrills(squat, [...catalog.slice(1), drill('leg_swings', { archived: true })])).toBeNull();
    const liftNamedLikeADrill: Exercise = {
      id: 'id-leg_swings',
      key: 'leg_swings',
      name: 'leg_swings',
      equipment: 'bodyweight',
      custom: false,
      archived: false,
      skillShares: [],
      modality: 'lift',
      loadType: 'bodyweight',
    };
    expect(routineDrills(squat, [...catalog.slice(1), liftNamedLikeADrill])).toBeNull();
  });
});
