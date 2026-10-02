import { useEffect, useState } from 'react';
import { fetchSkills, fetchSkillXp } from './catalog.ts';
import { type Standing, standingFrom } from './standing-rules.ts';

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
