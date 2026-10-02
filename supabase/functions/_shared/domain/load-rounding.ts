import { type WeightUnit } from './units.ts';

export type RoundingMode = 'nearest' | 'down';

export interface RoundingSetting {
  increment: number;
  mode: RoundingMode;
  barWeight: number;
}

export const ROUNDING_EPSILON = 1e-9;

export const DEFAULT_ROUNDING: Readonly<Record<WeightUnit, RoundingSetting>> = Object.freeze({
  kg: Object.freeze({ increment: 2.5, mode: 'nearest', barWeight: 20 }),
  lb: Object.freeze({ increment: 5, mode: 'nearest', barWeight: 45 }),
});

export const roundLoad: (value: number, increment: number, mode: RoundingMode) => number = () => {
  throw new Error('not implemented');
};

export const roundPrescribedLoad: (value: number, rounding: RoundingSetting) => number = () => {
  throw new Error('not implemented');
};

export const halfIncrementKg: (rounding: RoundingSetting, unit: WeightUnit) => number = () => {
  throw new Error('not implemented');
};
