import { type SkillDef, xpForLevel } from '../../supabase/functions/_shared/domain/index.ts';

export const SIMULATION_SEED = 42;
export const DAY_MS = 24 * 60 * 60 * 1000;
export const LEVEL_99_XP = xpForLevel(99);

export function skillProgress(skills: readonly SkillDef[]) {
  const cumulativeXpByWeek: Record<string, number[]> = Object.fromEntries(skills.map((skill) => [skill.key, []]));
  const weeksToLevel99: Record<string, number | null> = Object.fromEntries(skills.map((skill) => [skill.key, null]));
  const recordWeek = (week: number, skillXp: Readonly<Record<string, number>>) => {
    for (const skill of skills) {
      const xp = skillXp[skill.id] ?? 0;
      cumulativeXpByWeek[skill.key].push(xp);
      if (weeksToLevel99[skill.key] === null && xp >= LEVEL_99_XP) weeksToLevel99[skill.key] = week + 1;
    }
  };
  return { cumulativeXpByWeek, weeksToLevel99, recordWeek };
}
