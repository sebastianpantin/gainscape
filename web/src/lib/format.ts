import type { LoadType } from './catalog-rules.ts';
import type { UnitPref } from './profile.ts';
import { formatWeight } from './units.ts';

export function formatLoad(loadKg: number, loadType: LoadType, unit: UnitPref = 'kg'): string {
  const weight = formatWeight(loadKg, unit);
  return loadType === 'bodyweight_plus' ? `+${weight}` : weight;
}
