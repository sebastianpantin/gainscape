import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { exercisePickerList } from '../../lib/exercises/catalog-cache.ts';
import { exerciseListLoadQuery } from '../../lib/query/queries.ts';

export function useExerciseList(userId: string) {
  const { data, error } = useQuery(exerciseListLoadQuery(userId));
  const list = useMemo(() => exercisePickerList(data, error), [data, error]);
  return { exercises: list.exercises, loadProblem: list.problem, listNotice: list.notice };
}
