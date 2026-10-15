import type { LoadType } from '../exercises/catalog-rules.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { formatLoad } from '../format.ts';
import { z } from 'zod';
import { nullableNumber, numericColumn } from '../rows.ts';
import type { LastLoggedSet } from '../../offline/draft-edits.ts';

export const recentLiftRowSchema = z.object({
  exercise_id: z.string(),
  session_rank: z.number(),
  weight_kg: numericColumn,
  reps: z.number().nullable(),
  logged_rir: numericColumn.nullable(),
});

export type RecentLiftRow = z.infer<typeof recentLiftRowSchema>;

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
      reps: row.reps ?? 0,
      loggedRir: nullableNumber(row.logged_rir),
    });
    byExercise.set(row.exercise_id, sessions);
  }
  return byExercise;
}

function topSet(sets: readonly LastLoggedSet[]): LastLoggedSet {
  return sets.reduce((top, set) =>
    set.weightKg > top.weightKg || (set.weightKg === top.weightKg && set.reps > top.reps) ? set : top,
  );
}

function topSetText({ weightKg, reps }: LastLoggedSet, loadType: LoadType, unit: UnitPref): string {
  if (loadType === 'bodyweight' || weightKg === 0) return reps === 1 ? '1 rep' : `${reps} reps`;
  return `${formatLoad(weightKg, loadType, unit)} × ${reps}`;
}

export function lastTimeText(
  sets: readonly LastLoggedSet[] | undefined,
  loadType: LoadType,
  unit: UnitPref,
): string | null {
  if (!sets || sets.length === 0) return null;
  const count = sets.length === 1 ? '1 set' : `${sets.length} sets`;
  return `Last: ${count}, top ${topSetText(topSet(sets), loadType, unit)}`;
}

export function firstSetFromLastSession(
  sets: readonly LastLoggedSet[] | undefined,
  loadType: LoadType,
): LastLoggedSet | undefined {
  const first = sets?.[0];
  if (!first) return undefined;
  return { weightKg: loadType === 'bodyweight' ? 0 : first.weightKg, reps: first.reps };
}
