import type { LoadType } from './catalog.ts';

export function formatLoad(loadKg: number, loadType: LoadType): string {
  const kilograms = `${Number.isInteger(loadKg) ? loadKg : loadKg.toFixed(1)} kg`;
  return loadType === 'bodyweight_plus' ? `+${kilograms}` : kilograms;
}
