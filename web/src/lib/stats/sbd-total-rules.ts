import type { Collection, RepMaxSlotView } from '../collection/collection-data.ts';
import type { Exercise } from '../exercises/catalog-rules.ts';
import { competitionBests, dotsTotalKg, listed, POWERLIFTING_LIFTS } from './dots-rules.ts';

const HEAVIEST_SLOT_INDEX = 0;

const SHORT_NAMES: Record<string, string> = {
  back_squat: 'Squat',
  barbell_bench_press: 'Bench',
  deadlift: 'Deadlift',
};

export interface SbdLift {
  key: string;
  name: string;
  currentKg: number;
  bestKg: number | null;
}

export type SbdTotalCard =
  | { kind: 'missing-lifts'; text: string }
  | {
      kind: 'ready';
      estimatedKg: number;
      bestKg: number | null;
      bestAchievedAt: string | null;
      lifts: SbdLift[];
    };

function oldestDate(achievedAts: readonly (string | null)[]): string | null {
  const dated = achievedAts.filter((achievedAt) => achievedAt !== null);
  return dated.length === 0 ? null : dated.sort((a, b) => Date.parse(a) - Date.parse(b))[0];
}

function heaviestLiftFor(
  exercises: readonly Exercise[],
  repMaxesByExercise: Collection['data']['repMaxesByExercise'],
  key: string,
): RepMaxSlotView | null {
  const exercise = exercises.find((candidate) => candidate.key === key);
  return (exercise && repMaxesByExercise.get(exercise.id)?.[HEAVIEST_SLOT_INDEX]) || null;
}

export function sbdTotalFor(collection: Collection): SbdTotalCard {
  const currents = competitionBests(collection.exercises, collection.data.strengthByExercise);
  const missing = POWERLIFTING_LIFTS.filter((lift) => !currents.has(lift.key)).map((lift) => lift.name);
  if (missing.length > 0) return { kind: 'missing-lifts', text: `Log ${listed(missing)} to see your SBD total.` };

  const heaviest = POWERLIFTING_LIFTS.map((lift) =>
    heaviestLiftFor(collection.exercises, collection.data.repMaxesByExercise, lift.key),
  );
  const lifts = POWERLIFTING_LIFTS.map((lift, index) => ({
    key: lift.key,
    name: SHORT_NAMES[lift.key],
    currentKg: currents.get(lift.key)?.e1rmKg ?? 0,
    bestKg: heaviest[index]?.loadKg ?? null,
  }));
  const completeHeaviest = heaviest.filter((lift) => lift !== null);
  const hasBestTotal = completeHeaviest.length === heaviest.length;
  return {
    kind: 'ready',
    estimatedKg: dotsTotalKg(lifts.map((lift) => lift.currentKg)),
    bestKg: hasBestTotal ? dotsTotalKg(completeHeaviest.map((lift) => lift.loadKg)) : null,
    bestAchievedAt: hasBestTotal ? oldestDate(completeHeaviest.map((lift) => lift.achievedAt)) : null,
    lifts,
  };
}
