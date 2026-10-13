import type { Modality } from '../../lib/exercises/catalog-rules.ts';
import type { SkillShare } from '../../lib/exercises/custom-exercises.ts';

const BASIS_POINTS_PER_PERCENT = 100;

export interface ShareForm {
  skillIds: string[];
  percents: Record<string, string>;
  locked: boolean;
  storedShares: SkillShare[];
  soloSkills?: readonly { id: string; name: string }[];
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

function chosenSkillIds({ skillIds, percents }: ShareForm): string[] {
  return skillIds.filter((skillId) => (wholePercent(percents[skillId]) ?? 1) > 0);
}

function mixedSoloSkill(form: ShareForm): { id: string; name: string } | null {
  const chosen = chosenSkillIds(form);
  if (form.locked || chosen.length < 2) return null;
  return (form.soloSkills ?? []).find((skill) => chosen.includes(skill.id)) ?? null;
}

export function mixedSoloShareText(form: ShareForm): string | null {
  const solo = mixedSoloSkill(form);
  return solo === null ? null : `${solo.name} trains alone: give it 100% or leave it out.`;
}

export function sharesToSave(form: ShareForm): SkillShare[] | null {
  if (form.locked) return form.storedShares;
  const percents = form.skillIds.map((skillId) => ({ skillId, percent: wholePercent(form.percents[skillId]) }));
  if (percents.some(({ percent }) => percent === null) || shareTotal(form) !== 100) return null;
  if (mixedSoloSkill(form) !== null) return null;
  return percents
    .filter(({ percent }) => percent! > 0)
    .map(({ skillId, percent }) => ({ skillId, shareBp: percent! * BASIS_POINTS_PER_PERCENT }));
}

export function skillsForModality<S extends { modality: Modality }>(skills: readonly S[], modality: Modality): S[] {
  return skills.filter((skill) => skill.modality === modality);
}
