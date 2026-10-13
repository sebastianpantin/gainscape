import { kgToUnit } from '@domain/units.ts';
import type { UnitPref } from '../profile/profile-rules.ts';

export const SHOWN_EXERCISE_NAMES = 3;

export interface OverviewSet {
  exerciseName: string;
  position: number;
  effectiveLoadKg: number | null;
  reps: number | null;
  isWarmup: boolean;
}

export interface TopExercises {
  names: string[];
  moreCount: number;
}

export function topExerciseNames(sets: readonly OverviewSet[], limit: number): TopExercises {
  const workingSetsByName = new Map<string, number>();
  for (const set of [...sets].sort((a, b) => a.position - b.position)) {
    workingSetsByName.set(set.exerciseName, (workingSetsByName.get(set.exerciseName) ?? 0) + (set.isWarmup ? 0 : 1));
  }
  const ranked = [...workingSetsByName.entries()]
    .map(([name, workingSets], order) => ({ name, workingSets, order }))
    .sort((a, b) => b.workingSets - a.workingSets || a.order - b.order)
    .map(({ name }) => name);
  return { names: ranked.slice(0, limit), moreCount: Math.max(0, ranked.length - limit) };
}

export function exerciseListText(sets: readonly OverviewSet[]): { names: string; more: string | null } | null {
  const { names, moreCount } = topExerciseNames(sets, SHOWN_EXERCISE_NAMES);
  if (names.length === 0) return null;
  return { names: names.join(', '), more: moreCount > 0 ? `+${moreCount} more` : null };
}

export function sessionVolumeKg(sets: readonly OverviewSet[]): number {
  return sets.reduce(
    (total, set) =>
      set.isWarmup || set.effectiveLoadKg === null || set.reps === null
        ? total
        : total + set.effectiveLoadKg * set.reps,
    0,
  );
}

export function volumeText(volumeKg: number, unit: UnitPref): string | null {
  const shown = Math.round(kgToUnit(volumeKg, unit));
  return shown > 0 ? `${shown.toLocaleString('en-US')} ${unit} volume` : null;
}

export function recordBadgeText(recordCount: number): string | null {
  if (recordCount <= 0) return null;
  return `${recordCount} ${recordCount === 1 ? 'PR' : 'PRs'}`;
}
