export const FLOAT_TOLERANCE = 1e-9;

export function roundTo(decimals: number, value: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function isWholeNumberBetween(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
}

export function nonNegativeIntegerPercent(field: string, percent: number): number {
  if (!Number.isInteger(percent) || percent < 0) {
    throw new RangeError(`${field} must be a non-negative integer, got ${percent}`);
  }
  return percent;
}

const EPLEY_REPS_PER_LOAD_RATIO = 30;

export function loadRatioAtFailure(reps: number): number {
  return 1 + (reps - 1) / EPLEY_REPS_PER_LOAD_RATIO;
}

export function repsAtFailure(loadRatio: number): number {
  return 1 + EPLEY_REPS_PER_LOAD_RATIO * (loadRatio - 1);
}
