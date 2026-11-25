import { describe, expect, it } from 'vitest';
import { garminActivitiesFromFit, garminTypeOfFitSport } from '../../web/src/lib/garmin/fit-activity-rules.ts';

function session(overrides: Record<string, unknown> = {}) {
  return {
    start_time: new Date('2026-11-23T06:30:05.000Z'),
    total_timer_time: 1800.4,
    total_elapsed_time: 1900,
    total_distance: 5000.55,
    sport: 'running',
    sub_sport: 'generic',
    ...overrides,
  };
}

function index(value: number) {
  return { value, reserved: false, selected: false };
}

describe('garminTypeOfFitSport', () => {
  it.each<[string | null, string | null, string | null]>([
    ['running', 'generic', 'running'],
    ['running', null, 'running'],
    ['running', 'treadmill', 'treadmill_running'],
    ['running', 'trail', 'trail_running'],
    ['cycling', 'generic', 'cycling'],
    ['cycling', 'indoor_cycling', 'indoor_cycling'],
    ['cycling', 'virtual_activity', 'virtual_ride'],
    ['swimming', 'lap_swimming', 'lap_swimming'],
    ['swimming', 'open_water', 'open_water_swimming'],
    ['walking', 'generic', 'walking'],
    ['hiking', 'generic', 'hiking'],
    ['rowing', 'indoor_rowing', 'indoor_rowing'],
    ['fitness_equipment', 'indoor_rowing', 'indoor_rowing'],
    ['fitness_equipment', 'elliptical', 'elliptical'],
    ['fitness_equipment', 'stair_climbing', 'stair_climbing'],
    ['training', 'strength_training', 'strength_training'],
    ['training', 'cardio_training', 'indoor_cardio'],
  ])('reads %s with %s as the Garmin type %s', (sport, subSport, type) => {
    expect(garminTypeOfFitSport(sport, subSport)).toBe(type);
  });

  it('falls back to the sport for a sub sport Garmin Connect has no own type for', () => {
    expect(garminTypeOfFitSport('walking', 'casual_walking')).toBe('walking');
    expect(garminTypeOfFitSport('running', 'track')).toBe('running');
    expect(garminTypeOfFitSport('cycling', 'road')).toBe('cycling');
  });

  it('names an activity on gym equipment or in training after its sub sport', () => {
    expect(garminTypeOfFitSport('training', 'yoga')).toBe('yoga');
    expect(garminTypeOfFitSport('fitness_equipment', 'generic')).toBe('fitness_equipment');
    expect(garminTypeOfFitSport('training', null)).toBe('training');
  });

  it('has no type for a sport the parser could not name', () => {
    expect(garminTypeOfFitSport(null, null)).toBeNull();
    expect(garminTypeOfFitSport(null, 'generic')).toBeNull();
  });
});

