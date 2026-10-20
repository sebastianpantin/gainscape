import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { announceDataChange } from '../../../lib/query/data-changes.ts';
import { messageOf } from '../../../lib/error-text.ts';
import { weeklyGoalQuery } from '../../../lib/query/queries.ts';
import { fetchWeeklyGoalStatus, setWeeklyGoal } from '../../../lib/progress/weekly-goal.ts';
import { loadedState } from '../../../lib/query/query-state-rules.ts';

export function useWeeklyGoalSetting() {
  const queryClient = useQueryClient();
  const goalQuery = useQuery(weeklyGoalQuery);
  const loaded = loadedState(goalQuery.data, goalQuery.isFetching ? null : goalQuery.error);
  const [pending, setPending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const status = loaded.status === 'ready' ? loaded.data : null;
  const chosen = status?.nextGoal ? status.nextGoal.goal : (status?.goal ?? null);

  const pick = async (goal: number | null) => {
    if (goal === chosen) return;
    setPending(true);
    setProblem(null);
    try {
      await setWeeklyGoal(goal);
      const saved = await fetchWeeklyGoalStatus(new AbortController().signal);
      await queryClient.cancelQueries({ queryKey: weeklyGoalQuery.queryKey });
      queryClient.setQueryData(weeklyGoalQuery.queryKey, saved);
      void announceDataChange(queryClient, 'weekly-goal-saved');
    } catch (error) {
      setProblem(messageOf(error, 'Could not save your weekly goal.'));
    } finally {
      setPending(false);
    }
  };

  const retry = () => void goalQuery.refetch();

  return { loaded, status, chosen, pending, problem, pick, retry };
}
