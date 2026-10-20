import { describe, expect, it } from 'vitest';
import { type CalendarDay, trainingCalendar } from '../../web/src/lib/stats/training-calendar-rules.ts';
import { type TrainingSession } from '../../web/src/lib/stats/training-days-rules.ts';

function session(localDate: string, xp: number): TrainingSession {
  return { localDate, xp, prCount: 0, dropCount: 0, volumeKg: 0 };
}

function dayOf(weeks: (CalendarDay | null)[][], localDate: string): CalendarDay {
  const day = weeks.flat().find((cell) => cell?.localDate === localDate);
  if (!day) throw new Error(`no ${localDate} in the grid`);
  return day;
}

describe('trainingCalendar', () => {
  it('lays a month out in weeks from Monday, padding the days of other months', () => {
    const { title, weeks } = trainingCalendar('2026-10', [], '2026-10-20');
    expect(title).toBe('October 2026');
    expect(weeks).toHaveLength(5);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0]?.map((cell) => cell?.dayOfMonth ?? null)).toEqual([null, null, null, 1, 2, 3, 4]);
    expect(weeks[4]?.map((cell) => cell?.dayOfMonth ?? null)).toEqual([26, 27, 28, 29, 30, 31, null]);
  });

  it('starts on the first row when the month starts on a Monday and adds a sixth row when needed', () => {
    expect(trainingCalendar('2027-02', [], '2026-10-20').weeks[0]?.[0]?.localDate).toBe('2027-02-01');
    expect(trainingCalendar('2027-02', [], '2026-10-20').weeks).toHaveLength(4);
    expect(trainingCalendar('2026-08', [], '2026-10-20').weeks).toHaveLength(6);
  });

  it('adds up the workouts and XP of each day and leaves other months out', () => {
    const { weeks } = trainingCalendar(
      '2026-10',
      [session('2026-09-30', 500), session('2026-10-02', 100), session('2026-10-02', 50), session('2026-10-05', 300)],
      '2026-10-20',
    );
    expect(dayOf(weeks, '2026-10-02')).toMatchObject({ workouts: 2, xp: 150 });
    expect(dayOf(weeks, '2026-10-05')).toMatchObject({ workouts: 1, xp: 300 });
    expect(dayOf(weeks, '2026-10-01')).toMatchObject({ workouts: 0, xp: 0, heat: 0 });
  });

  it('heats each training day against the best day of the month, in four steps', () => {
    const { weeks } = trainingCalendar(
      '2026-10',
      [session('2026-10-01', 400), session('2026-10-02', 300), session('2026-10-03', 101), session('2026-10-04', 1)],
      '2026-10-20',
    );
    expect(dayOf(weeks, '2026-10-01').heat).toBe(4);
    expect(dayOf(weeks, '2026-10-02').heat).toBe(3);
    expect(dayOf(weeks, '2026-10-03').heat).toBe(2);
    expect(dayOf(weeks, '2026-10-04').heat).toBe(1);
  });

  it('still lights a day of history-only workouts that earned no XP', () => {
    const { weeks } = trainingCalendar('2026-10', [session('2026-10-07', 0)], '2026-10-20');
    expect(dayOf(weeks, '2026-10-07')).toMatchObject({ workouts: 1, xp: 0, heat: 1 });
  });

  it('names each day with its weekday, workouts and XP, and marks today', () => {
    const { weeks } = trainingCalendar(
      '2026-10',
      [session('2026-10-02', 1200), session('2026-10-02', 34), session('2026-10-20', 80)],
      '2026-10-20',
    );
    expect(dayOf(weeks, '2026-10-02').label).toBe('Friday 2 October: 2 workouts, 1,234 XP');
    expect(dayOf(weeks, '2026-10-20').label).toBe('Tuesday 20 October: 1 workout, 80 XP');
    expect(dayOf(weeks, '2026-10-01').label).toBe('Thursday 1 October: no workout');
    expect(dayOf(weeks, '2026-10-20').isToday).toBe(true);
    expect(dayOf(weeks, '2026-10-02').isToday).toBe(false);
  });
});
