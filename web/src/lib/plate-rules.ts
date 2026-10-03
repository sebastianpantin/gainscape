import { type WeightUnit } from '@domain/index.ts';

export const STANDARD_PLATES: Readonly<Record<WeightUnit, readonly number[]>> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export function platesPerSide(
  total: number,
  barWeight: number,
  unit: WeightUnit,
  availablePlates: readonly number[] = STANDARD_PLATES[unit],
): number[] | null {
  throw new Error(
    `platesPerSide is not implemented: ${total} ${unit} on a ${barWeight} bar with ${availablePlates.length} plates`,
  );
}

export function platesLabel(plates: readonly number[] | null): string | null {
  throw new Error(`platesLabel is not implemented: ${JSON.stringify(plates)}`);
}
