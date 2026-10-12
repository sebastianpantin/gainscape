import { roundTo } from '@domain/math.ts';
import type { LoadType } from '../../lib/catalog-rules.ts';
import type { UnitPref } from '../../lib/profile-rules.ts';
import { shownWeight } from '../../lib/units.ts';
import type { DraftSet, LastLoggedSet } from '../../offline/draft-format.ts';

export type LastSetDirection = 'up' | 'down' | 'same';

export interface LastSetDelta {
  direction: LastSetDirection;
  text: string;
  label: string;
}

const WEIGHT_DELTA_DECIMALS = 2;

export function lastSetForRow(
  rows: readonly Pick<DraftSet, 'isWarmup'>[],
  rowIndex: number,
  lastSession: readonly LastLoggedSet[] | undefined,
): LastLoggedSet | null {
  if (!lastSession || rows[rowIndex]?.isWarmup !== false) return null;
  const workingIndex = rows.slice(0, rowIndex).filter((row) => !row.isWarmup).length;
  return lastSession[workingIndex] ?? null;
}

function countsLoad(set: LastLoggedSet, loadType: LoadType): boolean {
  return loadType !== 'bodyweight' && set.weightKg > 0;
}

function repsText(reps: number): string {
  return `${reps} ${reps === 1 ? 'rep' : 'reps'}`;
}

function loadPrefix(loadType: LoadType): string {
  return loadType === 'bodyweight_plus' ? '+' : '';
}

export function lastSetText(last: LastLoggedSet, loadType: LoadType, unit: UnitPref): string {
  if (!countsLoad(last, loadType)) return `Last ${repsText(last.reps)}`;
  return `Last ${loadPrefix(loadType)}${shownWeight(last.weightKg, unit)}×${last.reps}`;
}

export function lastSetName(last: LastLoggedSet, loadType: LoadType, unit: UnitPref, setNumber: number): string {
  const done = countsLoad(last, loadType)
    ? `${loadPrefix(loadType)}${shownWeight(last.weightKg, unit)} ${unit} × ${last.reps}`
    : repsText(last.reps);
  return `Last time ${done}, fill set ${setNumber}`;
}

export function lastSetChangesFor(last: LastLoggedSet, loadType: LoadType): Partial<LastLoggedSet> {
  return loadType === 'bodyweight' ? { reps: last.reps } : { weightKg: last.weightKg, reps: last.reps };
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : `−${Math.abs(value)}`;
}

function weightLabel(change: number, unit: UnitPref): string {
  return `${Math.abs(change)} ${unit} ${change > 0 ? 'more' : 'less'}`;
}

function repsLabel(change: number): string {
  const count = Math.abs(change);
  return `${count} ${change > 0 ? 'more' : 'fewer'} ${count === 1 ? 'rep' : 'reps'}`;
}

export function lastSetDelta(
  current: LastLoggedSet,
  last: LastLoggedSet,
  loadType: LoadType,
  unit: UnitPref,
): LastSetDelta {
  const weightChange =
    loadType === 'bodyweight'
      ? 0
      : roundTo(WEIGHT_DELTA_DECIMALS, shownWeight(current.weightKg, unit) - shownWeight(last.weightKg, unit));
  const repsChange = current.reps - last.reps;
  if (weightChange === 0 && repsChange === 0) return { direction: 'same', text: '= last', label: 'Same as last time' };
  const leading = weightChange === 0 ? repsChange : weightChange;
  const direction = leading > 0 ? 'up' : 'down';
  const texts: string[] = [];
  const labels: string[] = [];
  if (weightChange !== 0) {
    texts.push(`${signed(weightChange)} ${unit}`);
    labels.push(weightLabel(weightChange, unit));
  }
  if (repsChange !== 0) {
    texts.push(`${signed(repsChange)} ${Math.abs(repsChange) === 1 ? 'rep' : 'reps'}`);
    labels.push(repsLabel(repsChange));
  }
  return {
    direction,
    text: `${direction === 'up' ? '▲' : '▼'} ${texts.join(' ')}`,
    label: `${labels.join(' and ')} than last time`,
  };
}
