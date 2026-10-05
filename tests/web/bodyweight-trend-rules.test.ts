import { describe, expect, it } from 'vitest';
import {
  bodyweightChartSeries,
  type BodyweightEntryRow,
  bodyweightTrend,
  trendDayText,
  type WorkoutBodyweightRow,
} from '../../web/src/lib/bodyweight-trend-rules.ts';

function workoutRow(localDate: string, effectiveLoadKg: string, weightKg = '0', hour = '08'): WorkoutBodyweightRow {
  return {
    weight_kg: weightKg,
    effective_load_kg: effectiveLoadKg,
    sessions: { local_date: localDate, started_at: `${localDate}T${hour}:00:00Z` },
  };
}

function entryRow(loggedOn: string, bodyweightKg: string): BodyweightEntryRow {
  return { logged_on: loggedOn, bodyweight_kg: bodyweightKg };
}

describe('bodyweight trend', () => {
  it('is empty with no entries and no bodyweight workouts', () => {
    expect(bodyweightTrend([], [])).toEqual([]);
  });

  it('reads the bodyweight of a workout from the load minus the added weight, oldest day first', () => {
    expect(bodyweightTrend([], [workoutRow('2026-10-03', '92.5', '10'), workoutRow('2026-10-01', '80')])).toEqual([
      { day: '2026-10-01', bodyweightKg: 80 },
      { day: '2026-10-03', bodyweightKg: 82.5 },
    ]);
  });

  it('keeps one point per day from the latest workout of that day', () => {
    expect(
      bodyweightTrend([], [workoutRow('2026-10-01', '81', '0', '18'), workoutRow('2026-10-01', '80', '0', '07')]),
    ).toEqual([{ day: '2026-10-01', bodyweightKg: 81 }]);
  });

  it('merges logged entries with workouts and lets a logged entry win on the same day', () => {
    expect(
      bodyweightTrend(
        [entryRow('2026-10-02', '79.4'), entryRow('2026-10-04', '78')],
        [workoutRow('2026-10-02', '80'), workoutRow('2026-10-03', '79')],
      ),
    ).toEqual([
      { day: '2026-10-02', bodyweightKg: 79.4 },
      { day: '2026-10-03', bodyweightKg: 79 },
      { day: '2026-10-04', bodyweightKg: 78 },
    ]);
  });

  it('ignores a workout set that carries no bodyweight', () => {
    expect(bodyweightTrend([], [workoutRow('2026-10-01', '10', '10')])).toEqual([]);
  });
});

describe('bodyweight chart', () => {
  const trend = [
    { day: '2026-10-01', bodyweightKg: 80 },
    { day: '2026-10-03', bodyweightKg: 81.5 },
  ];

  it('plots each day at UTC midnight in kilograms', () => {
    expect(bodyweightChartSeries(trend, 'kg')).toEqual([
      {
        name: 'Bodyweight',
        points: [
          { x: Date.UTC(2026, 9, 1), y: 80 },
          { x: Date.UTC(2026, 9, 3), y: 81.5 },
        ],
      },
    ]);
  });

  it('plots pounds for a pound user', () => {
    expect(bodyweightChartSeries(trend, 'lb')[0].points.map((point) => point.y)).toEqual([176.4, 179.7]);
  });

  it('labels a point with the day it was logged in any time zone', () => {
    expect(trendDayText(Date.UTC(2026, 9, 1))).toBe('1 Oct');
  });
});
