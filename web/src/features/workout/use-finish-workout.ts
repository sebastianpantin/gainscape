import { useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { fetchLatestExerciseList } from '../../lib/query/queries.ts';
import { type WorkoutDraft } from '../../offline/draft-format.ts';
import { type WorkoutDraftHandle } from '../../offline/use-workout-draft.ts';
import { currentLoadTypes } from './current-load-types.ts';
import { useSessionState } from './use-session-state.ts';
import {
  canFinishWorkout,
  finishBlockedText,
  finishCountsOf,
  finishDraft,
  finishPrompt,
  loadTypeChangedText,
} from './workout-rules.ts';

interface FinishWorkoutOptions {
  userId: string;
  draft: WorkoutDraft | null;
  exercises: Exercise[];
  updateDraft: WorkoutDraftHandle['updateDraft'];
  stopRest: () => void;
}

export function useFinishWorkout({ userId, draft, exercises, updateDraft, stopRest }: FinishWorkoutOptions) {
  const queryClient = useQueryClient();
  const [finishProblem, setFinishProblem] = useSessionState<string | null>(draft?.sessionId ?? null, null);
  const [checkingFinish, setCheckingFinish] = useState(false);
  const [finishPromptFor, setFinishPromptFor] = useState<WorkoutDraft | null>(null);
  const counts = draft === null ? null : finishCountsOf(draft);
  const prompt = counts === null ? null : finishPrompt(counts);

  const completeFinish = async (markPlannedDone: boolean) => {
    if (draft === null) return;
    setFinishPromptFor(null);
    setCheckingFinish(true);
    setFinishProblem(null);
    const loadTypes = await currentLoadTypes(draft, exercises, () => fetchLatestExerciseList(queryClient, userId));
    setCheckingFinish(false);
    let changedNames: string[] = [];
    updateDraft((latest) => {
      const finished = finishDraft(latest, { sessionId: draft.sessionId, loadTypes, markPlannedDone, now: new Date() });
      changedNames = finished.changedNames;
      return finished.draft;
    });
    if (changedNames.length > 0) setFinishProblem(loadTypeChangedText(changedNames));
    else stopRest();
  };

  return {
    finishProblem,
    canFinish: counts !== null && canFinishWorkout(counts) && !checkingFinish,
    blockedText: counts === null ? null : finishBlockedText(counts),
    prompt: prompt !== null && finishPromptFor === draft ? prompt : null,
    finish: () => {
      if (prompt) setFinishPromptFor(draft);
      else void completeFinish(false);
    },
    completeFinish: (markPlannedDone: boolean) => void completeFinish(markPlannedDone),
    cancelPrompt: () => setFinishPromptFor(null),
  };
}
