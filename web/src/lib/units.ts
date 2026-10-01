import { roundTo } from '@domain/strength.ts';
import type { UnitPref } from './profile-rules.ts';

export const KG_PER_LB = 0.45359237;
const CM_PER_INCH = 2.54;
const INCHES_PER_FOOT = 12;

const STORED_KG_DECIMALS = 2;
const SHOWN_DECIMALS = 1;

export function kgToUnit(kg: number, unit: UnitPref): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function unitToKg(value: number, unit: UnitPref): number {
  return roundTo(STORED_KG_DECIMALS, unit === 'kg' ? value : value * KG_PER_LB);
}

export function shownWeight(kg: number, unit: UnitPref): number {
  return roundTo(unit === 'kg' ? STORED_KG_DECIMALS : SHOWN_DECIMALS, kgToUnit(kg, unit));
}

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
