import { describe, expect, it } from 'vitest';
import {
  type GarminActivity,
  garminActivityEnd,
  GARMIN_IMPORT_CHUNK,
  garminImportChunks,
  type GarminImportCandidate,
  garminImportCandidate,
  type GarminSet,
  type GarminWorkoutStep,
  MAX_SETS_PER_SESSION,
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
    sets: [],
    ...overrides,
  };
}

const BENCH_SET: GarminSet = { category: 'bench_press', reps: 8, weightKg: 60 };

function strengthCandidateOf(overrides: Partial<GarminActivity> = {}): GarminImportCandidate {
  return candidateOf({
    type: 'strength_training',
    durationS: 3000,
    distanceM: null,
    sets: [BENCH_SET, BENCH_SET, { category: 'row', reps: 10, weightKg: 40 }],
    ...overrides,
  });
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
const LONG_INTERVAL_WORKOUT: GarminWorkoutStep[] = [
  { intensity: 'warmup', durationS: 600 },
  { intensity: 'interval', durationS: 480 },
  { intensity: 'recovery', durationS: 120 },
  REPEAT,
  { intensity: 'cooldown', durationS: 600 },
];

function lapsOf(...workoutStepIndexes: (number | null)[]) {
  return workoutStepIndexes.map((workoutStepIndex) => ({ workoutStepIndex, durationS: null }));
}

function timedLaps(...laps: [workoutStepIndex: number | null, durationS: number][]) {
  return laps.map(([workoutStepIndex, durationS]) => ({ workoutStepIndex, durationS }));
}

describe('garminImportCandidate', () => {
  it('turns a steady run with distance into one importable Cardio set of the mapped exercise', () => {
    expect(candidateOf()).toEqual({
      kind: 'cardio',
      setGroups: [],
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

  it('counts a step once when auto lap cuts it into laps whose time adds up to the step', () => {
    const laps = timedLaps([0, 356], [1, 300], [1, 180], [2, 120], [1, 291], [1, 190], [4, 380], [4, 221], [null, 12]);
    expect(candidateOf({ workoutSteps: LONG_INTERVAL_WORKOUT, laps, durationS: 2050 }).interval).toEqual({
      workS: 480,
      restS: 120,
      rounds: 2,
    });
  });

  it('counts a repeated work step as many times as its laps add up to, so repeats with no rest stay one steady set', () => {
    const workoutSteps: GarminWorkoutStep[] = [WARMUP, { ...WORK, durationS: 90 }, REPEAT, { ...REST, durationS: 90 }];
    const fourThenRestThenFour = timedLaps([0, 300], [1, 90], [1, 90], [1, 90], [1, 90], [3, 90], [1, 180], [1, 180]);
    expect(candidateOf({ workoutSteps, laps: fourThenRestThenFour }).interval).toBeNull();
  });

  it.each<[string, ReturnType<typeof timedLaps>]>([
    ['a last work step stopped early', timedLaps([1, 480], [2, 120], [1, 200])],
    ['a work step skipped after a few seconds', timedLaps([1, 480], [2, 120], [1, 9], [2, 120], [1, 480])],
    [
      'a lap without a step between two laps of one step',
      timedLaps([1, 240], [null, 10], [1, 240], [2, 120], [1, 480]),
    ],
  ])('falls back to one steady set for %s', (_case, laps) => {
    expect(candidateOf({ workoutSteps: LONG_INTERVAL_WORKOUT, laps, durationS: 2050 }).interval).toBeNull();
  });

  it('reads no step from a lap index that is negative or between two steps', () => {
    const workoutSteps: GarminWorkoutStep[] = [WORK, REST];
    expect(candidateOf({ workoutSteps, laps: lapsOf(-2, -1, -2) }).interval).toBeNull();
    expect(candidateOf({ workoutSteps, laps: lapsOf(0.5, 1.5, 0.2) }).interval).toBeNull();
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
    [
      'a workout cut short, so the planned interval is longer than the activity',
      {
        workoutSteps: [
          { intensity: 'active', durationS: 300 },
          { intensity: 'rest', durationS: 120 },
        ],
        laps: lapsOf(0, 1, 0, 1, 0, 1, 0),
        durationS: 600,
      },
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

  it('rejects an activity over twelve hours, the longest Cardio set, and takes one of exactly twelve', () => {
    expect(candidateOf({ durationS: 43_201 })).toMatchObject({
      startedAt: '2026-11-23T06:30:05.000Z',
      exerciseId: RUNNING,
      durationS: 43_201,
      status: 'rejected',
      rejection: 'too_long',
    });
    expect(candidateOf({ durationS: 43_200.4 })).toMatchObject({ durationS: 43_200, status: 'importable' });
  });

  it('says too long for a strength activity left running over half a day', () => {
    expect(strengthCandidateOf({ durationS: 13 * 3600 })).toMatchObject({
      kind: 'strength',
      status: 'rejected',
      rejection: 'too_long',
      setGroups: [],
    });
  });

  it('keeps an interval that fills the activity exactly', () => {
    const workoutSteps: GarminWorkoutStep[] = [
      { intensity: 'active', durationS: 60 },
      { intensity: 'rest', durationS: 30 },
    ];
    expect(candidateOf({ workoutSteps, laps: lapsOf(0, 1, 0), durationS: 150 }).interval).toEqual({
      workS: 60,
      restS: 30,
      rounds: 2,
    });
    expect(candidateOf({ workoutSteps, laps: lapsOf(0, 1, 0), durationS: 149 }).interval).toBeNull();
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

  it('carries the set groups of a strength activity, with no exercise, distance or interval of its own', () => {
    expect(strengthCandidateOf()).toEqual({
      kind: 'strength',
      startedAt: '2026-11-23T06:30:05.000Z',
      garminType: 'strength_training',
      exerciseId: null,
      durationS: 3000,
      distanceM: null,
      interval: null,
      setGroups: [
        {
          category: 'bench_press',
          sets: [
            { reps: 8, weightKg: 60 },
            { reps: 8, weightKg: 60 },
          ],
          leftOut: 0,
        },
        { category: 'row', sets: [{ reps: 10, weightKg: 40 }], leftOut: 0 },
      ],
      historyOnly: false,
      status: 'importable',
      rejection: null,
    });
  });

  it('never gives a strength activity an exercise from the activity type table', () => {
    const withStrengthMapped = new Map([...EXERCISE_BY_TYPE, ['strength_training', RUNNING]]);
    const strength = activity({ type: 'strength_training', distanceM: null, sets: [BENCH_SET] });
    expect(garminImportCandidate(strength, withStrengthMapped, NOW)).toMatchObject({
      kind: 'strength',
      exerciseId: null,
      status: 'importable',
    });
  });

  it('marks a strength activity older than the edit window as history only', () => {
    expect(strengthCandidateOf({ startedAt: '2026-10-01T08:00:00.000Z' })).toMatchObject({
      historyOnly: true,
      status: 'history_only',
    });
  });

  it('has no shortest duration for a strength activity', () => {
    expect(strengthCandidateOf({ durationS: 20 })).toMatchObject({ durationS: 20, status: 'importable' });
  });

  it('rejects a strength activity with no set that can be imported', () => {
    expect(strengthCandidateOf({ sets: [] })).toMatchObject({
      kind: 'strength',
      status: 'rejected',
      rejection: 'no_sets',
    });
    expect(strengthCandidateOf({ sets: [{ category: 'plank', reps: null, weightKg: 0 }] })).toMatchObject({
      status: 'rejected',
      rejection: 'no_sets',
      setGroups: [],
    });
  });

  it('rejects a strength activity with more sets than a Session allows, and takes one at the limit', () => {
    const setsOf = (count: number) => Array.from({ length: count }, () => BENCH_SET);
    expect(strengthCandidateOf({ sets: setsOf(MAX_SETS_PER_SESSION + 1) })).toMatchObject({
      status: 'rejected',
      rejection: 'too_many_sets',
    });
    expect(strengthCandidateOf({ sets: setsOf(MAX_SETS_PER_SESSION) }).status).toBe('importable');
  });

  it('ignores the sets of an activity that is no strength activity', () => {
    expect(candidateOf({ sets: [BENCH_SET] })).toMatchObject({ kind: 'cardio', setGroups: [], status: 'importable' });
  });

  it('reads a strength activity that starts in the future as unreadable', () => {
    expect(strengthCandidateOf({ startedAt: '2026-11-25T06:30:05.000Z' })).toMatchObject({
      kind: 'strength',
      status: 'rejected',
      rejection: 'unreadable',
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
      kind: 'cardio',
      setGroups: [],
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

  it('rejects an activity that starts or ends in the future as unreadable, allowing a little clock skew', () => {
    expect(candidateOf({ startedAt: '2026-11-24T12:30:00.000Z' })).toMatchObject({
      startedAt: null,
      status: 'rejected',
      rejection: 'unreadable',
    });
    expect(candidateOf({ startedAt: '2026-11-24T11:45:00.000Z', durationS: 1800 }).rejection).toBe('unreadable');
    expect(candidateOf({ startedAt: '2026-11-24T11:34:00.000Z', durationS: 1800 }).status).toBe('importable');
  });

  it('sets no Effort: a candidate carries only time, distance, interval and set groups', () => {
    expect(Object.keys(candidateOf()).sort()).toEqual(
      [
        'distanceM',
        'durationS',
        'exerciseId',
        'garminType',
        'historyOnly',
        'interval',
        'kind',
        'rejection',
        'setGroups',
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

describe('garminImportChunks', () => {
  const scored = (name: string) => ({ name, historyOnly: false });
  const old = (name: string) => ({ name, historyOnly: true });
  const names = (chunks: { name: string }[][]) => chunks.map((chunk) => chunk.map((activity) => activity.name));

  it('sends at most 50 activities and at most 10 scored ones in a request', () => {
    expect(GARMIN_IMPORT_CHUNK).toEqual({ maxActivities: 50, maxScored: 10 });
  });

  it('keeps a small import in one chunk, in the order given', () => {
    expect(names(garminImportChunks([old('a'), scored('b'), old('c')]))).toEqual([['a', 'b', 'c']]);
    expect(garminImportChunks([])).toEqual([]);
  });

  it('starts a new chunk after 50 activities', () => {
    const activities = Array.from({ length: 120 }, (_, index) => old(`old-${index}`));
    const chunks = garminImportChunks(activities);
    expect(chunks.map((chunk) => chunk.length)).toEqual([50, 50, 20]);
    expect(chunks.flat()).toEqual(activities);
  });

  it('starts a new chunk before an eleventh scored activity', () => {
    const activities = [
      ...Array.from({ length: 12 }, (_, index) => old(`old-${index}`)),
      ...Array.from({ length: 23 }, (_, index) => scored(`scored-${index}`)),
    ];
    const chunks = garminImportChunks(activities);
    expect(chunks.map((chunk) => chunk.length)).toEqual([22, 10, 3]);
    expect(chunks.map((chunk) => chunk.filter((activity) => !activity.historyOnly).length)).toEqual([10, 10, 3]);
    expect(chunks.flat()).toEqual(activities);
  });

  it('lets history-only activities fill a chunk that already holds 10 scored ones', () => {
    const activities = [
      ...Array.from({ length: 10 }, (_, index) => scored(`scored-${index}`)),
      ...Array.from({ length: 45 }, (_, index) => old(`old-${index}`)),
    ];
    expect(garminImportChunks(activities).map((chunk) => chunk.length)).toEqual([50, 5]);
  });
});
