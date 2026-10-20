import { formatCount, formatXp } from '../format.ts';
import { daysInMonth, monthKey, monthTitle } from '../ui/date-bucket-rules.ts';
import { type TrainingSession } from './training-days-rules.ts';

const HEAT_LEVELS = 4;

export const CALENDAR_WEEKDAYS = [
  { short: 'Mon', long: 'Monday' },
  { short: 'Tue', long: 'Tuesday' },
  { short: 'Wed', long: 'Wednesday' },
  { short: 'Thu', long: 'Thursday' },
  { short: 'Fri', long: 'Friday' },
  { short: 'Sat', long: 'Saturday' },
  { short: 'Sun', long: 'Sunday' },
] as const;

const DAYS_PER_WEEK = CALENDAR_WEEKDAYS.length;

export interface CalendarDay {
  localDate: string;
  dayOfMonth: number;
  workouts: number;
  xp: number;
  heat: number;
  isToday: boolean;
  label: string;
}

export interface TrainingCalendar {
  title: string;
  weeks: (CalendarDay | null)[][];
}

interface DayTotals {
  workouts: number;
  xp: number;
}

function totalsByDay(month: string, sessions: readonly TrainingSession[]): Map<string, DayTotals> {
  const byDay = new Map<string, DayTotals>();
  for (const session of sessions) {
    if (monthKey(session.localDate) !== month) continue;
    const totals = byDay.get(session.localDate) ?? { workouts: 0, xp: 0 };
    byDay.set(session.localDate, { workouts: totals.workouts + 1, xp: totals.xp + session.xp });
  }
  return byDay;
}

function heatOf({ workouts, xp }: DayTotals, bestDayXp: number): number {
  if (workouts === 0) return 0;
  if (bestDayXp === 0) return 1;
  return Math.max(1, Math.ceil((HEAT_LEVELS * xp) / bestDayXp));
}

function dayName(localDate: string): string {
  const date = new Date(`${localDate}T00:00:00Z`);
  const part = (options: Intl.DateTimeFormatOptions) =>
    date.toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });
  return `${part({ weekday: 'long' })} ${date.getUTCDate()} ${part({ month: 'long' })}`;
}

function dayLabel(localDate: string, { workouts, xp }: DayTotals): string {
  const training = workouts === 0 ? 'no workout' : `${formatCount(workouts, 'workout')}, ${formatXp(xp)} XP`;
  return `${dayName(localDate)}: ${training}`;
}

function mondayFirstWeekday(localDate: string): number {
  return (new Date(`${localDate}T00:00:00Z`).getUTCDay() + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
}

export function trainingCalendar(month: string, sessions: readonly TrainingSession[], today: string): TrainingCalendar {
  const byDay = totalsByDay(month, sessions);
  const bestDayXp = Math.max(0, ...[...byDay.values()].map((totals) => totals.xp));
  const days = Array.from({ length: daysInMonth(month) }, (_, index): CalendarDay => {
    const localDate = `${month}-${String(index + 1).padStart(2, '0')}`;
    const totals = byDay.get(localDate) ?? { workouts: 0, xp: 0 };
    return {
      localDate,
      dayOfMonth: index + 1,
      ...totals,
      heat: heatOf(totals, bestDayXp),
      isToday: localDate === today,
      label: dayLabel(localDate, totals),
    };
  });
  const cells: (CalendarDay | null)[] = [...Array<null>(mondayFirstWeekday(`${month}-01`)).fill(null), ...days];
  while (cells.length % DAYS_PER_WEEK !== 0) cells.push(null);
  const weeks = Array.from({ length: cells.length / DAYS_PER_WEEK }, (_, week) =>
    cells.slice(week * DAYS_PER_WEEK, (week + 1) * DAYS_PER_WEEK),
  );
  return { title: monthTitle(month), weeks };
}
