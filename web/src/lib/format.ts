import type { SessionSummary } from '@domain/types.ts';
import type { LoadType } from './exercises/catalog-rules.ts';
import type { UnitPref } from './profile/profile.ts';
import { formatWeight } from './units.ts';

export function formatLoad(loadKg: number, loadType: LoadType, unit: UnitPref = 'kg'): string {
  const weight = formatWeight(loadKg, unit);
  return loadType === 'bodyweight_plus' ? `+${weight}` : weight;
}

export function formatXp(xp: number): string {
  return xp.toLocaleString('en-US');
}

export function formatCount(count: number, noun: string): string {
  return `${formatXp(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function totalXp(xpBySkill: Readonly<Record<string, number>> | undefined): number {
  return Object.values(xpBySkill ?? {}).reduce((sum, xp) => sum + xp, 0);
}

export function sessionXp(summary: Pick<SessionSummary, 'xpBySkill'>): number {
  return totalXp(summary.xpBySkill);
}

export function sessionGearBonus(summary: Pick<SessionSummary, 'gearBonusBySkill'>): number {
  return totalXp(summary.gearBonusBySkill);
}

export function sessionChallengeBonus(summary: Pick<SessionSummary, 'challengeBonusBySkill'>): number {
  return totalXp(summary.challengeBonusBySkill);
}

export function formatSessionDate(localDate: string): string {
  return new Date(`${localDate}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
