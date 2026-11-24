import { describe, expect, it } from 'vitest';
import {
  type GarminActivity,
  garminActivityEnd,
  type GarminImportCandidate,
  garminImportCandidate,
  type GarminWorkoutStep,
} from '@domain/index.ts';

const NOW = Date.parse('2026-11-24T12:00:00.000Z');
const RUNNING = 'exercise-running';
const CYCLING = 'exercise-cycling';
const SWIMMING = 'exercise-swimming';
const EXERCISE_BY_TYPE = new Map([
  ['running', RUNNING],
  ['treadmill_running', RUNNING],
  ['indoor_cycling', CYCLING],
  ['lap_swimming', SWIMMING],
]);

function activity(overrides: Partial<GarminActivity> = {}): GarminActivity {
  return {
    type: 'running',
    startedAt: '2026-11-23T06:30:05.000Z',
    durationS: 1800,
    distanceM: 5000,
    laps: [],
    workoutSteps: [],
    ...overrides,
  };
}

function candidateOf(overrides: Partial<GarminActivity> = {}): GarminImportCandidate {
  return garminImportCandidate(activity(overrides), EXERCISE_BY_TYPE, NOW);
}

const WARMUP: GarminWorkoutStep = { intensity: 'warmup', durationS: null };
const COOLDOWN: GarminWorkoutStep = { intensity: 'cooldown', durationS: null };
const WORK: GarminWorkoutStep = { intensity: 'active', durationS: 60 };
const REST: GarminWorkoutStep = { intensity: 'rest', durationS: 30 };
const REPEAT: GarminWorkoutStep = { intensity: null, durationS: null };
const INTERVAL_WORKOUT = [WARMUP, WORK, REST, REPEAT, COOLDOWN];

function lapsOf(...workoutStepIndexes: (number | null)[]) {
  return workoutStepIndexes.map((workoutStepIndex) => ({ workoutStepIndex }));
}

