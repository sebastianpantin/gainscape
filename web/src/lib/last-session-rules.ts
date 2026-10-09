import type { LoadType } from './catalog-rules.ts';
import type { UnitPref } from './profile-rules.ts';
import { formatLoad } from './format.ts';
import { nullableNumber } from './rows.ts';
import type { LastLoggedSet } from '../offline/draft-format.ts';

export interface RecentLiftRow {
  exercise_id: string;
  session_rank: number;
  weight_kg: number | string;
  reps: number;
  logged_rir: number | string | null;
}

export interface RecentSet extends LastLoggedSet {
  loggedRir: number | null;
}

export type RecentSessions = readonly (readonly RecentSet[])[];

export function recentSessionsByExercise(rows: readonly RecentLiftRow[]): Map<string, RecentSet[][]> {
  const byExercise = new Map<string, RecentSet[][]>();
  for (const row of rows) {
    const sessions = byExercise.get(row.exercise_id) ?? [];
    const sets = (sessions[row.session_rank - 1] ??= []);
    sets.push({
      weightKg: Number(row.weight_kg),
      reps: row.reps,
      loggedRir: nullableNumber(row.logged_rir),
    });
    byExercise.set(row.exercise_id, sessions);
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
  return ` @ ${formatLoad(weightKg, loadType, unit)}`;
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
