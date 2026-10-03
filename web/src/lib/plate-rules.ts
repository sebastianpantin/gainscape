import { FLOAT_TOLERANCE, roundTo, type WeightUnit } from '@domain/index.ts';

const STANDARD_PLATES: Readonly<Record<WeightUnit, readonly number[]>> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

const PLATE_DECIMALS = 4;

export function platesPerSide(
  total: number,
  barWeight: number,
  unit: WeightUnit,
  availablePlates: readonly number[] = STANDARD_PLATES[unit],
): number[] | null {
  let remaining = roundTo(PLATE_DECIMALS, (total - barWeight) / 2);
  if (remaining < -FLOAT_TOLERANCE) return null;
  const plates: number[] = [];
  for (const plate of [...availablePlates].sort((a, b) => b - a)) {
    while (plate > 0 && remaining - plate > -FLOAT_TOLERANCE) {
      plates.push(plate);
      remaining = roundTo(PLATE_DECIMALS, remaining - plate);
    }
  }
  return Math.abs(remaining) < FLOAT_TOLERANCE ? plates : null;
}

export function platesLabel(plates: readonly number[] | null): string | null {
  if (plates === null) return null;
  return plates.length === 0 ? 'Empty bar' : `${plates.join(' + ')} per side`;
}
