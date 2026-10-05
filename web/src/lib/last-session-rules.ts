import type { LoadType } from './catalog-rules.ts';
import type { UnitPref } from './profile-rules.ts';
import { shownWeight } from './units.ts';
import type { LastLoggedSet } from '../offline/draft-format.ts';

export interface LastSessionRow {
  exercise_id: string;
  weight_kg: number | string;
  reps: number;
}

export function lastSessionByExercise(rows: readonly LastSessionRow[]): Map<string, LastLoggedSet[]> {
  const byExercise = new Map<string, LastLoggedSet[]>();
  for (const row of rows) {
    const sets = byExercise.get(row.exercise_id) ?? [];
    sets.push({ weightKg: Number(row.weight_kg), reps: row.reps });
    byExercise.set(row.exercise_id, sets);
  }
  return byExercise;
}

interface RepeatedSets {
  count: number;
  set: LastLoggedSet;
}

function repeatedRuns(sets: readonly LastLoggedSet[]): RepeatedSets[] {
  const runs: RepeatedSets[] = [];
  for (const set of sets) {
    const last = runs.at(-1);
    if (last && last.set.weightKg === set.weightKg && last.set.reps === set.reps) last.count++;
    else runs.push({ count: 1, set });
  }
  return runs;
}

function loadText(weightKg: number, loadType: LoadType, unit: UnitPref): string {
  if (loadType === 'bodyweight' || weightKg === 0) return '';
  const sign = loadType === 'bodyweight_plus' ? '+' : '';
  return ` @ ${sign}${shownWeight(weightKg, unit)} ${unit}`;
}

export function lastTimeText(
  sets: readonly LastLoggedSet[] | undefined,
  loadType: LoadType,
  unit: UnitPref,
): string | null {
  if (!sets || sets.length === 0) return null;
  const runs = repeatedRuns(sets).map(
    ({ count, set }) => `${count}×${set.reps}${loadText(set.weightKg, loadType, unit)}`,
  );
  return `Last: ${runs.join(', ')}`;
}

export function firstSetFromLastSession(
  sets: readonly LastLoggedSet[] | undefined,
  loadType: LoadType,
): LastLoggedSet | undefined {
  const first = sets?.[0];
  if (!first) return undefined;
  return { weightKg: loadType === 'bodyweight' ? 0 : first.weightKg, reps: first.reps };
}
