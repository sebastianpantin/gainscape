import { describe, expect, it } from 'vitest';
import {
  thisWeekView,
  WEEKDAY_LETTERS,
  weekStripDays,
  weekStripLabel,
  workoutsThisWeek,
} from '../../web/src/features/workout/week-strip-rules.ts';

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

describe('thisWeekView', () => {
  const FRIDAY = '2026-10-23';
  const goal = { weekStart: '2026-10-19', goal: 3, sessionsThisWeek: 1, streakWeeks: 4, nextGoal: null };
  const noGoal = { ...goal, goal: null, streakWeeks: 0 };

  it('reserves the strip and the summary line while the profile or the training days load', () => {
    for (const view of [thisWeekView(undefined, null, undefined), thisWeekView(noGoal, WEDNESDAY, undefined)]) {
      expect(view).toMatchObject({ days: null, summary: null, offerGoal: false, risk: null });
    }
    expect(WEEKDAY_LETTERS.join('')).toBe('MTWTFSS');
  });

  it('counts this week and offers a goal to a lifter without one', () => {
    expect(thisWeekView(noGoal, WEDNESDAY, ['2026-10-19', '2026-10-21'])).toMatchObject({
      summary: '2 workouts this week',
      offerGoal: true,
      streak: null,
      risk: null,
    });
    expect(thisWeekView(null, WEDNESDAY, ['2026-10-19']).summary).toBe('1 workout this week');
  });

  it('shows the goal progress, the streak and a risk from the profile day once a goal is set', () => {
    expect(thisWeekView(goal, FRIDAY, ['2026-10-19'])).toMatchObject({
      summary: '1 of 3 workouts this week',
      offerGoal: false,
      streak: '4 week streak',
      risk: '2 more workouts by Sunday keeps your 4 week streak',
    });
    expect(thisWeekView(goal, WEDNESDAY, ['2026-10-19']).risk).toBeNull();
  });

  it('shows a goal before the training days arrive, with the strip still reserved', () => {
    expect(thisWeekView(goal, FRIDAY, undefined)).toMatchObject({
      days: null,
      summary: '1 of 3 workouts this week',
      streak: '4 week streak',
    });
  });
});
