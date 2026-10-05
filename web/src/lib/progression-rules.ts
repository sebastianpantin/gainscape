import { roundTo } from '@domain/index.ts';
import type { LoadType } from './catalog-rules.ts';
import type { RecentSet } from './last-session-rules.ts';
import type { UnitPref } from './profile-rules.ts';
import { shownWeight } from './units.ts';

export const READY_RIR = 2;
const WEIGHT_DECIMALS = 2;
const STEP_WITHOUT_BARBELL: Readonly<Record<UnitPref, number>> = { kg: 2.5, lb: 5 };

export interface RepRange {
  repsMin: number;
  repsMax: number;
}

export function progressionStep(unit: UnitPref, barbellPlates: readonly number[] | null): number {
  if (barbellPlates === null || barbellPlates.length === 0) return STEP_WITHOUT_BARBELL[unit];
  return roundTo(WEIGHT_DECIMALS, Math.min(...barbellPlates) * 2);
}

function heaviestSets(sets: readonly RecentSet[]): RecentSet[] {
  const heaviest = Math.max(...sets.map((set) => set.weightKg));
  return sets.filter((set) => set.weightKg === heaviest);
}

function loadText(shown: number, loadType: LoadType, unit: UnitPref): string {
  return `${loadType === 'bodyweight_plus' ? '+' : ''}${shown} ${unit}`;
}

function hadRepsInReserve(sets: readonly RecentSet[], range: RepRange | null): boolean {
  const rirs = sets.map((set) => set.loggedRir);
  if (rirs.some((rir) => rir === null)) return range !== null;
  return Math.min(...(rirs as number[])) >= READY_RIR;
}

export function nextWeightHint(
  sets: readonly RecentSet[] | undefined,
  loadType: LoadType,
  range: RepRange | null,
  unit: UnitPref,
  step: number,
): string | null {
  if (!sets || sets.length === 0) return null;
  const heaviest = heaviestSets(sets);
  const { weightKg, reps: firstReps } = heaviest[0];
  if (loadType === 'external' && weightKg === 0) return null;
  const addsLoad = loadType !== 'bodyweight' && weightKg > 0;
  const shown = shownWeight(weightKg, unit);
  const floor = range?.repsMin ?? firstReps;
  if (heaviest.some((set) => set.reps < floor))
    return addsLoad
      ? `Stay at ${loadText(shown, loadType, unit)} until every set hits ${floor} reps`
      : `Aim for ${floor} reps on every set`;
  const goal = range?.repsMax ?? firstReps;
  if (heaviest.some((set) => set.reps < goal) || !hadRepsInReserve(heaviest, range)) return null;
  const next = addsLoad ? loadText(roundTo(WEIGHT_DECIMALS, shown + step), loadType, unit) : `${goal + 1} reps`;
  return `Try ${next}: every set hit ${goal} reps last time`;
}
