import type { SessionSummary } from '@domain/types.ts';
import type { LoadType } from './catalog-rules.ts';
import type { UnitPref } from './profile.ts';
import { formatWeight } from './units.ts';

export function formatLoad(loadKg: number, loadType: LoadType, unit: UnitPref = 'kg'): string {
  const weight = formatWeight(loadKg, unit);
  return loadType === 'bodyweight_plus' ? `+${weight}` : weight;
}

export function formatXp(xp: number): string {
  return xp.toLocaleString('en-US');
}

export function sessionXp(summary: Pick<SessionSummary, 'xpBySkill'>): number {
  return Object.values(summary.xpBySkill ?? {}).reduce((sum, xp) => sum + xp, 0);
}

export function formatSessionDate(localDate: string): string {
  return new Date(`${localDate}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
