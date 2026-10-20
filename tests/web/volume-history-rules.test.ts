import { describe, expect, it } from 'vitest';
import { type VolumeExercise } from '../../web/src/lib/progress/weekly-volume-rules.ts';
import {
  historyWeeks,
  thisWeekText,
  volumeHistory,
  volumeHistoryBars,
  type WeeklyExerciseSetRow,
} from '../../web/src/lib/stats/volume-history-rules.ts';

const exercisesById = new Map<string, VolumeExercise>([
  [
    'bench',
    {
      name: 'Bench press',
      skillShares: [
        { skillKey: 'chest', skillName: 'Chest', shareBasisPoints: 7000 },
        { skillKey: 'arms', skillName: 'Arms', shareBasisPoints: 3000 },
      ],
    },
  ],
  ['squat', { name: 'Back squat', skillShares: [{ skillKey: 'legs', skillName: 'Legs', shareBasisPoints: 10000 }] }],
]);

function row(week_start: string, exercise_id: string, sets: number): WeeklyExerciseSetRow {
  return { week_start, exercise_id, sets };
}

describe('historyWeeks', () => {
  it('lists the Mondays of the last twelve weeks, oldest first, ending with this week', () => {
    const weeks = historyWeeks('2026-10-19');
    expect(weeks).toHaveLength(12);
    expect(weeks[0]).toBe('2026-08-03');
    expect(weeks.at(-1)).toBe('2026-10-19');
    expect(historyWeeks('2026-01-05', 3)).toEqual(['2025-12-22', '2025-12-29', '2026-01-05']);
  });
});

const MONDAY_NOON_UTC = Date.parse('2026-10-19T12:00:00Z');

describe('volumeHistory', () => {
  const rows = [
    row('2026-10-05', 'bench', 4),
    row('2026-10-19', 'bench', 2),
    row('2026-10-19', 'squat', 10),
    row('2026-07-20', 'squat', 5),
    row('2026-10-19', 'unknown', 3),
  ];

  it('splits each week of sets across the muscles each exercise trains and fills empty weeks with zero', () => {
    const chest = volumeHistory(rows, exercisesById, 'UTC', MONDAY_NOON_UTC).find((muscle) => muscle.skill === 'chest');
    expect(chest?.name).toBe('Chest');
    expect(chest?.weeks).toHaveLength(12);
    expect(chest?.weeks.slice(-3)).toEqual([
      { weekStart: '2026-10-05', sets: 2.8 },
      { weekStart: '2026-10-12', sets: 0 },
      { weekStart: '2026-10-19', sets: 1.4 },
    ]);
    expect(chest?.weeks.slice(0, -3).every((week) => week.sets === 0)).toBe(true);
    expect(chest?.totalSets).toBeCloseTo(4.2);
  });

  it('leaves out weeks older than the window and exercises it does not know', () => {
    const legs = volumeHistory(rows, exercisesById, 'UTC', MONDAY_NOON_UTC).find((muscle) => muscle.skill === 'legs');
    expect(legs?.totalSets).toBe(10);
  });

  it('puts the most trained muscles first, then the body order, and names untrained muscles from their key', () => {
    const history = volumeHistory(rows, exercisesById, 'UTC', MONDAY_NOON_UTC);
    expect(history.map((muscle) => muscle.skill)).toEqual([
      'legs',
      'chest',
      'arms',
      'back',
      'shoulders',
      'core',
      'grip',
    ]);
    expect(history.find((muscle) => muscle.skill === 'back')?.name).toBe('Back');
  });

  it('ends on the week of the profile time zone, like the weekly goal, not the device date', () => {
    const sundayEveningInNewYork = Date.parse('2026-10-19T02:00:00Z');
    const thisWeekIn = (timeZone: string) =>
      volumeHistory(rows, exercisesById, timeZone, sundayEveningInNewYork)
        .find((muscle) => muscle.skill === 'legs')
        ?.weeks.at(-1);
    expect(thisWeekIn('Europe/Stockholm')).toEqual({ weekStart: '2026-10-19', sets: 10 });
    expect(thisWeekIn('America/New_York')).toEqual({ weekStart: '2026-10-12', sets: 0 });
  });
});

describe('volumeHistoryBars', () => {
  it('labels each bar with its week start date', () => {
    const chest = volumeHistory([row('2026-10-19', 'bench', 2)], exercisesById, 'UTC', MONDAY_NOON_UTC)[0];
    const bars = volumeHistoryBars(chest!);
    expect(bars.at(-1)).toEqual({ label: '19 Oct', value: 1.4 });
    expect(bars[0]).toEqual({ label: '3 Aug', value: 0 });
  });
});

describe('thisWeekText', () => {
  it('reads this week against the weekly target', () => {
    const history = volumeHistory(
      [row('2026-10-19', 'squat', 12), row('2026-10-19', 'bench', 2)],
      exercisesById,
      'UTC',
      MONDAY_NOON_UTC,
    );
    const named = (skill: string) => history.find((muscle) => muscle.skill === skill)!;
    expect(thisWeekText(named('legs'))).toBe('This week: 12 sets · within target');
    expect(thisWeekText(named('chest'))).toBe('This week: 1.4 of 10 sets');
    expect(thisWeekText(named('back'))).toBe('This week: 0 of 10 sets');
  });
});
