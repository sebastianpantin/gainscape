import { roundTo } from '@domain/math.ts';
import type { Collection, ExerciseStrengthView } from '../collection/collection-data.ts';
import type { Exercise } from '../exercises/catalog-rules.ts';
import { type Profile, type Sex } from '../profile/profile-rules.ts';

interface DotsCurve {
  coefficients: readonly [number, number, number, number, number];
  lowestBodyweightKg: number;
  highestBodyweightKg: number;
}

const DOTS_CURVES: Record<Sex, DotsCurve> = {
  male: {
    coefficients: [-307.75076, 24.0900756, -0.1918759221, 0.0007391293, -0.000001093],
    lowestBodyweightKg: 40,
    highestBodyweightKg: 210,
  },
  female: {
    coefficients: [-57.96288, 13.6175032, -0.1126655495, 0.0005158568, -0.0000010706],
    lowestBodyweightKg: 40,
    highestBodyweightKg: 150,
  },
};

const DOTS_SCALE = 500;

export function dotsScore(totalKg: number, bodyweightKg: number, sex: Sex): number {
  const curve = DOTS_CURVES[sex];
  const clampedKg = Math.min(Math.max(bodyweightKg, curve.lowestBodyweightKg), curve.highestBodyweightKg);
  const denominator = curve.coefficients.reduce((sum, coefficient, power) => sum + coefficient * clampedKg ** power, 0);
  return roundTo(2, (DOTS_SCALE / denominator) * totalKg);
}

const POWERLIFTING_LIFTS = [
  { key: 'back_squat', name: 'squat' },
  { key: 'barbell_bench_press', name: 'bench press' },
  { key: 'deadlift', name: 'deadlift' },
] as const;

export const POWERLIFTING_LIFT_KEYS: readonly string[] = POWERLIFTING_LIFTS.map((lift) => lift.key);

export function competitionBests(
  exercises: readonly Exercise[],
  strengthByExercise: ReadonlyMap<string, ExerciseStrengthView>,
): Map<string, number> {
  const bests = new Map<string, number>();
  for (const exercise of exercises) {
    const e1rmKg = strengthByExercise.get(exercise.id)?.e1rmKg ?? null;
    if (exercise.key && e1rmKg !== null && POWERLIFTING_LIFT_KEYS.includes(exercise.key))
      bests.set(exercise.key, e1rmKg);
  }
  return bests;
}

export type DotsCard =
  | { kind: 'needs-sex' }
  | { kind: 'needs-bodyweight' }
  | { kind: 'missing-lifts'; text: string }
  | { kind: 'ready'; totalKg: number; bodyweightKg: number; score: number };

interface DotsInputs {
  sex: Sex | null;
  bodyweightKg: number | null;
  bestE1rmKgByKey: ReadonlyMap<string, number>;
}

function listed(names: readonly string[]): string {
  const withArticles = names.map((name) => `a ${name}`);
  if (withArticles.length === 1) return withArticles[0];
  return `${withArticles.slice(0, -1).join(', ')} and ${withArticles[withArticles.length - 1]}`;
}

export function dotsCard({ sex, bodyweightKg, bestE1rmKgByKey }: DotsInputs): DotsCard {
  if (sex === null) return { kind: 'needs-sex' };
  if (bodyweightKg === null) return { kind: 'needs-bodyweight' };
  const missing = POWERLIFTING_LIFTS.filter((lift) => !bestE1rmKgByKey.has(lift.key)).map((lift) => lift.name);
  if (missing.length > 0) {
    return { kind: 'missing-lifts', text: `Log ${listed(missing)} to see your DOTS score.` };
  }
  const totalKg = roundTo(
    2,
    POWERLIFTING_LIFTS.reduce((sum, lift) => sum + (bestE1rmKgByKey.get(lift.key) ?? 0), 0),
  );
  return { kind: 'ready', totalKg, bodyweightKg, score: dotsScore(totalKg, bodyweightKg, sex) };
}

export function dotsCardFor(profile: Pick<Profile, 'sex' | 'bodyweightKg'>, collection: Collection): DotsCard {
  return dotsCard({
    sex: profile.sex,
    bodyweightKg: profile.bodyweightKg,
    bestE1rmKgByKey: competitionBests(collection.exercises, collection.data.strengthByExercise),
  });
}

export function dotsLevel(card: DotsCard): number | null {
  return card.kind === 'ready' ? Math.round(card.score) : null;
}
