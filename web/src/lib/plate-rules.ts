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

function groupedPlates(plates: readonly number[]): string {
  const counts = new Map<number, number>();
  for (const plate of plates) counts.set(plate, (counts.get(plate) ?? 0) + 1);
  return [...counts].map(([plate, count]) => (count > 1 ? `${count}×${plate}` : String(plate))).join(' + ');
}

function loadedPlatesLabel(plates: readonly number[], unit: WeightUnit): string {
  return plates.length === 0 ? 'Empty bar' : `${groupedPlates(plates)} ${unit} each side`;
}

export function platesLabel(plates: readonly number[] | null, unit: WeightUnit): string | null {
  return plates === null ? null : loadedPlatesLabel(plates, unit);
}

export interface BarbellPlates {
  plates: number[];
  nearest: number | null;
}

export function barbellPlates(total: number, setup: BarbellSetup, unit: WeightUnit): BarbellPlates {
  const exact = platesPerSide(total, setup.barWeight, unit, setup.plates);
  if (exact !== null) return { plates: exact, nearest: null };
  const nearest = nearestLoadable(total, setup.barWeight, setup.plates);
  return { plates: platesPerSide(nearest, setup.barWeight, unit, setup.plates) ?? [], nearest };
}

export function barbellPlatesText(total: number, setup: BarbellSetup, unit: WeightUnit): string {
  const { plates, nearest } = barbellPlates(total, setup, unit);
  const label = loadedPlatesLabel(plates, unit);
  return nearest === null ? label : `Nearest ${nearest} ${unit}: ${label}`;
}

export type PlateTone = 'red' | 'blue' | 'yellow' | 'green' | 'white' | 'steel';
export type PlateSize = 'full' | 'large' | 'medium' | 'small';

const PLATE_TONES: Readonly<Record<WeightUnit, ReadonlyMap<number, PlateTone>>> = {
  kg: new Map([
    [50, 'red'],
    [25, 'red'],
    [20, 'blue'],
    [15, 'yellow'],
    [10, 'green'],
    [5, 'white'],
    [2.5, 'red'],
    [2, 'blue'],
    [1.5, 'yellow'],
    [1, 'green'],
    [0.5, 'white'],
  ]),
  lb: new Map([
    [55, 'red'],
    [45, 'blue'],
    [35, 'yellow'],
    [25, 'green'],
    [15, 'white'],
    [10, 'white'],
  ]),
};

const PLATE_SIZE_FLOORS: Readonly<Record<WeightUnit, readonly [number, PlateSize][]>> = {
  kg: [
    [15, 'full'],
    [10, 'large'],
    [5, 'medium'],
  ],
  lb: [
    [35, 'full'],
    [25, 'large'],
    [10, 'medium'],
  ],
};

export function plateLook(plate: number, unit: WeightUnit): { tone: PlateTone; size: PlateSize } {
  const size = PLATE_SIZE_FLOORS[unit].find(([floor]) => plate >= floor)?.[1] ?? 'small';
  return { tone: PLATE_TONES[unit].get(plate) ?? 'steel', size };
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
