import type { Modality } from '../../lib/catalog.ts';
import type { SkillShare } from '../../lib/custom-exercises.ts';

export const BASIS_POINTS_PER_PERCENT = 100;

export interface ShareForm {
  skillIds: string[];
  percents: Record<string, string>;
  locked: boolean;
  storedShares: SkillShare[];
}

function isBlank(raw: string | undefined): boolean {
  return raw === undefined || raw.trim() === '';
}

function wholePercent(raw: string | undefined): number | null {
  if (isBlank(raw)) return 0;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

export function percentsFromShares(shares: SkillShare[]): Record<string, string> {
  return Object.fromEntries(shares.map((share) => [share.skillId, String(share.shareBp / BASIS_POINTS_PER_PERCENT)]));
}

export function shareTotal({ skillIds, percents }: ShareForm): number {
  return skillIds.reduce((sum, skillId) => sum + (wholePercent(percents[skillId]) ?? 0), 0);
}

export function sharesToSave(form: ShareForm): SkillShare[] | null {
  if (form.locked) return form.storedShares;
  const percents = form.skillIds.map((skillId) => ({ skillId, percent: wholePercent(form.percents[skillId]) }));
  if (percents.some(({ percent }) => percent === null) || shareTotal(form) !== 100) return null;
  return percents
    .filter(({ percent }) => percent! > 0)
    .map(({ skillId, percent }) => ({ skillId, shareBp: percent! * BASIS_POINTS_PER_PERCENT }));
}

export function skillsForModality<S extends { modality: Modality }>(skills: readonly S[], modality: Modality): S[] {
  return skills.filter((skill) => skill.modality === modality);
}
