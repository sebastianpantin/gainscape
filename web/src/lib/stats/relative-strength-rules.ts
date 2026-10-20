import { roundTo } from '@domain/math.ts';
import { z } from 'zod';
import type { ExerciseStrengthView } from '../collection/collection-data.ts';
import { type Exercise, isLiftExercise } from '../exercises/catalog-rules.ts';
import { type BodyweightDay } from '../progress/bodyweight-trend-rules.ts';
import { progressSetRowSchema, type SessionProgress } from '../progress/exercise-progress-rules.ts';
import { todayLocalDate } from '../progress/lift-goal-rules.ts';
import { type ChartSeries } from '../ui/line-chart-rules.ts';
import { POWERLIFTING_LIFT_KEYS } from './dots-rules.ts';

export const relativeStrengthDataSchema = z.object({
  sets: z.array(progressSetRowSchema),
  bodyweights: z.array(z.object({ day: z.string(), bodyweightKg: z.number() })),
});

export type RelativeStrengthData = z.infer<typeof relativeStrengthDataSchema>;

export interface RelativeStrengthPoint {
  day: string;
  multiple: number;
}

export interface RelativeStrengthLift {
  id: string;
  name: string;
}

const RELATIVE_STRENGTH_EQUIPMENT = new Set(['barbell', 'dumbbell']);

export function bodyweightOnDay(trend: readonly BodyweightDay[], day: string): number | null {
  const inEffect = trend.filter((entry) => entry.day <= day).at(-1);
  return inEffect?.bodyweightKg ?? null;
}

export function relativeStrengthPoints(
  sessions: readonly SessionProgress[],
  trend: readonly BodyweightDay[],
  timezone: string,
): RelativeStrengthPoint[] {
  const bestByDay = new Map<string, number>();
  for (const { startedAt, e1rmKg } of sessions) {
    const day = todayLocalDate(new Date(startedAt), timezone);
    const bodyweightKg = bodyweightOnDay(trend, day);
    if (e1rmKg === null || bodyweightKg === null) continue;
    const multiple = roundTo(2, e1rmKg / bodyweightKg);
    bestByDay.set(day, Math.max(bestByDay.get(day) ?? multiple, multiple));
  }
  return [...bestByDay.entries()]
    .map(([day, multiple]) => ({ day, multiple }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

export function relativeStrengthSeries(points: readonly RelativeStrengthPoint[]): ChartSeries[] {
  return [
    {
      name: 'Bodyweight multiple',
      points: points.map(({ day, multiple }) => ({ x: Date.parse(`${day}T00:00:00Z`), y: multiple })),
    },
  ];
}

export function currentMultipleText(points: readonly RelativeStrengthPoint[]): string {
  const latest = points.at(-1);
  if (latest === undefined) return 'No e1RM on or after your first bodyweight entry yet.';
  return `Now ${latest.multiple.toFixed(2)} × bodyweight`;
}

function competitionOrder(exercise: Exercise): number {
  const index = POWERLIFTING_LIFT_KEYS.indexOf(exercise.key ?? '');
  return index === -1 ? POWERLIFTING_LIFT_KEYS.length : index;
}

export function relativeStrengthLifts(
  exercises: readonly Exercise[],
  strengthByExercise: ReadonlyMap<string, ExerciseStrengthView>,
): RelativeStrengthLift[] {
  return exercises
    .filter(
      (exercise) =>
        isLiftExercise(exercise) &&
        exercise.loadType === 'external' &&
        RELATIVE_STRENGTH_EQUIPMENT.has(exercise.equipment) &&
        (strengthByExercise.get(exercise.id)?.e1rmKg ?? null) !== null,
    )
    .sort((a, b) => competitionOrder(a) - competitionOrder(b) || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));
}
