import { combatLevel, levelProgress, type LevelProgress, totalLevel } from '@domain/index.ts';
import { useEffect, useState } from 'react';
import { fetchSkills, fetchSkillXp, type Skill } from './catalog.ts';

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

export async function fetchStanding(userId: string): Promise<Standing> {
  const [skills, xpBySkillId] = await Promise.all([fetchSkills(), fetchSkillXp(userId)]);
  return standingFrom(skills, xpBySkillId);
}

export type StandingState =
  { status: 'loading' } | { status: 'failed'; problem: string } | { status: 'ready'; standing: Standing };

export function useStanding(userId: string): StandingState {
  const [state, setState] = useState<StandingState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    fetchStanding(userId).then(
      (standing) => active && setState({ status: 'ready', standing }),
      (error: Error) => active && setState({ status: 'failed', problem: error.message }),
    );
    return () => {
      active = false;
    };
  }, [userId]);

  return state;
}
