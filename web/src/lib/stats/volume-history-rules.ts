import { MS_PER_DAY } from '@domain/math.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { trendDayText } from '../progress/bodyweight-trend-rules.ts';
import { BODY_SKILLS, type BodySkill } from '../progress/recovery-rules.ts';
import {
  muscleVolumeFromExerciseSets,
  VOLUME_BAND_TEXT,
  volumeAmountText,
  volumeBand,
  type VolumeExercise,
} from '../progress/weekly-volume-rules.ts';
import { parsedRows } from '../rows.ts';
import { type ChartBar } from '../ui/bar-chart-rules.ts';
import { weekStartIn } from '../ui/date-bucket-rules.ts';

const VOLUME_HISTORY_WEEKS = 12;

const weeklyExerciseSetRowSchema = z.object({
  week_start: z.string(),
  exercise_id: z.string(),
  sets: z.number(),
});

export type WeeklyExerciseSetRow = z.infer<typeof weeklyExerciseSetRowSchema>;

export const weeklyExerciseSetRowsSchema = z.array(weeklyExerciseSetRowSchema);

interface MuscleWeek {
  weekStart: string;
  sets: number;
}

export interface MuscleHistory {
  skill: BodySkill;
  name: string;
  weeks: MuscleWeek[];
  totalSets: number;
}

const DAYS_PER_WEEK = 7;

function weekTime(weekStart: string): number {
  return Date.parse(`${weekStart}T00:00:00Z`);
}

export function historyWeeks(thisWeek: string, count = VOLUME_HISTORY_WEEKS): string[] {
  return Array.from({ length: count }, (_, index) =>
    new Date(weekTime(thisWeek) - (count - 1 - index) * DAYS_PER_WEEK * MS_PER_DAY).toISOString().slice(0, 10),
  );
}

function setsByExerciseInWeek(rows: readonly WeeklyExerciseSetRow[], weekStart: string): Map<string, number> {
  return new Map(rows.filter((row) => row.week_start === weekStart).map((row) => [row.exercise_id, row.sets]));
}

function muscleNames(exercisesById: ReadonlyMap<string, VolumeExercise>): Map<string, string> {
  const names = new Map<string, string>();
  for (const exercise of exercisesById.values()) {
    for (const share of exercise.skillShares) names.set(share.skillKey, share.skillName);
  }
  return names;
}

function nameFromKey(skill: BodySkill): string {
  return skill.charAt(0).toUpperCase() + skill.slice(1);
}

export function volumeHistory(
  rows: readonly WeeklyExerciseSetRow[],
  exercisesById: ReadonlyMap<string, VolumeExercise>,
  timeZone: string,
  now: number,
): MuscleHistory[] {
  const weekly = historyWeeks(weekStartIn(timeZone, now)).map((weekStart) => ({
    weekStart,
    volume: muscleVolumeFromExerciseSets(setsByExerciseInWeek(rows, weekStart), exercisesById),
  }));
  const names = muscleNames(exercisesById);
  const history = BODY_SKILLS.map((skill) => {
    const weeks = weekly.map(({ weekStart, volume }) => ({ weekStart, sets: volume[skill].sets }));
    return {
      skill,
      name: names.get(skill) ?? nameFromKey(skill),
      weeks,
      totalSets: weeks.reduce((sum, week) => sum + week.sets, 0),
    };
  });
  return history.sort((a, b) => b.totalSets - a.totalSets);
}

export function volumeHistoryBars(muscle: MuscleHistory): ChartBar[] {
  return muscle.weeks.map((week) => ({ label: trendDayText(weekTime(week.weekStart)), value: week.sets }));
}

export function thisWeekText(muscle: MuscleHistory): string {
  const sets = muscle.weeks.at(-1)?.sets ?? 0;
  const bandText = VOLUME_BAND_TEXT[volumeBand(sets)];
  return `This week: ${volumeAmountText(sets)}${bandText ? ` · ${bandText}` : ''}`;
}

export async function queryWeeklyExerciseSets(
  client: SupabaseClient,
  signal: AbortSignal,
): Promise<WeeklyExerciseSetRow[]> {
  const { data, error } = await client.rpc('weekly_exercise_sets', { weeks: VOLUME_HISTORY_WEEKS }).abortSignal(signal);
  if (error) throw error;
  return parsedRows(weeklyExerciseSetRowSchema, data);
}
