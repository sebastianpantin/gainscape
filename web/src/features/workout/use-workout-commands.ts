import { type Exercise, isLiftExercise } from '../../lib/exercises/catalog-rules.ts';
import { firstSetFromLastSession } from '../../lib/history/last-session-rules.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { celebrate, RECORD_CELEBRATION } from '../../lib/platform/celebration-effects.ts';
import { vibrate } from '../../lib/platform/device-effects.ts';
import { useToast } from '../../lib/ui/toast.ts';
import { removeSet } from '../../lib/workout/exercise-edit-rules.ts';
import { groupWithNext, ungroup } from '../../lib/workout/superset-rules.ts';
import { readTrainingDeviceSettings } from '../../lib/workout/training-device-store.ts';
import { type WorkoutDraft } from '../../offline/draft-format.ts';
import { removeExercise, seedUntouchedSet, swapExercise } from '../../offline/draft-edits.ts';
import { type WorkoutDraftHandle } from '../../offline/use-workout-draft.ts';
import { draftEditCommands } from './draft-edit-commands.ts';
import { type ExerciseCardActions } from './exercise-card-actions.ts';
import {
  EXERCISE_MENU_LABELS,
  type ExerciseMenuChoice,
  exerciseMenuChoices,
  removingAsksFirst,
} from './exercise-card-rules.ts';
import { type ExerciseMenuAction } from './ExerciseMenu.tsx';
import { rowToFocusAfterRemoving } from './set-menu-rules.ts';
import { useFocusAfterRemoval } from './use-focus-after-removal.ts';
import { type RecentLiftSessions } from './use-recent-lift-sessions.ts';
import { useSessionState } from './use-session-state.ts';
import { useSetDrop } from './use-set-drop.ts';
import { type WorkoutPreviews } from './use-workout-previews.ts';
import {
  addButtonKey,
  removedSetAt,
  removedSetText,
  restoreRemovedSet,
  withPickedExercise,
} from './workout-screen-rules.ts';

interface WorkoutCommandsOptions {
  userId: string;
  draft: WorkoutDraft | null;
  draftActions: Pick<WorkoutDraftHandle, 'updateDraft' | 'discardDraft'>;
  recentSessions: RecentLiftSessions;
  feedbackFor: WorkoutPreviews['feedbackFor'];
  stopRest: () => void;
}

