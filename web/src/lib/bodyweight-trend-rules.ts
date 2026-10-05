import { roundTo } from '@domain/math.ts';
import type { ChartSeries } from './line-chart-rules.ts';
import type { UnitPref } from './profile-rules.ts';
import { shownWeight } from './units.ts';

export const BODYWEIGHT_TREND_COLUMNS = {
  entries: 'logged_on, bodyweight_kg',
  workoutSets: 'weight_kg, effective_load_kg, sessions(local_date, started_at), exercises!inner(load_type)',
} as const;

export const BODYWEIGHT_LOAD_TYPES = ['bodyweight', 'bodyweight_plus'] as const;

export interface BodyweightEntryRow {
  logged_on: string;
  bodyweight_kg: number | string;
}

export interface WorkoutBodyweightRow {
  weight_kg: number | string;
  effective_load_kg: number | string;
  sessions: { local_date: string; started_at: string };
}

export interface BodyweightDay {
  day: string;
  bodyweightKg: number;
}

function workoutBodyweights(rows: readonly WorkoutBodyweightRow[]): Map<string, number> {
  const byDay = new Map<string, number>();
  const oldestFirst = [...rows].sort((a, b) => Date.parse(a.sessions.started_at) - Date.parse(b.sessions.started_at));
  for (const row of oldestFirst) {
    const bodyweightKg = roundTo(2, Number(row.effective_load_kg) - Number(row.weight_kg));
    if (bodyweightKg > 0) byDay.set(row.sessions.local_date, bodyweightKg);
  }
  return byDay;
}

export function bodyweightTrend(
  entries: readonly BodyweightEntryRow[],
  workoutSets: readonly WorkoutBodyweightRow[],
): BodyweightDay[] {
  const byDay = workoutBodyweights(workoutSets);
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
