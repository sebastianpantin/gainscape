import { failFastWhenOffline } from '../../offline/cache-first.ts';
import { withFriendlyRateLimit } from '../platform/rate-limit.ts';
import { supabase } from '../platform/supabase.ts';
import {
  type LiftGoalInput,
  type LiftGoalsLoad,
  queryLiftGoals,
  removeLiftGoalWith,
  saveLiftGoalWith,
} from './lift-goal-rules.ts';

export function fetchLiftGoals(userId: string, signal: AbortSignal): Promise<LiftGoalsLoad> {
  failFastWhenOffline();
  return queryLiftGoals(supabase, userId, signal);
}

export async function saveLiftGoal(input: LiftGoalInput): Promise<void> {
  try {
    await saveLiftGoalWith(supabase, input);
  } catch (error) {
    throw withFriendlyRateLimit(error);
  }
}

export async function removeLiftGoal(exerciseId: string): Promise<void> {
  try {
    await removeLiftGoalWith(supabase, exerciseId);
  } catch (error) {
    throw withFriendlyRateLimit(error);
  }
}
