import { SECONDS_PER_MINUTE } from '@domain/cardio.ts';
import { roundTo } from '@domain/math.ts';
import { kgToUnit, shownWeight } from '@domain/units.ts';
import type { PaceUnit } from './catalog-rules.ts';
import type { UnitPref } from './profile-rules.ts';

export { KG_PER_LB, kgToUnit, shownWeight, unitToKg } from '@domain/units.ts';

const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

export function formatWeight(kg: number, unit: UnitPref): string {
  return `${shownWeight(kg, unit)} ${unit}`;
}

export const WEIGHT_INPUT_STEP = 0.5;

export function highestWeightInUnit(highestKg: number, unit: UnitPref): number {
  return Math.floor(kgToUnit(highestKg, unit));
}

export interface FeetAndInches {
  feet: number;
  inches: number;
}

export function cmToFeetAndInches(cm: number): FeetAndInches {
  const totalInches = Math.round(cm / CM_PER_INCH);
  return { feet: Math.floor(totalInches / INCHES_PER_FOOT), inches: totalInches % INCHES_PER_FOOT };
}

export function feetAndInchesToCm({ feet, inches }: FeetAndInches): number {
  return roundTo(1, (feet * INCHES_PER_FOOT + inches) * CM_PER_INCH);
}

export function formatHeight(cm: number, unit: UnitPref): string {
  if (unit === 'kg') return `${roundTo(1, cm)} cm`;
  const { feet, inches } = cmToFeetAndInches(cm);
  return `${feet} ft ${inches} in`;
}

export type DistanceUnit = 'km' | 'mi' | 'm' | 'yd';

const METRES_PER_DISTANCE_UNIT: Record<DistanceUnit, number> = { km: 1000, mi: 1609.344, m: 1, yd: 0.9144 };
const SHOWN_DISTANCE_DECIMALS: Record<DistanceUnit, number> = { km: 2, mi: 2, m: 0, yd: 0 };
const PACE_DISTANCE: Record<DistanceUnit, { units: number; label: string }> = {
  km: { units: 1, label: '/km' },
  mi: { units: 1, label: '/mi' },
  m: { units: 100, label: '/100 m' },
  yd: { units: 100, label: '/100 yd' },
};
const STORED_DISTANCE_DECIMALS = 1;

export function distanceUnitFor(unit: UnitPref, paceUnit: PaceUnit): DistanceUnit {
  if (paceUnit === 'per_100m') return unit === 'kg' ? 'm' : 'yd';
  return unit === 'kg' ? 'km' : 'mi';
}

export function distanceInUnit(distanceM: number, unit: DistanceUnit): number {
  return distanceM / METRES_PER_DISTANCE_UNIT[unit];
}

export function unitToDistanceM(value: number, unit: DistanceUnit): number {
  return roundTo(STORED_DISTANCE_DECIMALS, value * METRES_PER_DISTANCE_UNIT[unit]);
}

export function shownDistance(distanceM: number, unit: DistanceUnit): number {
  return roundTo(SHOWN_DISTANCE_DECIMALS[unit], distanceInUnit(distanceM, unit));
}

export function distanceInputStep(unit: DistanceUnit): number {
  return 10 ** -SHOWN_DISTANCE_DECIMALS[unit];
}

export function formatDistance(distanceM: number, unit: DistanceUnit): string {
  return `${shownDistance(distanceM, unit)} ${unit}`;
}

export function formatPace(durationS: number, distanceM: number, unit: DistanceUnit): string {
  const { units, label } = PACE_DISTANCE[unit];
  const seconds = Math.round((durationS * units) / distanceInUnit(distanceM, unit));
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  const rest = String(seconds % SECONDS_PER_MINUTE).padStart(2, '0');
  return `${minutes}:${rest} ${label}`;
}
