export const FLOAT_TOLERANCE = 1e-9;

export function roundTo(decimals: number, value: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
