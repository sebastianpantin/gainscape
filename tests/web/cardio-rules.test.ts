import { describe, expect, it } from 'vitest';
import { boutDurationSeconds, CARDIO_BOUNDS } from '../../supabase/functions/_shared/domain/cardio.ts';
import {
  boutModeChanges,
  canAddBout,
  cardioRecordCards,
  describeCardioGains,
  DEFAULT_INTERVAL,
  clampedDistanceM,
  clampedInterval,
  clampedSteadyDurationS,
  describeBout,
  distanceFromInput,
  formatDuration,
  holdRecordCards,
  isLoggableBout,
} from '../../web/src/lib/cardio-rules.ts';

const steady = { durationS: 1800, distanceM: 5000, interval: null, effort: null };
const intervals = { durationS: 1800, distanceM: null, interval: { workS: 30, restS: 30, rounds: 10 }, effort: null };

describe('steady duration', () => {
  it('stays within the steady bounds the server checks', () => {
    expect(clampedSteadyDurationS(30)).toBe(CARDIO_BOUNDS.steadyDurationS.min);
    expect(clampedSteadyDurationS(20_000)).toBe(CARDIO_BOUNDS.steadyDurationS.max);
    expect(clampedSteadyDurationS(1500)).toBe(1500);
  });

  it('rounds to whole seconds', () => {
    expect(clampedSteadyDurationS(90.4)).toBe(90);
  });
});

describe('interval template', () => {
  it('clamps each field to its bounds', () => {
    expect(clampedInterval({ workS: 2, restS: -10, rounds: 0 })).toEqual({
      workS: CARDIO_BOUNDS.intervalWorkS.min,
      restS: CARDIO_BOUNDS.intervalRestS.min,
      rounds: CARDIO_BOUNDS.intervalRounds.min,
    });
    expect(clampedInterval({ workS: 5000, restS: 5000, rounds: 500 }).workS).toBe(CARDIO_BOUNDS.intervalWorkS.max);
  });

  it('drops rounds until the derived duration fits in 4 hours', () => {
    const clamped = clampedInterval({ workS: 3600, restS: 3600, rounds: 100 });
    expect(clamped).toEqual({ workS: 3600, restS: 3600, rounds: 2 });
    expect(boutDurationSeconds({ ...intervals, interval: clamped })).toBeLessThanOrEqual(
      CARDIO_BOUNDS.intervalDurationS.max,
    );
  });

  it('keeps a template that already fits', () => {
    expect(clampedInterval({ workS: 30, restS: 30, rounds: 10 })).toEqual({ workS: 30, restS: 30, rounds: 10 });
  });

  it('allows a single 5-second sprint', () => {
    expect(clampedInterval({ workS: 5, restS: 0, rounds: 1 })).toEqual({ workS: 5, restS: 0, rounds: 1 });
    expect(boutDurationSeconds({ ...intervals, interval: { workS: 5, restS: 0, rounds: 1 } })).toBe(5);
  });
});

describe('bout duration', () => {
  it('is the logged duration for a steady bout', () => {
    expect(boutDurationSeconds(steady)).toBe(1800);
  });

  it('is rounds of work with the rest between them for an interval bout', () => {
    expect(boutDurationSeconds(intervals)).toBe(10 * 30 + 9 * 30);
  });
});

describe('distance', () => {
  it('keeps an empty distance empty', () => {
    expect(clampedDistanceM(null)).toBeNull();
  });

  it('stays within the distance bounds at 0.1 m', () => {
    expect(clampedDistanceM(0.2)).toBe(CARDIO_BOUNDS.distanceM.min);
    expect(clampedDistanceM(300_000)).toBe(CARDIO_BOUNDS.distanceM.max);
    expect(clampedDistanceM(5000.04)).toBe(5000);
  });
});

describe('adding bouts', () => {
  it('allows another bout while the bouts add up to less than 4 hours', () => {
    expect(canAddBout([steady, intervals])).toBe(true);
  });

  it('stops adding bouts once they add up to 4 hours', () => {
    const long = { ...steady, durationS: CARDIO_BOUNDS.steadyDurationS.max / 2 };
    expect(canAddBout([long])).toBe(true);
    expect(canAddBout([long, long])).toBe(false);
  });
});

describe('bout text', () => {
  it('formats durations in hours, minutes and seconds', () => {
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(1800)).toBe('30 min');
    expect(formatDuration(1830)).toBe('30 min 30 s');
    expect(formatDuration(3900)).toBe('1 h 5 min');
    expect(formatDuration(0)).toBe('0 s');
  });

  it('describes a steady bout with its distance and pace', () => {
    expect(describeBout(steady, 'km')).toBe('30 min · 5 km · 6:00 /km');
    expect(describeBout({ ...steady, distanceM: null }, 'km')).toBe('30 min');
  });

  it('describes an interval bout by its template', () => {
    expect(describeBout(intervals, 'km')).toBe('10 × 30 s / 30 s rest');
    expect(describeBout({ ...intervals, distanceM: 2000 }, 'mi')).toBe('10 × 30 s / 30 s rest · 1.24 mi');
    expect(describeBout({ ...intervals, interval: { workS: 20, restS: 0, rounds: 8 } }, 'km')).toBe('8 × 20 s');
  });
});

