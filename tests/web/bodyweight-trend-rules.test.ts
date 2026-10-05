import { describe, expect, it } from 'vitest';
import {
  bodyweightChartSeries,
  type BodyweightEntryRow,
  bodyweightTrend,
  trendDayText,
  type WorkoutBodyweightRow,
} from '../../web/src/lib/bodyweight-trend-rules.ts';

function workoutRow(localDate: string, bodyweightKg: string): WorkoutBodyweightRow {
  return { local_date: localDate, bodyweight_kg: bodyweightKg };
}

function entryRow(loggedOn: string, bodyweightKg: string): BodyweightEntryRow {
  return { logged_on: loggedOn, bodyweight_kg: bodyweightKg };
}

describe('bodyweight trend', () => {
  it('is empty with no entries and no bodyweight workouts', () => {
    expect(bodyweightTrend([], [])).toEqual([]);
  });

  it('lists workout days oldest first', () => {
    expect(bodyweightTrend([], [workoutRow('2026-10-03', '82.5'), workoutRow('2026-10-01', '80')])).toEqual([
      { day: '2026-10-01', bodyweightKg: 80 },
      { day: '2026-10-03', bodyweightKg: 82.5 },
    ]);
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
