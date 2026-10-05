import { FLOAT_TOLERANCE, roundTo, type WeightUnit } from '@domain/index.ts';

export interface BarbellSetup {
  barWeight: number;
  plates: number[];
}

export type PlateSettings = Record<WeightUnit, BarbellSetup>;

const STANDARD_PLATES: Readonly<Record<WeightUnit, readonly number[]>> = {
  kg: [25, 20, 15, 10, 5, 2.5, 1.25],
  lb: [45, 35, 25, 10, 5, 2.5],
};

export const DEFAULT_PLATE_SETTINGS: PlateSettings = {
  kg: { barWeight: 20, plates: [...STANDARD_PLATES.kg] },
  lb: { barWeight: 45, plates: [...STANDARD_PLATES.lb] },
};

export const PLATE_CHOICES: Readonly<Record<WeightUnit, readonly number[]>> = {
  kg: [50, 25, 20, 15, 10, 5, 2.5, 2, 1.25, 1, 0.5, 0.25],
  lb: [55, 45, 35, 25, 15, 10, 5, 2.5, 1.25],
};

export const HEAVIEST_BAR_OR_PLATE = 100;

const PLATE_DECIMALS = 4;
const HUNDREDTHS = 100;
const UNREACHABLE = -1;

function hundredths(weight: number): number {
  return Math.round(weight * HUNDREDTHS);
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

function fewestPlatesTo(highestStep: number, plateSteps: readonly number[]): Int32Array {
  const fewest = new Int32Array(highestStep + 1).fill(UNREACHABLE);
  fewest[0] = 0;
  for (let step = 1; step <= highestStep; step++) {
    for (const plate of plateSteps) {
      const before = step - plate;
      if (before < 0 || fewest[before] === UNREACHABLE) continue;
      if (fewest[step] === UNREACHABLE || fewest[before] + 1 < fewest[step]) fewest[step] = fewest[before] + 1;
    }
  }
  return fewest;
}

interface PlateGrid {
  plates: number[];
  plateSteps: number[];
  stepWeight: number;
}

function plateGrid(availablePlates: readonly number[]): PlateGrid | null {
  const plates = [...new Set(availablePlates.filter((plate) => hundredths(plate) > 0))].sort((a, b) => b - a);
  if (plates.length === 0) return null;
  const stepHundredths = plates.map(hundredths).reduce(greatestCommonDivisor);
  return {
    plates,
    plateSteps: plates.map((plate) => hundredths(plate) / stepHundredths),
    stepWeight: stepHundredths / HUNDREDTHS,
  };
}

export function platesPerSide(
  total: number,
  barWeight: number,
  unit: WeightUnit,
  availablePlates: readonly number[] = STANDARD_PLATES[unit],
): number[] | null {
  const perSide = roundTo(PLATE_DECIMALS, (total - barWeight) / 2);
  if (perSide < -FLOAT_TOLERANCE) return null;
  if (Math.abs(perSide) < FLOAT_TOLERANCE) return [];
  const grid = plateGrid(availablePlates);
  if (grid === null) return null;
  const exactSteps = perSide / grid.stepWeight;
  const target = Math.round(exactSteps);
  if (Math.abs(exactSteps - target) > FLOAT_TOLERANCE) return null;
  return heaviestFirst(target, grid) ?? fewestPlates(target, grid);
}

function heaviestFirst(target: number, grid: PlateGrid): number[] | null {
  const loaded: number[] = [];
  let left = target;
  for (const [index, plate] of grid.plateSteps.entries()) {
    while (left >= plate) {
      loaded.push(grid.plates[index]);
      left -= plate;
    }
  }
  return left === 0 ? loaded : null;
}

function fewestPlates(target: number, grid: PlateGrid): number[] | null {
  const fewest = fewestPlatesTo(target, grid.plateSteps);
  if (fewest[target] === UNREACHABLE) return null;
  const loaded: number[] = [];
  for (let left = target; left > 0;) {
    const index = grid.plateSteps.findIndex((plate) => left - plate >= 0 && fewest[left - plate] === fewest[left] - 1);
    loaded.push(grid.plates[index]);
    left -= grid.plateSteps[index];
  }
  return loaded;
}

export function nearestLoadable(total: number, barWeight: number, availablePlates: readonly number[]): number {
  const grid = plateGrid(availablePlates);
  if (grid === null || total <= barWeight) return barWeight;
  const targetSteps = (total - barWeight) / 2 / grid.stepWeight;
  const fewest = fewestPlatesTo(Math.ceil(targetSteps) + Math.max(...grid.plateSteps), grid.plateSteps);
  let lighter = Math.floor(targetSteps);
  while (fewest[lighter] === UNREACHABLE) lighter--;
  let heavier = Math.ceil(targetSteps);
  while (fewest[heavier] === UNREACHABLE) heavier++;
  const nearest = heavier - targetSteps < targetSteps - lighter - FLOAT_TOLERANCE ? heavier : lighter;
  return roundTo(PLATE_DECIMALS, barWeight + 2 * nearest * grid.stepWeight);
}

function loadedPlatesLabel(plates: readonly number[]): string {
  return plates.length === 0 ? 'Empty bar' : `${plates.join(' + ')} per side`;
}

export function platesLabel(plates: readonly number[] | null): string | null {
  return plates === null ? null : loadedPlatesLabel(plates);
}

export function barbellPlatesText(total: number, setup: BarbellSetup, unit: WeightUnit): string {
  const exact = platesPerSide(total, setup.barWeight, unit, setup.plates);
  if (exact !== null) return loadedPlatesLabel(exact);
  const nearest = nearestLoadable(total, setup.barWeight, setup.plates);
  const nearestPlates = platesPerSide(nearest, setup.barWeight, unit, setup.plates) ?? [];
  return `Nearest ${nearest} ${unit}: ${loadedPlatesLabel(nearestPlates)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isUsableBarOrPlate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= HEAVIEST_BAR_OR_PLATE;
}

function parsedSetup(raw: unknown, fallback: BarbellSetup): BarbellSetup {
  if (!isRecord(raw)) return { ...fallback, plates: [...fallback.plates] };
  const barWeight = isUsableBarOrPlate(raw.barWeight) ? raw.barWeight : fallback.barWeight;
  const plates = Array.isArray(raw.plates)
    ? [...new Set(raw.plates.filter(isUsableBarOrPlate))].sort((a, b) => b - a)
    : [...fallback.plates];
  return { barWeight, plates };
}

function parsedJson(raw: string | null): unknown {
  try {
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parsePlateSettings(raw: string | null): PlateSettings {
  const parsed = parsedJson(raw);
  const saved = isRecord(parsed) ? parsed : {};
  return {
    kg: parsedSetup(saved.kg, DEFAULT_PLATE_SETTINGS.kg),
    lb: parsedSetup(saved.lb, DEFAULT_PLATE_SETTINGS.lb),
  };
}