describe('garminImportCandidate', () => {
  it('turns a steady run with distance into one importable Cardio set of the mapped exercise', () => {
    expect(candidateOf()).toEqual({
      startedAt: '2026-11-23T06:30:05.000Z',
      garminType: 'running',
      exerciseId: RUNNING,
      durationS: 1800,
      distanceM: 5000,
      interval: null,
      historyOnly: false,
      status: 'importable',
      rejection: null,
    });
  });

  it('keeps an indoor ride without distance as time only', () => {
    expect(candidateOf({ type: 'indoor_cycling', distanceM: null })).toMatchObject({
      exerciseId: CYCLING,
      durationS: 1800,
      distanceM: null,
      status: 'importable',
    });
  });

  it('treats a measured distance below one metre as no distance', () => {
    expect(candidateOf({ distanceM: 0 }).distanceM).toBeNull();
    expect(candidateOf({ distanceM: 0.94 }).distanceM).toBeNull();
    expect(candidateOf({ distanceM: 1 }).distanceM).toBe(1);
  });

  it('maps a pool swim to Swimming with its pool distance to the decimetre', () => {
    expect(candidateOf({ type: 'lap_swimming', durationS: 840.4, distanceM: 457.2 })).toMatchObject({
      exerciseId: SWIMMING,
      durationS: 840,
      distanceM: 457.2,
      interval: null,
      status: 'importable',
    });
    expect(candidateOf({ distanceM: 2500.55 }).distanceM).toBe(2500.6);
  });

  it('identifies an activity by its start time in UTC, cut to the second', () => {
    expect(candidateOf({ startedAt: '2026-11-23T07:30:05.987+01:00' }).startedAt).toBe('2026-11-23T06:30:05.000Z');
  });

  it('never makes sets from laps: auto laps without a workout stay one steady set', () => {
    expect(candidateOf({ laps: lapsOf(null, null, null, null, null) })).toMatchObject({
      durationS: 1800,
      distanceM: 5000,
      interval: null,
    });
  });

  it('fills an interval from a structured workout whose laps alternate work and rest', () => {
    expect(candidateOf({ workoutSteps: INTERVAL_WORKOUT, laps: lapsOf(0, 1, 2, 1, 2, 1, 2, 1, 2, 4) })).toMatchObject({
      durationS: 1800,
      distanceM: 5000,
      interval: { workS: 60, restS: 30, rounds: 4 },
      status: 'importable',
    });
  });

  it('counts the rounds done, with or without a rest after the last one', () => {
    expect(candidateOf({ workoutSteps: INTERVAL_WORKOUT, laps: lapsOf(0, 1, 2, 1, 2, 1, 4) }).interval).toEqual({
      workS: 60,
      restS: 30,
      rounds: 3,
    });
  });

  it('reads interval and recovery steps as work and rest', () => {
    const workoutSteps: GarminWorkoutStep[] = [
      { intensity: 'interval', durationS: 240 },
      { intensity: 'recovery', durationS: 120.2 },
    ];
    expect(candidateOf({ workoutSteps, laps: lapsOf(0, 1, 0, 1, 0) }).interval).toEqual({
      workS: 240,
      restS: 120,
      rounds: 3,
    });
  });

  it.each<[string, Partial<GarminActivity>]>([
    ['a workout without laps', { workoutSteps: INTERVAL_WORKOUT, laps: [] }],
    ['a single round', { workoutSteps: INTERVAL_WORKOUT, laps: lapsOf(0, 1, 2, 4) }],
    ['work steps with no rest between', { workoutSteps: INTERVAL_WORKOUT, laps: lapsOf(1, 1, 1) }],
    ['a rest before the first work step', { workoutSteps: INTERVAL_WORKOUT, laps: lapsOf(2, 1, 2, 1) }],
    [
      'work steps of different lengths',
      { workoutSteps: [WORK, REST, { intensity: 'active', durationS: 90 }], laps: lapsOf(0, 1, 2, 1, 0) },
    ],
    [
      'rest steps of different lengths',
      { workoutSteps: [WORK, REST, { intensity: 'rest', durationS: 45 }], laps: lapsOf(0, 1, 0, 2, 0) },
    ],
    [
      'a work step measured by distance, not time',
      { workoutSteps: [{ intensity: 'active', durationS: null }, REST], laps: lapsOf(0, 1, 0, 1, 0) },
    ],
    [
      'a work step longer than an hour',
      { workoutSteps: [{ intensity: 'active', durationS: 3601 }, REST], laps: lapsOf(0, 1, 0), durationS: 9000 },
    ],
    [
      'a work step shorter than five seconds',
      { workoutSteps: [{ ...WORK, durationS: 4 }, REST], laps: lapsOf(0, 1, 0) },
    ],
    ['laps that point at no workout step', { workoutSteps: INTERVAL_WORKOUT, laps: lapsOf(7, 8, 7, 8, 7) }],
    [
      'more than a hundred rounds',
      {
        workoutSteps: [
          { ...WORK, durationS: 10 },
          { ...REST, durationS: 10 },
        ],
        laps: lapsOf(...Array.from({ length: 202 }, (_, index) => index % 2)),
      },
    ],
  ])('falls back to one steady set for %s', (_case, overrides) => {
    expect(candidateOf(overrides)).toMatchObject({ durationS: overrides.durationS ?? 1800, interval: null });
  });

  it('asks for an exercise when the Garmin type is not in the mapping', () => {
    expect(candidateOf({ type: 'stand_up_paddleboarding' })).toMatchObject({
      garminType: 'stand_up_paddleboarding',
      exerciseId: null,
      durationS: 1800,
      distanceM: 5000,
      status: 'needs_exercise',
      rejection: null,
    });
    expect(candidateOf({ type: null })).toMatchObject({ garminType: null, exerciseId: null, status: 'needs_exercise' });
  });

  it('rejects an activity over four hours, and takes one of exactly four hours', () => {
    expect(candidateOf({ durationS: 14_401 })).toMatchObject({
      exerciseId: RUNNING,
      durationS: 14_401,
      status: 'rejected',
      rejection: 'too_long',
    });
    expect(candidateOf({ durationS: 14_400.4 })).toMatchObject({ durationS: 14_400, status: 'importable' });
  });

  it('rejects an activity over 200 km, and takes one of exactly 200 km', () => {
    expect(candidateOf({ type: 'indoor_cycling', durationS: 14_000, distanceM: 200_000.1 })).toMatchObject({
      distanceM: 200_000.1,
      status: 'rejected',
      rejection: 'too_far',
    });
    expect(candidateOf({ type: 'indoor_cycling', durationS: 14_000, distanceM: 200_000 }).status).toBe('importable');
  });

  it('rejects an activity under a minute, the shortest Cardio set', () => {
    expect(candidateOf({ durationS: 59.4 })).toMatchObject({
      durationS: 59,
      status: 'rejected',
      rejection: 'too_short',
    });
    expect(candidateOf({ durationS: 59.5 })).toMatchObject({ durationS: 60, status: 'importable' });
  });

  it('marks an activity older than seven days as history only', () => {
    expect(candidateOf({ startedAt: '2026-11-17T11:59:59.000Z' })).toMatchObject({
      exerciseId: RUNNING,
      historyOnly: true,
      status: 'history_only',
      rejection: null,
    });
    expect(candidateOf({ startedAt: '2026-11-17T12:00:00.000Z' })).toMatchObject({
      historyOnly: false,
      status: 'importable',
    });
  });

  it('asks for an exercise first on an old unmapped activity, and still says it is history only', () => {
    expect(candidateOf({ type: 'surfing', startedAt: '2026-10-01T08:00:00.000Z' })).toMatchObject({
      historyOnly: true,
      status: 'needs_exercise',
    });
  });

  it('rejects a strength activity, mapped or not', () => {
    const withStrengthMapped = new Map([...EXERCISE_BY_TYPE, ['strength_training', RUNNING]]);
    const strength = activity({ type: 'strength_training', distanceM: null });
    expect(garminImportCandidate(strength, EXERCISE_BY_TYPE, NOW)).toMatchObject({
      garminType: 'strength_training',
      exerciseId: null,
      status: 'rejected',
      rejection: 'strength',
    });
    expect(garminImportCandidate(strength, withStrengthMapped, NOW)).toMatchObject({
      exerciseId: null,
      rejection: 'strength',
    });
  });

  it.each<[string, Partial<GarminActivity>]>([
    ['no start time', { startedAt: '' }],
    ['a start time that is no date', { startedAt: 'yesterday' }],
    ['no duration', { durationS: Number.NaN }],
    ['a negative duration', { durationS: -5 }],
    ['a negative distance', { distanceM: -1 }],
  ])('rejects an activity with %s as unreadable', (_case, overrides) => {
    expect(candidateOf(overrides)).toEqual({
      startedAt: null,
      garminType: 'running',
      exerciseId: null,
      durationS: null,
      distanceM: null,
      interval: null,
      historyOnly: false,
      status: 'rejected',
      rejection: 'unreadable',
    });
  });

  it('sets no Effort: a candidate carries only time, distance and interval', () => {
    expect(Object.keys(candidateOf()).sort()).toEqual(
      [
        'distanceM',
        'durationS',
        'exerciseId',
        'garminType',
        'historyOnly',
        'interval',
        'rejection',
        'startedAt',
        'status',
      ].sort(),
    );
  });
});

describe('garminActivityEnd', () => {
  it('ends an activity its whole duration after its start', () => {
    expect(garminActivityEnd({ startedAt: '2026-11-23T06:30:05.000Z', durationS: 1800 })).toBe(
      '2026-11-23T07:00:05.000Z',
    );
  });
});
