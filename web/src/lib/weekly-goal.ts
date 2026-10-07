import { withFriendlyRateLimit } from './rate-limit.ts';
import { supabase } from './supabase.ts';
import { type WeeklyGoalStatus, weeklyGoalStatus, type WeeklyGoalWeekRow } from './weekly-goal-rules.ts';

export async function fetchWeeklyGoalStatus(signal: AbortSignal): Promise<WeeklyGoalStatus | null> {
  const { data, error } = await supabase.rpc('weekly_goal_weeks').order('week_start').abortSignal(signal);
  if (error) throw error;
  return weeklyGoalStatus(data as unknown as WeeklyGoalWeekRow[]);
}

export async function setWeeklyGoal(goal: number | null): Promise<void> {
  const { error } = await supabase.rpc('set_weekly_session_goal', { goal });
  if (error) throw withFriendlyRateLimit(error);
}
