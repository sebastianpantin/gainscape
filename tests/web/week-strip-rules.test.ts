import { describe, expect, it } from 'vitest';
import { weekStripDays, weekStripLabel, workoutsThisWeek } from '../../web/src/features/workout/week-strip-rules.ts';

const WEDNESDAY = '2026-10-21';

describe('weekStripDays', () => {
  it('lays out Monday to Sunday of the week holding today', () => {
    const days = weekStripDays([], WEDNESDAY);
    expect(days.map((day) => day.date)).toEqual([
      '2026-10-19',
      '2026-10-20',
      '2026-10-21',
      '2026-10-22',
      '2026-10-23',
      '2026-10-24',
      '2026-10-25',
    ]);
    expect(days.map((day) => day.letter).join('')).toBe('MTWTFSS');
    expect(days.map((day) => day.dayName)).toEqual([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]);
  });

  it('lights the trained days of this week only and marks today', () => {
    const days = weekStripDays(['2026-10-18', '2026-10-19', '2026-10-21', '2026-10-21'], WEDNESDAY);
    expect(days.filter((day) => day.trained).map((day) => day.date)).toEqual(['2026-10-19', '2026-10-21']);
    expect(days.filter((day) => day.isToday).map((day) => day.date)).toEqual([WEDNESDAY]);
  });

  it('keeps a week that crosses into the next month whole', () => {
    const days = weekStripDays(['2026-11-01'], '2026-10-28');
    expect(days.at(-1)).toMatchObject({ date: '2026-11-01', trained: true });
  });
});

describe('workoutsThisWeek', () => {
  it('counts every workout of this week, two on one day included', () => {
    expect(workoutsThisWeek(['2026-10-18', '2026-10-19', '2026-10-21', '2026-10-21'], WEDNESDAY)).toBe(3);
  });
});

describe('weekStripLabel', () => {
  it('names the trained days and where the link leads', () => {
    expect(weekStripLabel(weekStripDays(['2026-10-19'], WEDNESDAY))).toBe('This week: trained Monday. Open Stats');
    expect(weekStripLabel(weekStripDays(['2026-10-19', '2026-10-21'], WEDNESDAY))).toBe(
      'This week: trained Monday and Wednesday. Open Stats',
    );
    expect(weekStripLabel(weekStripDays(['2026-10-19', '2026-10-20', '2026-10-21'], WEDNESDAY))).toBe(
      'This week: trained Monday, Tuesday and Wednesday. Open Stats',
    );
  });

  it('says when nothing is logged yet', () => {
    expect(weekStripLabel(weekStripDays([], WEDNESDAY))).toBe('This week: no workouts yet. Open Stats');
  });
});
