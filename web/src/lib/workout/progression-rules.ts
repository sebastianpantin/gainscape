import { roundTo } from '@domain/index.ts';
import type { LoadType } from '../exercises/catalog-rules.ts';
import type { RecentSessions, RecentSet } from '../history/last-session-rules.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { shownWeight } from '../units.ts';

export const READY_RIR = 2;
export const FATIGUE_SESSIONS = 3;
export const DELOAD_FRACTION = 0.9;
const STRAINED_RIR = 1;
const WEIGHT_DECIMALS = 2;
const STEP_WITHOUT_BARBELL: Readonly<Record<UnitPref, number>> = { kg: 2.5, lb: 5 };

interface RepRange {
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

function leastRir(sets: readonly RecentSet[]): number | null {
  const rirs = sets.flatMap((set) => (set.loggedRir === null ? [] : [set.loggedRir]));
  return rirs.length === sets.length ? Math.min(...rirs) : null;
}

function hadRepsInReserve(sets: readonly RecentSet[], range: RepRange | null): boolean {
  const rir = leastRir(sets);
  return rir === null ? range !== null : rir >= READY_RIR;
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
  const heavier = roundTo(WEIGHT_DECIMALS, Math.round((shown + step) / step) * step);
  const next = addsLoad ? loadText(heavier, loadType, unit) : `${goal + 1} reps`;
  return `Try ${next}: every set hit ${goal} reps last time`;
}

function keepsFalling(values: readonly (number | null)[]): boolean {
  const known = values.flatMap((value) => (value === null ? [] : [value]));
  return known.length === values.length && known.every((value, index) => index === 0 || value < known[index - 1]);
}

function averageReps(sets: readonly RecentSet[]): number {
  return sets.reduce((total, set) => total + set.reps, 0) / sets.length;
}

export function fatigueAdvice(
  sessions: RecentSessions | undefined,
  loadType: LoadType,
  unit: UnitPref,
  step: number,
  lowestLoad: number,
): string | null {
  if (!sessions || sessions.length < FATIGUE_SESSIONS) return null;
  const oldestFirst = sessions.slice(0, FATIGUE_SESSIONS).map(heaviestSets).reverse();
  const weightKg = oldestFirst[0][0].weightKg;
  if (oldestFirst.some((sets) => sets[0].weightKg !== weightKg)) return null;
  if (loadType === 'external' && weightKg === 0) return null;
  const rirs = oldestFirst.map(leastRir);
  const latestRir = rirs.at(-1) ?? null;
  const feltHarder = latestRir !== null && latestRir <= STRAINED_RIR && keepsFalling(rirs);
  const repsDropped = keepsFalling(oldestFirst.map(averageReps));
  if (!feltHarder && !repsDropped) return null;
  const lead = `${feltHarder ? 'Felt harder' : 'Reps dropped'} ${FATIGUE_SESSIONS} sessions in a row`;
  const easierDay = 'consider an easier day with fewer reps';
  if (loadType === 'bodyweight' || weightKg === 0) return `${lead}: ${easierDay}`;
  const shown = shownWeight(weightKg, unit);
  const at = `${lead} at ${loadText(shown, loadType, unit)}`;
  const lighter = roundTo(WEIGHT_DECIMALS, Math.min(shown - step, Math.round((shown * DELOAD_FRACTION) / step) * step));
  if (lighter <= 0 || lighter < lowestLoad) return `${at}: ${easierDay}`;
  return `${at}: consider a lighter day at ${loadText(lighter, loadType, unit)}`;
}
