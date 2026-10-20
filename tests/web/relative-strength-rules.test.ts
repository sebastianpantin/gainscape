import { describe, expect, it } from 'vitest';
import type { ExerciseStrengthView } from '../../web/src/lib/collection/collection-data.ts';
import type { Exercise, LiftExercise } from '../../web/src/lib/exercises/catalog-rules.ts';
import type { SessionProgress } from '../../web/src/lib/progress/exercise-progress-rules.ts';
import {
  currentMultipleText,
  relativeStrengthLifts,
  relativeStrengthPoints,
  relativeStrengthSeries,
} from '../../web/src/lib/stats/relative-strength-rules.ts';

function session(localDate: string, e1rmKg: number | null, startedAt = `${localDate}T08:00:00Z`): SessionProgress {
  return {
    sessionId: `${localDate}-${startedAt}`,
    startedAt,
    localDate,
    e1rmKg,
    topSetKg: 100,
    topSetReps: 5,
    mostReps: 5,
    programDriven: false,
  };
}

function lift(id: string, name: string, overrides: Partial<LiftExercise> = {}): LiftExercise {
  return {
    id,
    key: id,
    name,
    equipment: 'barbell',
    modality: 'lift',
    loadType: 'external',
    custom: false,
    archived: false,
    skillShares: [],
    ...overrides,
  };
}

const trend = [
  { day: '2026-10-01', bodyweightKg: 80 },
  { day: '2026-10-05', bodyweightKg: 82 },
  { day: '2026-10-10', bodyweightKg: 81 },
];

describe('relativeStrengthPoints', () => {
  it('divides each session e1RM by the bodyweight in effect that day, to two decimals', () => {
    const points = relativeStrengthPoints([session('2026-10-02', 120), session('2026-10-06', 125)], trend);
    expect(points).toEqual([
      { day: '2026-10-02', multiple: 1.5 },
      { day: '2026-10-06', multiple: 1.52 },
    ]);
  });

  it('uses the bodyweight saved on the day itself and the latest one after the last entry', () => {
    const points = relativeStrengthPoints([session('2026-10-05', 123), session('2026-12-31', 162)], trend);
    expect(points).toEqual([
      { day: '2026-10-05', multiple: 1.5 },
      { day: '2026-12-31', multiple: 2 },
    ]);
  });

  it('skips sessions before the first bodyweight and sessions without an e1RM', () => {
    const points = relativeStrengthPoints(
      [session('2026-09-29', 110), session('2026-10-03', null), session('2026-10-11', 121.5)],
      trend,
    );
    expect(points).toEqual([{ day: '2026-10-11', multiple: 1.5 }]);
    expect(relativeStrengthPoints([session('2026-10-02', 120)], [])).toEqual([]);
  });

  it('dates a session by its stored local date, not by when it started', () => {
    const lateEvening = session('2026-10-01', 120, '2026-09-30T20:00:00Z');
    expect(relativeStrengthPoints([lateEvening], trend)).toEqual([{ day: '2026-10-01', multiple: 1.5 }]);
  });

  it('matches sessions to bodyweights in day order even when they started out of order', () => {
    const points = relativeStrengthPoints(
      [session('2026-10-11', 121.5, '2026-10-10T20:00:00Z'), session('2026-10-02', 120, '2026-10-02T08:00:00Z')],
      trend,
    );
    expect(points).toEqual([
      { day: '2026-10-02', multiple: 1.5 },
      { day: '2026-10-11', multiple: 1.5 },
    ]);
  });

  it('keeps the best multiple of a day with two sessions', () => {
    const points = relativeStrengthPoints(
      [session('2026-10-02', 100, '2026-10-02T08:00:00Z'), session('2026-10-02', 120, '2026-10-02T18:00:00Z')],
      trend,
    );
    expect(points).toEqual([{ day: '2026-10-02', multiple: 1.5 }]);
  });
});

describe('relativeStrengthSeries', () => {
  it('plots one point per day at UTC midnight', () => {
    expect(relativeStrengthSeries([{ day: '2026-10-02', multiple: 1.5 }])).toEqual([
      { name: 'Bodyweight multiple', points: [{ x: Date.parse('2026-10-02T00:00:00Z'), y: 1.5 }] },
    ]);
  });
});

describe('currentMultipleText', () => {
  it('shows the latest multiple', () => {
    expect(
      currentMultipleText([
        { day: '2026-10-02', multiple: 1.5 },
        { day: '2026-10-06', multiple: 1.52 },
      ]),
    ).toBe('Now 1.52 × bodyweight');
  });

  it('explains an empty chart', () => {
    expect(currentMultipleText([])).toBe('No e1RM on or after your first bodyweight entry yet.');
  });
});

describe('relativeStrengthLifts', () => {
  const strength = (e1rmKg: number | null): ExerciseStrengthView => ({ e1rmKg, repsCapacity: null });

  it('offers logged barbell lifts with an e1RM, competition lifts first, then by name, but no dumbbell lift, logged per dumbbell', () => {
    const exercises: Exercise[] = [
      lift('barbell_row', 'Barbell Row'),
      lift('deadlift', 'Deadlift'),
      lift('dumbbell_press', 'Dumbbell Press', { equipment: 'dumbbell' }),
      lift('back_squat', 'Back Squat'),
      lift('leg_press', 'Leg Press', { equipment: 'machine' }),
      lift('weighted_dip', 'Weighted Dip', { loadType: 'bodyweight_plus' }),
      lift('never_logged', 'Never Logged'),
      lift('barbell_bench_press', 'Barbell Bench Press'),
    ];
    const strengths = new Map([
      ['barbell_row', strength(90)],
      ['deadlift', strength(180)],
      ['dumbbell_press', strength(40)],
      ['back_squat', strength(140)],
      ['leg_press', strength(250)],
      ['weighted_dip', strength(30)],
      ['never_logged', strength(null)],
      ['barbell_bench_press', strength(100)],
    ]);
    expect(relativeStrengthLifts(exercises, strengths).map((option) => option.name)).toEqual([
      'Back Squat',
      'Barbell Bench Press',
      'Deadlift',
      'Barbell Row',
    ]);
  });

  it('offers nothing before any lift is logged', () => {
    expect(relativeStrengthLifts([lift('back_squat', 'Back Squat')], new Map())).toEqual([]);
  });
});
