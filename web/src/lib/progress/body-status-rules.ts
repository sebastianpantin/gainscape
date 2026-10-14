import { type LoadedState } from '../query/query-state-rules.ts';
import { type BodySkill, hardSetLoad, type RecentSet, type SkillShare } from './recovery-rules.ts';
import { type MuscleVolume, type VolumeExercise, weeklySetsByMuscle, weekStartIn } from './weekly-volume-rules.ts';

export const RECENT_SETS_FAILED_TEXT = "Couldn't load your recent sets and exercises for recovery and weekly sets.";
export const PROFILE_FAILED_TEXT = "Couldn't load your time zone, so this week's sets can't be counted.";

export interface BodyStatus {
  recovery: LoadedState<Record<BodySkill, number>>;
  volume: LoadedState<Record<BodySkill, MuscleVolume>>;
}

interface Loading<T> {
  data: T | undefined;
  error: Error | null;
}

export interface BodyStatusInputs {
  recent: Loading<readonly RecentSet[]> & { updatedAt: number };
  exercises: Loading<readonly (VolumeExercise & { id: string; skillShares: readonly SkillShare[] })[]>;
  profile: Loading<{ timezone: string }>;
  openedAt: number;
}

const LOADING = { status: 'loading' } as const;

function failed(problem: string) {
  return { status: 'failed', problem } as const;
}

export function bodyStatusFrom({ recent, exercises, profile, openedAt }: BodyStatusInputs): BodyStatus {
  if (!recent.data || !exercises.data) {
    if (recent.error || exercises.error) {
      const problem = failed(RECENT_SETS_FAILED_TEXT);
      return { recovery: problem, volume: problem };
    }
    return { recovery: LOADING, volume: profile.error ? failed(PROFILE_FAILED_TEXT) : LOADING };
  }
  const now = Math.max(openedAt, recent.updatedAt);
  const shares = new Map(exercises.data.map((exercise) => [exercise.id, exercise.skillShares]));
  const recovery = { status: 'ready', data: hardSetLoad(recent.data, shares, now) } as const;
  if (!profile.data) return { recovery, volume: profile.error ? failed(PROFILE_FAILED_TEXT) : LOADING };
  const volume = weeklySetsByMuscle(
    recent.data,
    new Map(exercises.data.map((exercise) => [exercise.id, exercise])),
    weekStartIn(profile.data.timezone, now),
  );
  return { recovery, volume: { status: 'ready', data: volume } };
}
