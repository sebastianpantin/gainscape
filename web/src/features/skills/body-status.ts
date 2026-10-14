import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { exerciseListQuery, profileQuery, recentSetsQuery } from '../../lib/query/queries.ts';
import { type LoadedState, loadedState } from '../../lib/query/query-state-rules.ts';
import { type BodySkill, hardSetLoad } from '../../lib/progress/recovery-rules.ts';
import { type MuscleVolume, weeklySetsByMuscle, weekStartIn } from '../../lib/progress/weekly-volume-rules.ts';

export interface BodyStatus {
  recovery: LoadedState<Record<BodySkill, number>>;
  volume: LoadedState<Record<BodySkill, MuscleVolume>>;
}

function notLoaded(error: Error | null): LoadedState<never> {
  return loadedState<never>(undefined, error);
}

export function useBodyStatus(userId: string): BodyStatus {
  const recent = useQuery(recentSetsQuery(userId));
  const exercises = useQuery(exerciseListQuery(userId));
  const profile = useQuery(profileQuery(userId));
  const [openedAt] = useState(Date.now);
  if (!recent.data || !exercises.data) {
    const recovery = notLoaded(recent.error ?? exercises.error);
    return { recovery, volume: recovery.status === 'failed' ? recovery : notLoaded(profile.error) };
  }
  const now = Math.max(openedAt, recent.dataUpdatedAt);
  const shares = new Map(exercises.data.map((exercise) => [exercise.id, exercise.skillShares]));
  const recovery = { status: 'ready', data: hardSetLoad(recent.data, shares, now) } as const;
  if (!profile.data) return { recovery, volume: notLoaded(profile.error) };
  const volume = weeklySetsByMuscle(
    recent.data,
    new Map(exercises.data.map((exercise) => [exercise.id, exercise])),
    weekStartIn(profile.data.loaded.timezone, now),
  );
  return { recovery, volume: { status: 'ready', data: volume } };
}