describe('garminActivitiesFromFit', () => {
  it('reads one activity per session: type, start, timer time and distance', () => {
    expect(garminActivitiesFromFit({ sessions: [session()], laps: [] })).toEqual([
      {
        type: 'running',
        startedAt: '2026-11-23T06:30:05.000Z',
        durationS: 1800.4,
        distanceM: 5000.55,
        laps: [],
        workoutSteps: [],
        sets: [],
      },
    ]);
  });

  it('reads a start time given as text', () => {
    const [activity] = garminActivitiesFromFit({ sessions: [session({ start_time: '2026-11-23T06:30:05.000Z' })] });
    expect(activity.startedAt).toBe('2026-11-23T06:30:05.000Z');
  });

  it('uses elapsed time only when the watch wrote no timer time', () => {
    const [activity] = garminActivitiesFromFit({ sessions: [session({ total_timer_time: undefined })] });
    expect(activity.durationS).toBe(1900);
  });

  it('has no distance when the file has none or a zero', () => {
    expect(garminActivitiesFromFit({ sessions: [session({ total_distance: undefined })] })[0].distanceM).toBeNull();
    expect(garminActivitiesFromFit({ sessions: [session({ total_distance: 0 })] })[0].distanceM).toBeNull();
  });

  it('leaves a session without a start or a duration for the mapping to reject', () => {
    const [noStart, noDuration] = garminActivitiesFromFit({
      sessions: [
        session({ start_time: undefined }),
        session({ total_timer_time: undefined, total_elapsed_time: undefined }),
      ],
    });
    expect(noStart.startedAt).toBe('');
    expect(noDuration.durationS).toBeNaN();
  });

  it('reads an unknown sport number as no type', () => {
    expect(garminActivitiesFromFit({ sessions: [session({ sport: 93, sub_sport: 112 })] })[0].type).toBeNull();
  });

  it('reads the workout steps in step order, with a duration only for timed steps', () => {
    const parsed = {
      sessions: [session()],
      laps: [{ wkt_step_index: index(1), total_timer_time: 60.4 }, { wkt_step_index: index(2) }, {}],
      messages: {
        workout_step: [
          { message_index: index(2), duration_type: 'time', duration_value: 30_000, intensity: 'rest' },
          { message_index: index(0), duration_type: 'open', intensity: 'warmup' },
          { message_index: index(1), duration_type: 'time', duration_value: 60_000, intensity: 'active' },
          { message_index: index(4), duration_type: 'distance', duration_value: 100_000, intensity: 'active' },
        ],
      },
    };
    expect(garminActivitiesFromFit(parsed)[0]).toMatchObject({
      laps: [
        { workoutStepIndex: 1, durationS: 60.4 },
        { workoutStepIndex: 2, durationS: null },
        { workoutStepIndex: null, durationS: null },
      ],
      workoutSteps: [
        { intensity: 'warmup', durationS: null },
        { intensity: 'active', durationS: 60 },
        { intensity: 'rest', durationS: 30 },
        { intensity: null, durationS: null },
        { intensity: 'active', durationS: null },
      ],
    });
  });

  it('gives each session of a multisport file its own laps', () => {
    const laps = [{ wkt_step_index: index(0) }, { wkt_step_index: index(1) }, { wkt_step_index: index(2) }];
    const [swim, ride] = garminActivitiesFromFit({
      sessions: [
        session({ sport: 'swimming', sub_sport: 'open_water', first_lap_index: 0, num_laps: 1 }),
        session({ sport: 'cycling', first_lap_index: 1, num_laps: 2 }),
      ],
      laps,
    });
    expect(swim.laps).toEqual([{ workoutStepIndex: 0, durationS: null }]);
    expect(ride.laps).toEqual([
      { workoutStepIndex: 1, durationS: null },
      { workoutStepIndex: 2, durationS: null },
    ]);
  });

  it('gives a multisport file without lap ranges no laps, so each session stays one steady set', () => {
    const activities = garminActivitiesFromFit({
      sessions: [session(), session({ sport: 'cycling' })],
      laps: [{ wkt_step_index: index(0) }],
    });
    expect(activities.map((activity) => activity.laps)).toEqual([[], []]);
  });

  it('reads the active sets in file order: first category, reps and weight in kilograms', () => {
    const [strength] = garminActivitiesFromFit({
      sessions: [session({ sport: 'training', sub_sport: 'strength_training', total_distance: undefined })],
      sets: [
        { set_type: 'active', category: ['bench_press', 'push_up', 'flye'], repetitions: 8, weight: 60 },
        { set_type: 'rest', duration: 90 },
        { set_type: 'active', category: ['unknown', 'unknown', 'row'], repetitions: 12, weight: 0 },
        { set_type: 'active', category: 'pull_up', repetitions: 5 },
        { set_type: 'active', category: [65534, 65534, 65534], repetitions: 10, weight: 20 },
        { set_type: 'active', repetitions: 10, weight: 20 },
        { set_type: 'active', category: ['plank'], weight: 0 },
        'not a message',
      ],
    });
    expect(strength.sets).toEqual([
      { category: 'bench_press', reps: 8, weightKg: 60 },
      { category: null, reps: 12, weightKg: 0 },
      { category: 'pull_up', reps: 5, weightKg: null },
      { category: null, reps: 10, weightKg: 20 },
      { category: null, reps: 10, weightKg: 20 },
      { category: 'plank', reps: null, weightKg: 0 },
    ]);
  });

  it('gives each session of a multisport file the sets that start within its time', () => {
    const at = (time: string) => new Date(`2026-11-23T${time}.000Z`);
    const [strength, run] = garminActivitiesFromFit({
      sessions: [
        session({
          sport: 'training',
          sub_sport: 'strength_training',
          start_time: at('06:30:05'),
          total_elapsed_time: 600,
        }),
        session({ start_time: at('06:40:05'), total_elapsed_time: 600 }),
      ],
      sets: [
        { set_type: 'active', category: ['row'], repetitions: 10, weight: 40, start_time: at('06:31:00') },
        { set_type: 'active', category: ['row'], repetitions: 9, weight: 40, start_time: at('06:40:04') },
        { set_type: 'active', category: ['row'], repetitions: 8, weight: 40, start_time: at('06:40:05') },
        { set_type: 'active', category: ['row'], repetitions: 7, weight: 40 },
      ],
    });
    expect(strength.sets.map((set) => set.reps)).toEqual([10, 9]);
    expect(run.sets.map((set) => set.reps)).toEqual([8]);
  });

  it.each([null, undefined, 'FIT', 7, [], {}, { sessions: 'none' }, { sessions: [null, 'x'] }])(
    'reads %j as a file without activities',
    (parsed) => {
      expect(garminActivitiesFromFit(parsed)).toEqual([]);
    },
  );
});