export function useWorkoutCommands({
  userId,
  draft,
  draftActions: { updateDraft, discardDraft },
  recentSessions,
  feedbackFor,
  stopRest,
}: WorkoutCommandsOptions) {
  const sessionId = draft?.sessionId ?? null;
  const [swappingKey, setSwappingKey] = useSessionState<string | null>(sessionId, null);
  const [focusSetId, setFocusSetId] = useSessionState<string | null>(sessionId, null);
  const [confirmingDiscard, setConfirmingDiscard] = useSessionState(sessionId, false);
  const [confirmingRemoveKey, setConfirmingRemoveKey] = useSessionState<string | null>(sessionId, null);
  const { announcement, showDrop, dropOn } = useSetDrop();
  const { showToast } = useToast();
  const { focusTarget, focusAfterNextChange } = useFocusAfterRemoval(draft?.exercises ?? null);

  const cardKeys = draft?.exercises.map((exercise) => exercise.clientId) ?? [];
  if (swappingKey !== null && !cardKeys.includes(swappingKey)) setSwappingKey(null);
  if (confirmingRemoveKey !== null && !cardKeys.includes(confirmingRemoveKey)) setConfirmingRemoveKey(null);

  const { edit, editSet } = draftEditCommands({
    updateDraft,
    onSetEdited: (change) => {
      const { vibrate: vibrates, sound } = readTrainingDeviceSettings(deviceStorage(), userId);
      const feedback = feedbackFor({ ...change, vibrate: vibrates, sound });
      if (feedback.vibrationMs) vibrate(feedback.vibrationMs);
      if (feedback.celebratesRecord) celebrate(userId, RECORD_CELEBRATION);
      if (feedback.drop) showDrop(feedback.drop, change.setId);
    },
  });

  const removeExerciseAt = (exerciseIndex: number) => edit((current) => removeExercise(current, exerciseIndex));

  const removeSetAt = (exerciseIndex: number, setId: string) => {
    if (draft === null) return;
    focusAfterNextChange({
      setId: rowToFocusAfterRemoving(
        draft.exercises[exerciseIndex].sets.map((set) => set.id),
        setId,
      ),
      addKey: addButtonKey(draft, exerciseIndex),
    });
    edit((latest) => removeSet(latest, exerciseIndex, setId));
    const removed = removedSetAt(draft, exerciseIndex, setId);
    if (removed === null) return;
    showToast(removedSetText(draft.exercises[exerciseIndex], removed.index), {
      label: 'Undo',
      onAct: () => {
        focusAfterNextChange({ setId: removed.set.id, addKey: addButtonKey(draft, exerciseIndex) });
        updateDraft((latest) => restoreRemovedSet(latest, removed));
      },
    });
  };

  const addPicked = async (exercise: Exercise) => {
    const known = recentSessions.byExercise.has(exercise.id);
    const firstSet = isLiftExercise(exercise)
      ? firstSetFromLastSession(recentSessions.byExercise.get(exercise.id)?.[0], exercise.loadType)
      : undefined;
    const added = updateDraft((latest) => withPickedExercise(latest, exercise, firstSet));
    if (added === null || !isLiftExercise(exercise) || exercise.measure !== undefined) return;
    const exerciseIndex = added.exercises.length - 1;
    const addedExercise = added.exercises[exerciseIndex];
    const original = addedExercise?.modality === 'lift' ? addedExercise.sets[0] : undefined;
    if (known || original === undefined) return;
    const seed = firstSetFromLastSession((await recentSessions.loadFor(exercise.id))?.[0], exercise.loadType);
    if (seed) updateDraft((latest) => seedUntouchedSet(latest, exerciseIndex, original, seed));
  };

  const toggleSwap = (exerciseIndex: number) =>
    setSwappingKey(swappingKey === cardKeys[exerciseIndex] ? null : cardKeys[exerciseIndex]);

  const swapTo = (exerciseIndex: number, replacement: Exercise) => {
    if (!isLiftExercise(replacement)) return;
    edit((latest) => swapExercise(latest, exerciseIndex, replacement));
    setSwappingKey(null);
  };

  const menuAction = (exerciseIndex: number, choice: ExerciseMenuChoice) => {
    if (choice === 'superset_with_next') return () => edit((current) => groupWithNext(current, exerciseIndex));
    if (choice === 'ungroup') return () => edit((current) => ungroup(current, exerciseIndex));
    if (choice === 'swap') return () => toggleSwap(exerciseIndex);
    return () => {
      if (draft !== null && removingAsksFirst(draft.exercises[exerciseIndex]))
        setConfirmingRemoveKey(cardKeys[exerciseIndex]);
      else removeExerciseAt(exerciseIndex);
    };
  };

  const removingIndex = confirmingRemoveKey === null ? -1 : cardKeys.indexOf(confirmingRemoveKey);
  const removeConfirm =
    draft === null || removingIndex === -1
      ? null
      : {
          exerciseName: draft.exercises[removingIndex].name,
          confirm: () => {
            setConfirmingRemoveKey(null);
            removeExerciseAt(removingIndex);
          },
          cancel: () => setConfirmingRemoveKey(null),
        };

  const menuActions = (exerciseIndex: number): ExerciseMenuAction[] =>
    draft === null
      ? []
      : exerciseMenuChoices(draft, exerciseIndex).map((choice) => ({
          label: EXERCISE_MENU_LABELS[choice],
          onChoose: menuAction(exerciseIndex, choice),
        }));

  const discardWorkout = () => {
    if (draft === null) return;
    stopRest();
    discardDraft(draft.sessionId);
  };

  const cardActions: ExerciseCardActions = {
    edit,
    editSet,
    removeExerciseAt,
    removeSetAt,
    focusTarget,
    focusAfterNextChange,
    dropOn,
  };

  return {
    cardActions,
    announcement,
    addPicked,
    menuActions,
    swappingKey,
    swapTo,
    focusSetId,
    setFocusSetId,
    confirmingDiscard,
    setConfirmingDiscard,
    removeConfirm,
    discardWorkout,
  };
}
