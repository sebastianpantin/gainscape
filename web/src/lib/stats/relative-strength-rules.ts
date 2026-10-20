import { roundTo } from '@domain/math.ts';
import { z } from 'zod';
import type { ExerciseStrengthView } from '../collection/collection-data.ts';
import { type Exercise, isLiftExercise } from '../exercises/catalog-rules.ts';
import { type BodyweightDay } from '../progress/bodyweight-trend-rules.ts';
import { type SessionProgress } from '../progress/exercise-progress-rules.ts';
import { type ChartSeries } from '../ui/line-chart-rules.ts';
import { POWERLIFTING_LIFT_KEYS } from './dots-rules.ts';

export const relativeStrengthPointsSchema = z.array(z.object({ day: z.string(), multiple: z.number() }));

export type RelativeStrengthPoint = z.infer<typeof relativeStrengthPointsSchema>[number];

export interface RelativeStrengthLift {
  id: string;
  name: string;
}

export function relativeStrengthPoints(
  sessions: readonly SessionProgress[],
  trend: readonly BodyweightDay[],
): RelativeStrengthPoint[] {
  const bestByDay = new Map<string, number>();
  const byDay = [...sessions].sort((a, b) => a.localDate.localeCompare(b.localDate));
  let nextEntry = 0;
  let bodyweightKg: number | null = null;
  for (const { localDate, e1rmKg } of byDay) {
    for (let entry = trend[nextEntry]; entry !== undefined && entry.day <= localDate; entry = trend[++nextEntry]) {
      bodyweightKg = entry.bodyweightKg;
    }
    if (e1rmKg === null || bodyweightKg === null) continue;
    const multiple = roundTo(2, e1rmKg / bodyweightKg);
    bestByDay.set(localDate, Math.max(bestByDay.get(localDate) ?? multiple, multiple));
  }
  return [...bestByDay.entries()].map(([day, multiple]) => ({ day, multiple }));
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
        exercise.equipment === 'barbell' &&
        (strengthByExercise.get(exercise.id)?.e1rmKg ?? null) !== null,
    )
    .sort((a, b) => competitionOrder(a) - competitionOrder(b) || a.name.localeCompare(b.name))
    .map(({ id, name }) => ({ id, name }));
}
