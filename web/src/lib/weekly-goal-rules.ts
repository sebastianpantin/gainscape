export const WEEKLY_GOAL_CHOICES = ['off', '1', '2', '3', '4', '5', '6', '7'] as const;
export type WeeklyGoalChoice = (typeof WEEKLY_GOAL_CHOICES)[number];

export interface WeeklyGoalWeekRow {
  week_start: string;
  goal: number | null;
  sessions: number;
  is_current: boolean;
}

export interface PendingGoal {
  goal: number | null;
  startsOn: string;
}

export interface WeeklyGoalStatus {
  goal: number | null;
  sessionsThisWeek: number;
  streakWeeks: number;
  nextGoal: PendingGoal | null;
}

function isMet(row: WeeklyGoalWeekRow): boolean {
  return row.goal !== null && row.sessions >= row.goal;
}

function metWeeksBefore(rows: readonly WeeklyGoalWeekRow[], end: number): number {
  let streak = 0;
  for (let index = end - 1; index >= 0 && isMet(rows[index]); index -= 1) streak += 1;
  return streak;
}

export function weeklyGoalStatus(rows: readonly WeeklyGoalWeekRow[]): WeeklyGoalStatus | null {
  const currentIndex = rows.findIndex((row) => row.is_current);
  if (currentIndex < 0) return null;
  const current = rows[currentIndex];
  const pending = rows[currentIndex + 1];
  return {
    goal: current.goal,
    sessionsThisWeek: current.sessions,
    streakWeeks: metWeeksBefore(rows, currentIndex) + (isMet(current) ? 1 : 0),
    nextGoal: pending && pending.goal !== current.goal ? { goal: pending.goal, startsOn: pending.week_start } : null,
  };
}

function workouts(count: number): string {
  return count === 1 ? 'workout' : 'workouts';
}

export function weekProgressText(status: WeeklyGoalStatus): string {
  const goal = status.goal ?? 0;
  const progress = `${status.sessionsThisWeek} of ${goal} ${workouts(goal)} this week`;
  return status.sessionsThisWeek >= goal ? `Goal met: ${progress}` : progress;
}

export function streakText(weeks: number): string {
  return weeks === 0 ? 'No streak yet' : `${weeks} week streak`;
}

export function goalFromChoice(choice: WeeklyGoalChoice): number | null {
  return choice === 'off' ? null : Number(choice);
}

export function goalToChoice(goal: number | null): WeeklyGoalChoice {
  return goal === null ? 'off' : (String(goal) as WeeklyGoalChoice);
}

function mondayText(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function goalSettingHint(status: WeeklyGoalStatus | null): string {
  if (status?.goal == null) return 'Pick how many workouts a week to aim for. Weeks that hit it build a streak.';
  const keeps = `This week keeps its goal of ${status.goal}.`;
  if (!status.nextGoal) return `A change starts next Monday, so this week keeps its goal of ${status.goal}.`;
  const starts = mondayText(status.nextGoal.startsOn);
  return status.nextGoal.goal === null
    ? `Your goal turns off on ${starts}. ${keeps}`
    : `Your goal of ${status.nextGoal.goal} starts on ${starts}. ${keeps}`;
}
