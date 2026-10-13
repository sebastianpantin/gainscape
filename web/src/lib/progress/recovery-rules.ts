import { DEFAULT_BALANCE } from '@domain/balance.ts';
import { effortProximity } from '@domain/fatigue.ts';
import { type SupabaseClient } from '@supabase/supabase-js';

export const BODY_SKILLS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'grip'] as const;
export type BodySkill = (typeof BODY_SKILLS)[number];
export type RecoveryState = 'recovering' | 'easing' | 'fresh';

export interface RecentSet {
  exerciseId: string;
  endedAt: string;
  rir: number;
}

export interface SkillShare {
  skillKey: string;
  shareBasisPoints: number;
}

export const RECOVERY_LOOKBACK_DAYS = 7;

const MS_PER_HOUR = 3_600_000;
const HALF_LIFE_HOURS = 36;
const RECOVERING_HARD_SETS = 1;
const EASING_HARD_SETS = 0.4;
const BASIS_POINTS = 10_000;

function isBodySkill(skillKey: string): skillKey is BodySkill {
  return (BODY_SKILLS as readonly string[]).includes(skillKey);
}

export function hardSetLoad(
  sets: readonly RecentSet[],
  sharesByExerciseId: ReadonlyMap<string, readonly SkillShare[]>,
  now: number,
): Record<BodySkill, number> {
  const load = Object.fromEntries(BODY_SKILLS.map((skill) => [skill, 0])) as Record<BodySkill, number>;
  for (const set of sets) {
    const hoursAgo = Math.max(0, now - Date.parse(set.endedAt)) / MS_PER_HOUR;
    const remaining = effortProximity(set.rir, DEFAULT_BALANCE) * 0.5 ** (hoursAgo / HALF_LIFE_HOURS);
    for (const share of sharesByExerciseId.get(set.exerciseId) ?? []) {
      if (isBodySkill(share.skillKey)) load[share.skillKey] += (remaining * share.shareBasisPoints) / BASIS_POINTS;
    }
  }
  return load;
}

export type RirSource = 'logged' | 'estimated' | 'cold_start' | 'default';

export function rirForRecovery(rir: number | string | null, source: RirSource): number {
  if (rir !== null) return Number(rir);
  return source === 'default'
    ? DEFAULT_BALANCE.effortLevelRir[DEFAULT_BALANCE.holdDefaultEffort]
    : DEFAULT_BALANCE.coldStartAssumedRir;
}

export function recoveryState(hardSetsLeft: number): RecoveryState {
  if (hardSetsLeft >= RECOVERING_HARD_SETS) return 'recovering';
  return hardSetsLeft >= EASING_HARD_SETS ? 'easing' : 'fresh';
}

export function recoveryBySkill(
  sets: readonly RecentSet[],
  sharesByExerciseId: ReadonlyMap<string, readonly SkillShare[]>,
  now: number,
): Record<BodySkill, RecoveryState> {
  const load = hardSetLoad(sets, sharesByExerciseId, now);
  return Object.fromEntries(BODY_SKILLS.map((skill) => [skill, recoveryState(load[skill])])) as Record<
    BodySkill,
    RecoveryState
  >;
}

export function recoveryGroups(
  states: Readonly<Record<BodySkill, RecoveryState>>,
  nameOf: (skill: BodySkill) => string,
): Record<RecoveryState, string[]> {
  const groups: Record<RecoveryState, string[]> = { recovering: [], easing: [], fresh: [] };
  for (const skill of BODY_SKILLS) groups[states[skill]].push(nameOf(skill));
  return groups;
}

const RECENT_SET_COLUMNS = 'exercise_id,rir,rir_source,sessions!inner(ended_at)';

interface RecentSetRow {
  exercise_id: string;
  rir: number | string | null;
  rir_source: RirSource;
  sessions: { ended_at: string };
}

export async function queryRecentSets(client: SupabaseClient, since: Date): Promise<RecentSet[]> {
  const { data, error } = await client
    .from('sets')
    .select(RECENT_SET_COLUMNS)
    .eq('is_warmup', false)
    .gte('sessions.ended_at', since.toISOString());
  if (error) throw error;
  return (data as unknown as RecentSetRow[]).map((row) => ({
    exerciseId: row.exercise_id,
    rir: rirForRecovery(row.rir, row.rir_source),
    endedAt: row.sessions.ended_at,
  }));
}