describe('loggable bouts', () => {
  it('accepts bouts inside the server bounds', () => {
    expect(isLoggableBout(steady)).toBe(true);
    expect(isLoggableBout(intervals)).toBe(true);
    expect(isLoggableBout({ ...intervals, interval: { workS: 5, restS: 0, rounds: 1 } })).toBe(true);
  });

  it.each([
    ['a 30-second steady bout', { ...steady, durationS: 30 }],
    ['a fractional duration', { ...steady, durationS: 90.5 }],
    ['a duration that is not a number', { ...steady, durationS: Number.NaN }],
    ['a zero distance', { ...steady, distanceM: 0 }],
    ['a distance beyond 200 km', { ...steady, distanceM: 200_001 }],
    ['zero rounds', { ...intervals, interval: { workS: 30, restS: 30, rounds: 0 } }],
    ['a 4-second sprint', { ...intervals, interval: { workS: 4, restS: 0, rounds: 1 } }],
    ['intervals longer than 4 hours', { ...intervals, interval: { workS: 3600, restS: 3600, rounds: 3 } }],
    ['a lift effort', { ...steady, effort: { type: 'level', level: 'hard' } as const }],
  ])('rejects %s', (_, bout) => {
    expect(isLoggableBout(bout)).toBe(false);
  });
});

describe('switching a bout between steady and intervals', () => {
  it('starts intervals from the default template and keeps the steady duration for later', () => {
    expect(boutModeChanges(steady, 'intervals')).toEqual({ interval: DEFAULT_INTERVAL });
    expect(isLoggableBout({ ...steady, ...boutModeChanges(steady, 'intervals') })).toBe(true);
  });

  it('turns the template into a steady duration of the same length when switching back', () => {
    expect(boutModeChanges(intervals, 'steady')).toEqual({ interval: null, durationS: 570 });
  });

  it('raises a short template to the shortest steady bout so the server accepts it', () => {
    const sprint = { ...intervals, durationS: 30, interval: { workS: 30, restS: 0, rounds: 1 } };
    const changes = boutModeChanges(sprint, 'steady');
    expect(changes).toEqual({ interval: null, durationS: CARDIO_BOUNDS.steadyDurationS.min });
    expect(isLoggableBout({ ...sprint, ...changes })).toBe(true);
  });

  it('changes nothing when the bout already has that type', () => {
    expect(boutModeChanges(intervals, 'intervals')).toEqual({});
    expect(boutModeChanges(steady, 'steady')).toEqual({});
  });
});

describe('distance input', () => {
  it('treats an empty or zero distance as no distance', () => {
    expect(distanceFromInput(null, 'km')).toBeNull();
    expect(distanceFromInput(0, 'km')).toBeNull();
    expect(distanceFromInput(-1, 'mi')).toBeNull();
  });

  it('stores a typed distance in metres within the bounds', () => {
    expect(distanceFromInput(5, 'km')).toBe(5000);
    expect(distanceFromInput(0.0001, 'km')).toBe(CARDIO_BOUNDS.distanceM.min);
    expect(distanceFromInput(400, 'yd')).toBe(365.8);
  });
});

describe('cardio record text', () => {
  it('writes each gain with what it beat', () => {
    expect(
      describeCardioGains(
        [
          { kind: 'distance', value: 6000, previous: 5000 },
          { kind: 'pace', value: 300, previous: 360 },
          { kind: 'duration', value: 2160, previous: null },
        ],
        'km',
      ),
    ).toBe('6 km (was 5 km) · 5:00 /km (was 6:00 /km) · 36 min (first)');
  });

  it('writes a pool pace gain per 100 m', () => {
    expect(describeCardioGains([{ kind: 'pace', value: 1190, previous: 1200 }], 'm')).toBe(
      '1:59 /100 m (was 2:00 /100 m)',
    );
  });

  it('builds one card per activity with its records in kind order, by name', () => {
    const activity = (paceUnit: 'per_km' | 'per_100m') => ({
      paceUnit,
      referencePaceSPerKm: null,
      maxEffort: 'max' as const,
      tracksDistance: true,
      shares: [],
    });
    const exercises = [
      { id: 'swim', name: 'Swimming', modality: 'cardio' as const, activity: activity('per_100m') },
      { id: 'run', name: 'Running', modality: 'cardio' as const, activity: activity('per_km') },
    ];
    const rows = [
      { exerciseId: 'swim', kind: 'distance' as const, value: 1500 },
      { exerciseId: 'run', kind: 'duration' as const, value: 2160 },
      { exerciseId: 'run', kind: 'distance' as const, value: 6000 },
      { exerciseId: 'run', kind: 'pace' as const, value: 300 },
      { exerciseId: 'gone', kind: 'distance' as const, value: 1 },
    ];
    expect(cardioRecordCards(rows, exercises, 'kg')).toEqual([
      { exerciseId: 'run', name: 'Running', lines: ['Distance 6 km', 'Pace 5:00 /km', 'Duration 36 min'] },
      { exerciseId: 'swim', name: 'Swimming', lines: ['Distance 1500 m'] },
    ]);
    expect(cardioRecordCards(rows, exercises, 'lb')[1].lines).toEqual(['Distance 1640 yd']);
  });

  it('builds one card per hold with its longest time or farthest carry in metres, by name', () => {
    const exercises = [
      { id: 'carry', name: 'Farmers Carry', measure: 'distance' as const },
      { id: 'hang', name: 'Dead Hang', measure: 'time' as const },
      { id: 'bench', name: 'Bench Press' },
    ];
    const rows = [
      { exerciseId: 'carry', kind: 'distance' as const, value: 40 },
      { exerciseId: 'hang', kind: 'duration' as const, value: 45 },
      { exerciseId: 'bench', kind: 'duration' as const, value: 30 },
    ];
    expect(holdRecordCards(rows, exercises)).toEqual([
      { exerciseId: 'hang', name: 'Dead Hang', lines: ['Longest 45 s'] },
      { exerciseId: 'carry', name: 'Farmers Carry', lines: ['Farthest 40 m'] },
    ]);
  });
});
