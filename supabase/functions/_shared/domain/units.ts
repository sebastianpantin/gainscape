import { roundTo } from './math.ts';

export type WeightUnit = 'kg' | 'lb';

export const KG_PER_LB = 0.45359237;

export const STORED_KG_DECIMALS = 2;

export const SHOWN_LB_DECIMALS = 1;

export interface UnitAmount {
  kg: number;
  lb: number;
}

export function unitToKg(value: number, unit: WeightUnit): number {
  return roundTo(STORED_KG_DECIMALS, unit === 'kg' ? value : value * KG_PER_LB);
}

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg / KG_PER_LB;
}

export function amountInUnit(amount: UnitAmount, unit: WeightUnit): number {
  return amount[unit];
}

export function shownWeight(kg: number, unit: WeightUnit): number {
  return roundTo(unit === 'kg' ? STORED_KG_DECIMALS : SHOWN_LB_DECIMALS, kgToUnit(kg, unit));
}
