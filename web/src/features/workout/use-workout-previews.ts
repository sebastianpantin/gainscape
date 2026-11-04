import { useMemo } from 'react';
import { type Exercise } from '../../lib/exercises/catalog-rules.ts';
import { type SessionBaseline } from '../../lib/workout/session-baseline-rules.ts';
import { type DraftDays } from '../../offline/draft-days.ts';
import { type SetEditChange } from './draft-edit-commands.ts';
import { becomesRecord, type PreviewRecord } from './record-preview.ts';
import { type SetFeedback, setFeedback } from './set-feedback-rules.ts';
import { type DraftPreview, previewDraft, type PreviewContext, type SetPreview } from './xp-preview.ts';

const NO_PREVIEW: DraftPreview = { previews: [], records: [] };

function rememberingPreviewer(context: PreviewContext): (draft: DraftDays) => DraftPreview {
  const previewed = new WeakMap<DraftDays['exercises'], { secondDay: DraftDays['secondDay']; preview: DraftPreview }>();
  return (draft) => {
    const known = previewed.get(draft.exercises);
    if (known && known.secondDay === draft.secondDay) return known.preview;
    const preview = previewDraft(draft, context);
    previewed.set(draft.exercises, { secondDay: draft.secondDay, preview });
    return preview;
  };
}

interface WorkoutPreviewsOptions {
  exercises: readonly Exercise[];
  draft: DraftDays | null;
  baseline: SessionBaseline | null;
  bodyweightKg: number | null;
}

interface SetChange extends SetEditChange {
  vibrate: boolean;
  sound: boolean;
}

export interface WorkoutPreviews {
  previews: SetPreview[][];
  records: (PreviewRecord | null)[][];
  feedbackFor: (change: SetChange) => SetFeedback;
}

export function useWorkoutPreviews({
  exercises,
  draft,
  baseline,
  bodyweightKg,
}: WorkoutPreviewsOptions): WorkoutPreviews {
  const strength = baseline?.strength ?? null;
  const recordBaseline = baseline?.records ?? null;
  const previewOf = useMemo(() => {
    const customIds = new Set(exercises.filter((exercise) => exercise.custom).map((exercise) => exercise.id));
    const isBuiltIn = (exerciseId: string) => !customIds.has(exerciseId);
    return rememberingPreviewer({ isBuiltIn, strength, bodyweightKg, recordBaseline });
  }, [exercises, strength, bodyweightKg, recordBaseline]);
  const { previews, records } = useMemo(() => (draft === null ? NO_PREVIEW : previewOf(draft)), [draft, previewOf]);

  const feedbackFor = ({ previous, next, setId, place, vibrate, sound }: SetChange) => {
    const { exerciseIndex, setIndex } = place;
    const previewAfter = () => previewOf(next);
    return setFeedback({
      label: place.label,
      wasDone: previous.exercises[exerciseIndex]?.sets[setIndex]?.done ?? false,
      isDone: next.exercises[exerciseIndex]?.sets[setIndex]?.done ?? false,
      preview: () => previewAfter().previews[exerciseIndex][setIndex],
      record: () => previewAfter().records[exerciseIndex][setIndex],
      becameRecord: () =>
        becomesRecord(previewOf(previous).records, previous.exercises, previewAfter().records, next.exercises, setId),
      vibrate,
      sound,
    });
  };

  return { previews, records, feedbackFor };
}
