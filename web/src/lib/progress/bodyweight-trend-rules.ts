import type { ChartSeries } from '../ui/line-chart-rules.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { shownWeight } from '../units.ts';

export const BODYWEIGHT_ENTRY_COLUMNS = 'logged_on, bodyweight_kg';

export interface BodyweightEntryRow {
  logged_on: string;
  bodyweight_kg: number | string;
}

export interface WorkoutBodyweightRow {
  local_date: string;
  bodyweight_kg: number | string;
}

export interface BodyweightDay {
  day: string;
  bodyweightKg: number;
}

export function bodyweightTrend(
  entries: readonly BodyweightEntryRow[],
  workoutDays: readonly WorkoutBodyweightRow[],
): BodyweightDay[] {
  const byDay = new Map(workoutDays.map((row) => [row.local_date, Number(row.bodyweight_kg)]));
  for (const entry of entries) byDay.set(entry.logged_on, Number(entry.bodyweight_kg));
  return [...byDay.entries()]
    .map(([day, bodyweightKg]) => ({ day, bodyweightKg }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function bodyweightChartSeries(trend: readonly BodyweightDay[], unit: UnitPref): ChartSeries[] {
  return [
    {
      name: 'Bodyweight',
      points: trend.map(({ day, bodyweightKg }) => ({
        x: Date.parse(`${day}T00:00:00Z`),
        y: shownWeight(bodyweightKg, unit),
      })),
    },
  ];
}

export function trendDayText(time: number): string {
  return new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}
