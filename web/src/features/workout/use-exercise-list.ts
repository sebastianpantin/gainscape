import { useEffect, useState } from 'react';
import { REQUEST_TIMEOUT_MS } from '../../lib/auth-restore.ts';
import { fetchExercises } from '../../lib/catalog.ts';
import { loadExercisesCacheFirst } from '../../lib/catalog-cache.ts';
import { type Exercise } from '../../lib/catalog-rules.ts';
import { isDeviceOffline } from '../../offline/cache-first.ts';

export function useExerciseList(userId: string) {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void loadExercisesCacheFirst(
      localStorage,
      userId,
      () => fetchExercises({ includeArchived: true, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
      (list) => {
        if (!active) return;
        setExercises(list.exercises);
        setListNotice(list.notice);
        setLoadProblem(list.problem);
      },
      isDeviceOffline,
    );
    return () => {
      active = false;
    };
  }, [userId]);

  return { exercises, loadProblem, listNotice };
}
