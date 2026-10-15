import { useCallback, useMemo } from 'react';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { type SessionBaseline } from '../../lib/workout/session-baseline-rules.ts';
import { type DraftExercise, type WorkoutDraft } from '../../offline/draft-format.ts';
import { type SetPlace } from './exercise-card-actions.ts';
import { becomesRecord, type PreviewRecord, previewRecords } from './record-preview.ts';
import { type SetFeedback, setFeedback } from './set-feedback-rules.ts';
import { previewSession, type SetPreview } from './xp-preview.ts';

interface WorkoutPreviewsOptions {
  exercises: readonly Exercise[];
  draftExercises: readonly DraftExercise[] | null;
  baseline: SessionBaseline | null;
  bodyweightKg: number | null;
}

export interface SetChange {
  previous: WorkoutDraft;
  next: WorkoutDraft;
  setId: string;
  place: SetPlace;
  vibrate: boolean;
}

export interface WorkoutPreviews {
  previews: SetPreview[][];
  records: (PreviewRecord | null)[][];
  feedbackFor: (change: SetChange) => SetFeedback;
}

export function useWorkoutPreviews({
  exercises,
  draftExercises,
  baseline,
  bodyweightKg,
}: WorkoutPreviewsOptions): WorkoutPreviews {
  const previewStrength = baseline?.strength ?? null;
  const recordBaseline = baseline?.records ?? null;
  const previewsOf = useCallback(
    (list: readonly DraftExercise[]) => {
      const customIds = new Set(exercises.filter((exercise) => exercise.custom).map((exercise) => exercise.id));
      return previewSession(list, (exerciseId) => !customIds.has(exerciseId), previewStrength, bodyweightKg);
    },
    [exercises, previewStrength, bodyweightKg],
  );
  const previews = useMemo(
    () => (draftExercises === null ? [] : previewsOf(draftExercises)),
    [draftExercises, previewsOf],
  );
  const records = useMemo(
    () => (draftExercises === null ? [] : previewRecords(draftExercises, previewStrength, recordBaseline)),
    [draftExercises, previewStrength, recordBaseline],
  );

  const feedbackFor = ({ previous, next, setId, place, vibrate }: SetChange) => {
    const { exerciseIndex, setIndex } = place;
    return setFeedback({
      label: place.label,
      wasDone: previous.exercises[exerciseIndex]?.sets[setIndex]?.done ?? false,
      isDone: next.exercises[exerciseIndex]?.sets[setIndex]?.done ?? false,
      preview: () => previewsOf(next.exercises)[exerciseIndex][setIndex],
      record: () => previewRecords(next.exercises, previewStrength, recordBaseline)[exerciseIndex][setIndex],
      becameRecord: () =>
        becomesRecord(records, previous.exercises, next.exercises, setId, previewStrength, recordBaseline),
      vibrate,
    });
  };

  return { previews, records, feedbackFor };
}
