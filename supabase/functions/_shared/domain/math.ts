export const FLOAT_TOLERANCE = 1e-9;

export function roundTo(decimals: number, value: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

const EPLEY_REPS_PER_LOAD_RATIO = 30;

export function loadRatioAtFailure(reps: number): number {
  return 1 + (reps - 1) / EPLEY_REPS_PER_LOAD_RATIO;
}

export function repsAtFailure(loadRatio: number): number {
  return 1 + EPLEY_REPS_PER_LOAD_RATIO * (loadRatio - 1);
}
