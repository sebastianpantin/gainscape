import { MS_PER_DAY } from '@domain/math.ts';
import {
  streakText,
  type WeeklyGoalStatus,
  weekProgressText,
  workoutWord,
} from '../../lib/progress/weekly-goal-rules.ts';
import { weekKey } from '../../lib/ui/date-bucket-rules.ts';
import { streakRiskText } from './today-rules.ts';

const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
export const WEEKDAY_LETTERS = DAY_NAMES.map((dayName) => dayName[0]);
const DAY_LIST = new Intl.ListFormat('en-GB', { type: 'conjunction' });

export interface WeekStripDay {
  date: string;
  letter: string;
  dayName: string;
  trained: boolean;
  isToday: boolean;
}

function dayAfter(monday: string, days: number): string {
  return new Date(Date.parse(`${monday}T00:00:00Z`) + days * MS_PER_DAY).toISOString().slice(0, 10);
}

export function weekStripDays(trainedDates: readonly string[], today: string): WeekStripDay[] {
  const monday = weekKey(today);
  const trained = new Set(trainedDates);
  return DAY_NAMES.map((dayName, index) => {
    const date = dayAfter(monday, index);
    return { date, letter: dayName[0], dayName, trained: trained.has(date), isToday: date === today };
  });
}

export function workoutsThisWeek(trainedDates: readonly string[], today: string): number {
  const monday = weekKey(today);
  return trainedDates.filter((date) => weekKey(date) === monday).length;
}

export function weekStripLabel(days: readonly WeekStripDay[]): string {
  const trained = days.filter((day) => day.trained).map((day) => day.dayName);
  const summary = trained.length === 0 ? 'no workouts yet' : `trained ${DAY_LIST.format(trained)}`;
  return `This week: ${summary}. Open Stats`;
}

interface ThisWeekView {
  days: WeekStripDay[] | null;
  streak: string | null;
  summary: string | null;
  offerGoal: boolean;
  risk: string | null;
}

export function thisWeekView(
  status: WeeklyGoalStatus | null | undefined,
  today: string | null,
  trainedDates: readonly string[] | undefined,
): ThisWeekView {
  const goalStatus = status?.goal != null ? status : null;
  const loaded = today !== null && trainedDates !== undefined;
  const workouts = loaded ? workoutsThisWeek(trainedDates, today) : null;
  const countText = workouts === null ? null : `${workouts} ${workoutWord(workouts)} this week`;
  return {
    days: loaded ? weekStripDays(trainedDates, today) : null,
    streak: goalStatus ? streakText(goalStatus.streakWeeks) : null,
    summary: goalStatus ? weekProgressText(goalStatus) : countText,
    offerGoal: goalStatus === null && countText !== null,
    risk: goalStatus && today !== null ? streakRiskText(goalStatus, today) : null,
  };
}
