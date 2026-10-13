import { describe, expect, it } from 'vitest';
import {
  goalFromChoice,
  goalSettingHint,
  goalToChoice,
  streakText,
  weeklyGoalStatus,
  type WeeklyGoalWeekRow,
  weekProgressText,
} from '../../web/src/lib/progress/weekly-goal-rules.ts';

function week(weekStart: string, goal: number | null, sessions: number, isCurrent = false): WeeklyGoalWeekRow {
  return { week_start: weekStart, goal, sessions, is_current: isCurrent };
}

describe('weekly goal status', () => {
  it('has no status before a goal was ever set', () => {
    expect(weeklyGoalStatus([])).toBeNull();
  });

  it('reads this week from the current row', () => {
    expect(weeklyGoalStatus([week('2026-10-05', 3, 2, true)])).toEqual({
      weekStart: '2026-10-05',
      goal: 3,
      sessionsThisWeek: 2,
      streakWeeks: 0,
      nextGoal: null,
    });
  });

  it('counts consecutive met weeks back from last week while this week is still open', () => {
    const status = weeklyGoalStatus([
      week('2026-09-07', 3, 3),
      week('2026-09-14', 3, 1),
      week('2026-09-21', 3, 4),
      week('2026-09-28', 2, 2),
      week('2026-10-05', 2, 1, true),
    ]);
    expect(status?.streakWeeks).toBe(2);
  });

  it('adds this week to the streak once its goal is met', () => {
    const status = weeklyGoalStatus([week('2026-09-28', 2, 2), week('2026-10-05', 2, 2, true)]);
    expect(status?.streakWeeks).toBe(2);
  });

  it('counts every week back to the first goal when all were met', () => {
    const status = weeklyGoalStatus([
      week('2026-09-21', 1, 1),
      week('2026-09-28', 1, 2),
      week('2026-10-05', 1, 0, true),
    ]);
    expect(status?.streakWeeks).toBe(2);
  });

  it('judges each week by the goal in effect that week', () => {
    const status = weeklyGoalStatus([
      week('2026-09-21', 4, 3),
      week('2026-09-28', 2, 3),
      week('2026-10-05', 2, 0, true),
    ]);
    expect(status?.streakWeeks).toBe(1);
  });

  it('breaks the streak on a week with the goal turned off', () => {
    const status = weeklyGoalStatus([
      week('2026-09-21', 2, 5),
      week('2026-09-28', null, 5),
      week('2026-10-05', 2, 2, true),
    ]);
    expect(status?.streakWeeks).toBe(1);
  });

  it('shows a pending change that starts next week', () => {
    expect(weeklyGoalStatus([week('2026-10-05', 3, 1, true), week('2026-10-12', 4, 0)])?.nextGoal).toEqual({
      goal: 4,
      startsOn: '2026-10-12',
    });
    expect(weeklyGoalStatus([week('2026-10-05', 3, 1, true), week('2026-10-12', null, 0)])?.nextGoal).toEqual({
      goal: null,
      startsOn: '2026-10-12',
    });
  });

  it('ignores a pending row that keeps the same goal', () => {
    expect(weeklyGoalStatus([week('2026-10-05', 3, 1, true), week('2026-10-12', 3, 0)])?.nextGoal).toBeNull();
  });
});

describe('weekly goal texts', () => {
  it('describes progress this week', () => {
    expect(
      weekProgressText({ weekStart: '2026-10-12', goal: 3, sessionsThisWeek: 1, streakWeeks: 0, nextGoal: null }),
    ).toBe('1 of 3 workouts this week');
    expect(
      weekProgressText({ weekStart: '2026-10-12', goal: 1, sessionsThisWeek: 0, streakWeeks: 0, nextGoal: null }),
    ).toBe('0 of 1 workout this week');
    expect(
      weekProgressText({ weekStart: '2026-10-12', goal: 3, sessionsThisWeek: 4, streakWeeks: 1, nextGoal: null }),
    ).toBe('Goal met: 4 of 3 workouts this week');
  });

  it('describes the streak in weeks', () => {
    expect(streakText(0)).toBe('No streak yet');
    expect(streakText(1)).toBe('1 week streak');
    expect(streakText(5)).toBe('5 week streak');
  });

  it('maps the setting choice to a goal and back', () => {
    expect(goalFromChoice('off')).toBeNull();
    expect(goalFromChoice('4')).toBe(4);
    expect(goalToChoice(null)).toBe('off');
    expect(goalToChoice(4)).toBe('4');
  });

  it('explains when a change takes effect', () => {
    expect(goalSettingHint(null)).toBe('Pick how many workouts a week to aim for. Weeks that hit it build a streak.');
    expect(
      goalSettingHint({ weekStart: '2026-10-12', goal: 3, sessionsThisWeek: 0, streakWeeks: 0, nextGoal: null }),
    ).toBe('A change starts next Monday, so this week keeps its goal of 3.');
    expect(
      goalSettingHint({
        weekStart: '2026-10-12',
        goal: 3,
        sessionsThisWeek: 0,
        streakWeeks: 0,
        nextGoal: { goal: 5, startsOn: '2026-10-12' },
      }),
    ).toBe('Your goal of 5 starts on Mon 12 Oct. This week keeps its goal of 3.');
    expect(
      goalSettingHint({
        weekStart: '2026-10-05',
        goal: 3,
        sessionsThisWeek: 0,
        streakWeeks: 0,
        nextGoal: { goal: null, startsOn: '2026-10-12' },
      }),
    ).toBe('Your goal turns off on Mon 12 Oct. This week keeps its goal of 3.');
  });
});
