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

export interface CompetitionBest {
  exerciseId: string;
  e1rmKg: number;
}

export function competitionBests(
  exercises: readonly Exercise[],
  strengthByExercise: ReadonlyMap<string, ExerciseStrengthView>,
): Map<string, CompetitionBest> {
  const bests = new Map<string, CompetitionBest>();
  for (const exercise of exercises) {
    const e1rmKg = strengthByExercise.get(exercise.id)?.e1rmKg ?? null;
    if (exercise.key && e1rmKg !== null && POWERLIFTING_LIFT_KEYS.includes(exercise.key))
      bests.set(exercise.key, { exerciseId: exercise.id, e1rmKg });
  }
  return bests;
}

export function dotsTotalKg(e1rmsKg: readonly number[]): number {
  return roundTo(
    2,
    e1rmsKg.reduce((sum, e1rmKg) => sum + e1rmKg, 0),
  );
}

export type DotsCard =
  | { kind: 'needs-sex' }
  | { kind: 'needs-bodyweight' }
  | { kind: 'missing-lifts'; text: string }
  | { kind: 'ready'; sex: Sex; liftIds: readonly string[]; totalKg: number; bodyweightKg: number; score: number };

interface DotsInputs {
  sex: Sex | null;
  bodyweightKg: number | null;
  bestsByKey: ReadonlyMap<string, CompetitionBest>;
}

function listed(names: readonly string[]): string {
  const withArticles = names.map((name) => `a ${name}`);
  if (withArticles.length === 1) return withArticles[0];
  return `${withArticles.slice(0, -1).join(', ')} and ${withArticles[withArticles.length - 1]}`;
}

export function dotsCard({ sex, bodyweightKg, bestsByKey }: DotsInputs): DotsCard {
  if (sex === null) return { kind: 'needs-sex' };
  if (bodyweightKg === null) return { kind: 'needs-bodyweight' };
  const bests = POWERLIFTING_LIFTS.map((lift) => bestsByKey.get(lift.key));
  if (!bests.every((best) => best !== undefined)) {
    const missing = POWERLIFTING_LIFTS.filter((_, index) => bests[index] === undefined).map((lift) => lift.name);
    return { kind: 'missing-lifts', text: `Log ${listed(missing)} to see your DOTS score.` };
  }
  const totalKg = dotsTotalKg(bests.map((best) => best.e1rmKg));
  return {
    kind: 'ready',
    sex,
    liftIds: bests.map((best) => best.exerciseId),
    totalKg,
    bodyweightKg,
    score: dotsScore(totalKg, bodyweightKg, sex),
  };
}

export function dotsCardFor(profile: Pick<Profile, 'sex' | 'bodyweightKg'>, collection: Collection): DotsCard {
  return dotsCard({
    sex: profile.sex,
    bodyweightKg: profile.bodyweightKg,
    bestsByKey: competitionBests(collection.exercises, collection.data.strengthByExercise),
  });
}

export function dotsLevel(card: DotsCard): number | null {
  return card.kind === 'ready' ? Math.round(card.score) : null;
}
