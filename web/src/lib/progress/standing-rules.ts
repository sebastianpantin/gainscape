import { combatLevel, levelProgress, type LevelProgress, totalLevel } from '@domain/index.ts';
import type { Skill } from '../exercises/catalog-rules.ts';
import { formatXp } from '../format.ts';

export interface SkillStanding {
  skill: Skill;
  progress: LevelProgress;
}

export interface Standing {
  skills: SkillStanding[];
  totalLevel: number;
  combatLevel: number;
}

const MONOGRAMS: Record<string, string> = {
  chest: 'CH',
  back: 'BK',
  shoulders: 'SH',
  arms: 'AR',
  legs: 'LG',
  core: 'CR',
};

export function monogramFor(skillKey: string): string {
  return MONOGRAMS[skillKey] ?? skillKey.slice(0, 2).toUpperCase();
}

export function standingFrom(skills: Skill[], xpBySkillId: Map<string, number>): Standing {
  const standings = skills.map((skill) => ({ skill, progress: levelProgress(xpBySkillId.get(skill.id) ?? 0) }));
  return {
    skills: standings,
    totalLevel: totalLevel(standings.map((standing) => standing.progress.level)),
    combatLevel: combatLevel(
      standings.map((standing) => ({ level: standing.progress.level, weight: standing.skill.combatWeight })),
    ),
  };
}

export function skillXpText(xp: number): string {
  const { level, nextLevelXp } = levelProgress(xp);
  return nextLevelXp === null ? `${formatXp(xp)} XP` : `${formatXp(nextLevelXp - xp)} XP to ${level + 1}`;
}
