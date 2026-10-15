import { type Exercise, isLiftExercise } from '../../lib/exercises/catalog-rules.ts';
import { firstSetFromLastSession } from '../../lib/history/last-session-rules.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { vibrate } from '../../lib/platform/device-effects.ts';
import { removeSet } from '../../lib/workout/exercise-edit-rules.ts';
import { groupWithNext, ungroup } from '../../lib/workout/superset-rules.ts';
import { readTrainingDeviceSettings } from '../../lib/workout/training-device-store.ts';
import { removeExercise, seedUntouchedSet, swapExercise, type WorkoutDraft } from '../../offline/draft-format.ts';
import { type WorkoutDraftHandle } from '../../offline/use-workout-draft.ts';
import { type ExerciseCardActions, type SetPlace } from './exercise-card-actions.ts';
import { EXERCISE_MENU_LABELS, type ExerciseMenuChoice, exerciseMenuChoices } from './exercise-card-rules.ts';
import { type ExerciseMenuAction } from './ExerciseMenu.tsx';
import { rowToFocusAfterRemoving } from './set-menu-rules.ts';
import { useFocusAfterRemoval } from './use-focus-after-removal.ts';
import { type RecentLiftSessions } from './use-recent-lift-sessions.ts';
import { useSessionState } from './use-session-state.ts';
import { useSetDrop } from './use-set-drop.ts';
import { type WorkoutPreviews } from './use-workout-previews.ts';
import { addButtonKey, withPickedExercise } from './workout-screen-rules.ts';

interface WorkoutCommandsOptions {
  userId: string;
  draft: WorkoutDraft | null;
  draftActions: Pick<WorkoutDraftHandle, 'changeDraft' | 'updateDraft' | 'discardDraft'>;
  recentSessions: RecentLiftSessions;
  feedbackFor: WorkoutPreviews['feedbackFor'];
  stopRest: () => void;
}

export function useWorkoutCommands({
  userId,
  draft,
  draftActions: { changeDraft, updateDraft, discardDraft },
  recentSessions,
  feedbackFor,
  stopRest,
}: WorkoutCommandsOptions) {
  const sessionId = draft?.sessionId ?? null;
  const [swappingKey, setSwappingKey] = useSessionState<string | null>(sessionId, null);
  const [focusSetId, setFocusSetId] = useSessionState<string | null>(sessionId, null);
  const [confirmingDiscard, setConfirmingDiscard] = useSessionState(sessionId, false);
  const { announcement, showDrop, dropOn } = useSetDrop();
  const { focusTarget, focusAfterNextChange } = useFocusAfterRemoval(draft?.exercises ?? null);

  const cardKeys = draft?.exercises.map((exercise) => exercise.clientId) ?? [];
  if (swappingKey !== null && !cardKeys.includes(swappingKey)) setSwappingKey(null);

  const edit = (change: (current: WorkoutDraft) => WorkoutDraft) => {
    if (draft !== null) changeDraft(change(draft));
  };

  const changeSet = (next: WorkoutDraft, setId: string, place: SetPlace) => {
    if (draft === null) return;
    const vibrateOn = readTrainingDeviceSettings(deviceStorage(), userId).vibrate;
    const feedback = feedbackFor({ previous: draft, next, setId, place, vibrate: vibrateOn });
    if (feedback.vibrationMs) vibrate(feedback.vibrationMs);
    if (feedback.drop) showDrop(feedback.drop, setId);
    changeDraft(next);
  };

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
    changeDraft(removeSet(draft, exerciseIndex, setId));
  };

  const addPicked = async (exercise: Exercise) => {
    if (draft === null) return;
    const exerciseIndex = draft.exercises.length;
    const known = recentSessions.byExercise.has(exercise.id);
    const firstSet = isLiftExercise(exercise)
      ? firstSetFromLastSession(recentSessions.byExercise.get(exercise.id)?.[0], exercise.loadType)
      : undefined;
    const added = withPickedExercise(draft, exercise, firstSet);
    changeDraft(added);
    if (!isLiftExercise(exercise) || exercise.measure !== undefined) return;
    const addedExercise = added.exercises[exerciseIndex];
    const original = addedExercise?.modality === 'lift' ? addedExercise.sets[0] : undefined;
    if (known || original === undefined) return;
    const seed = firstSetFromLastSession((await recentSessions.loadFor(exercise.id))?.[0], exercise.loadType);
    if (seed) updateDraft((latest) => seedUntouchedSet(latest, exerciseIndex, original, seed));
  };

  const toggleSwap = (exerciseIndex: number) =>
    setSwappingKey(swappingKey === cardKeys[exerciseIndex] ? null : cardKeys[exerciseIndex]);

  const swapTo = (exerciseIndex: number, replacement: Exercise) => {
    if (draft === null || !isLiftExercise(replacement)) return;
    const swapped = swapExercise(draft, exerciseIndex, replacement);
    if (swapped) changeDraft(swapped);
    setSwappingKey(null);
  };

  const menuAction = (exerciseIndex: number, choice: ExerciseMenuChoice) => {
    if (choice === 'superset_with_next') return () => edit((current) => groupWithNext(current, exerciseIndex));
    if (choice === 'ungroup') return () => edit((current) => ungroup(current, exerciseIndex));
    if (choice === 'swap') return () => toggleSwap(exerciseIndex);
    return () => removeExerciseAt(exerciseIndex);
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
    changeDraft,
    changeSet,
    removeExerciseAt,
    removeSetAt,
    focusTarget,
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
    discardWorkout,
  };
}
