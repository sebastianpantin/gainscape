import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { wrote } from '../../../lib/query/writes.ts';
import { messageOf } from '../../../lib/error-text.ts';
import { weeklyGoalQuery } from '../../../lib/query/queries.ts';
import { setWeeklyGoal } from '../../../lib/progress/weekly-goal.ts';
import { type WeeklyGoalStatus } from '../../../lib/progress/weekly-goal-rules.ts';

type LoadedGoal =
  { kind: 'loading' } | { kind: 'failed'; message: string } | { kind: 'ready'; status: WeeklyGoalStatus | null };

function loadedGoalOf(goal: UseQueryResult<WeeklyGoalStatus | null>): LoadedGoal {
  if (goal.data !== undefined) return { kind: 'ready', status: goal.data };
  if (goal.error && !goal.isFetching)
    return { kind: 'failed', message: messageOf(goal.error, 'Could not load your weekly goal.') };
  return { kind: 'loading' };
}

export function useWeeklyGoalSetting() {
  const queryClient = useQueryClient();
  const goalQuery = useQuery(weeklyGoalQuery);
  const loaded = loadedGoalOf(goalQuery);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const status = loaded.kind === 'ready' ? loaded.status : null;
  const chosen = status?.nextGoal ? status.nextGoal.goal : (status?.goal ?? null);

  const pick = async (goal: number | null) => {
    if (goal === chosen) return;
    setPending(true);
    setProblem(null);
    try {
      await setWeeklyGoal(goal);
      await wrote(queryClient, { change: 'weekly-goal-saved' });
    } catch (error) {
      setProblem(messageOf(error, 'Could not save your weekly goal.'));
    } finally {
      setPending(false);
    }
  };

  const retry = () => void goalQuery.refetch();

  return { loaded, status, chosen, pending, problem, pick, retry };
}
