import { FLOAT_TOLERANCE, roundTo } from './math.ts';
import { KG_PER_LB, type WeightUnit } from './units.ts';

export type RoundingMode = 'nearest' | 'down';

type LoadRoundingDirection = RoundingMode | 'up';

export interface RoundingSetting {
  increment: number;
  mode: RoundingMode;
  barWeight: number;
}

export const DEFAULT_ROUNDING: Readonly<Record<WeightUnit, RoundingSetting>> = Object.freeze({
  kg: Object.freeze({ increment: 2.5, mode: 'nearest', barWeight: 20 }),
  lb: Object.freeze({ increment: 5, mode: 'nearest', barWeight: 45 }),
});

function decimalPlaces(value: number): number {
  const [, fraction = ''] = String(value).split('.');
  return fraction.length;
}

export function roundLoad(value: number, increment: number, mode: LoadRoundingDirection): number {
  const steps = value / increment + FLOAT_TOLERANCE;
  const wholeSteps =
    mode === 'up'
      ? Math.ceil(value / increment - FLOAT_TOLERANCE)
      : mode === 'nearest'
        ? Math.floor(steps + 0.5)
        : Math.floor(steps);
  return roundTo(decimalPlaces(increment), wholeSteps * increment);
}

export function roundPrescribedLoad(value: number, rounding: RoundingSetting, onBar = true): number {
  const lightest = onBar ? rounding.barWeight : rounding.increment;
  return Math.max(lightest, roundLoad(value, rounding.increment, rounding.mode));
}

export function halfIncrementKg(rounding: RoundingSetting, unit: WeightUnit): number {
  const halfIncrement = rounding.increment / 2;
  return unit === 'kg' ? halfIncrement : halfIncrement * KG_PER_LB;
}
