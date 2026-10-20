import { formatXp } from '../format.ts';
import { type UnitPref } from '../profile/profile-rules.ts';
import { kgToUnit } from '../units.ts';
import { monthKey, monthTitle, shiftMonth } from '../ui/date-bucket-rules.ts';
import { type TrainingSession } from './training-days-rules.ts';

export interface MonthTotals {
  workouts: number;
  volumeKg: number;
  prs: number;
  xp: number;
}

interface CompareRow {
  label: string;
  current: string;
  previous: string;
  change: string;
}

export interface MonthCompare {
  currentTitle: string;
  previousTitle: string;
  rows: CompareRow[];
}

export function monthTotals(month: string, sessions: readonly TrainingSession[]): MonthTotals {
  return sessions
    .filter((session) => monthKey(session.localDate) === month)
    .reduce(
      (totals, session) => ({
        workouts: totals.workouts + 1,
        volumeKg: totals.volumeKg + session.volumeKg,
        prs: totals.prs + session.prCount,
        xp: totals.xp + session.xp,
      }),
      { workouts: 0, volumeKg: 0, prs: 0, xp: 0 },
    );
}

function changeText(difference: number, suffix: string): string {
  if (difference === 0) return 'No change';
  return `${difference > 0 ? '+' : '−'}${formatXp(Math.abs(difference))}${suffix}`;
}

function compareRow(label: string, current: number, previous: number, suffix = ''): CompareRow {
  return {
    label,
    current: `${formatXp(current)}${suffix}`,
    previous: `${formatXp(previous)}${suffix}`,
    change: changeText(current - previous, suffix),
  };
}

export function monthCompare(month: string, sessions: readonly TrainingSession[], unit: UnitPref): MonthCompare {
  const previousMonth = shiftMonth(month, -1);
  const current = monthTotals(month, sessions);
  const previous = monthTotals(previousMonth, sessions);
  const shownVolume = (totals: MonthTotals) => Math.round(kgToUnit(totals.volumeKg, unit));
  return {
    currentTitle: monthTitle(month),
    previousTitle: monthTitle(previousMonth),
    rows: [
      compareRow('Workouts', current.workouts, previous.workouts),
      compareRow('Volume', shownVolume(current), shownVolume(previous), ` ${unit}`),
      compareRow('PRs', current.prs, previous.prs),
      compareRow('XP', current.xp, previous.xp),
    ],
  };
}
