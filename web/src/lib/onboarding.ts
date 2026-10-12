import { failFastWhenOffline } from '../offline/cache-first.ts';
import { type TrainingHistory, trainingHistoryOf } from './onboarding-rules.ts';
import { supabase } from './supabase.ts';

async function hasAnyRow(table: 'sessions' | 'program_enrollments', userId: string): Promise<boolean> {
  const { data, error } = await supabase.from(table).select('id').eq('user_id', userId).limit(1);
  if (error) throw error;
  return data.length > 0;
}

export async function fetchTrainingHistory(userId: string): Promise<TrainingHistory> {
  failFastWhenOffline();
  const [hasWorkout, hasEnrollment] = await Promise.all([
    hasAnyRow('sessions', userId),
    hasAnyRow('program_enrollments', userId),
  ]);
  return trainingHistoryOf({ hasWorkout, hasEnrollment });
}
