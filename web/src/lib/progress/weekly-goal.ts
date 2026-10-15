import { withFriendlyRateLimit } from '../platform/rate-limit.ts';
import { supabase } from '../platform/supabase.ts';
import { type WeeklyGoalStatus, weeklyGoalStatus, weeklyGoalWeekRowSchema } from './weekly-goal-rules.ts';
import { parsedRows } from '../rows.ts';

export async function fetchWeeklyGoalStatus(signal: AbortSignal): Promise<WeeklyGoalStatus | null> {
  const { data, error } = await supabase.rpc('weekly_goal_weeks').order('week_start').abortSignal(signal);
  if (error) throw error;
  return weeklyGoalStatus(parsedRows(weeklyGoalWeekRowSchema, data));
}

export async function setWeeklyGoal(goal: number | null): Promise<void> {
  const { error } = await supabase.rpc('set_weekly_session_goal', { goal });
  if (error) throw withFriendlyRateLimit(error);
}
