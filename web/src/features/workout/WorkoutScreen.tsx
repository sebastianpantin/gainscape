import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useRef, useState } from 'react';
import { MAX_SETS_PER_SESSION } from '@domain/index.ts';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { TermHelpRow } from '../../components/TermHelpRow.tsx';
import { BOUTS_FULL_TEXT } from '../../lib/workout/cardio-rules.ts';
import { type Exercise, isLiftExercise } from '../../lib/exercises/catalog-rules.ts';
import { similarExercises } from '../../lib/exercises/substitute-rules.ts';
import { firstSetFromLastSession, lastTimeText } from '../../lib/history/last-session-rules.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { fetchLatestExerciseList } from '../../lib/query/queries.ts';
import { useStanding } from '../../lib/progress/standing.ts';
import { stopsRestForWarmup } from '../../lib/workout/rest-timer-rules.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { readTrainingDeviceSettings } from '../../lib/workout/training-device-store.ts';
import { barbellPlates, barbellPlatesText } from '../../lib/workout/plate-rules.ts';
import { readPlateSettings } from '../../lib/workout/plate-settings-store.ts';
import { useIsOffline, useOnlineSignal } from '../../lib/platform/use-online.ts';
import { formatXp } from '../../lib/format.ts';
import { shownWeight } from '../../lib/units.ts';
import {
  addCardioExercise,
  addExercise,
  addHoldExercise,
  addSet,
  addWarmupSets,
  canSwapExercise,
  doneSetCount,
  type DraftSet,
  firstWorkingSet,
  canQuickFill,
  mostQuickFillSets,
  fillWorkingSets,
  plannedSetsLeftToLifter,
  notDoneSetCount,
  removeExercise,
  seedUntouchedSet,
  type LiftDraftExercise,
  swapExercise,
  toggleSetDone,
  withSessionRpe,
  type WorkoutDraft,
  type DraftExercise,
} from '../../offline/draft-format.ts';
import {
  addableExercises,
  canAddSetTo,
  removeSet,
  roomForSets,
  updateSet,
} from '../../lib/workout/exercise-edit-rules.ts';
import {
  barbellSetupFor,
  draftBar,
  programSetMarkers,
  programSetMarkerTexts,
} from '../../lib/programs/program-set-rules.ts';
import { useWorkoutDraft } from '../../offline/use-workout-draft.ts';
import {
  addRound,
  canAddRound,
  groupWithNext,
  nextInRound,
  roundRows,
  supersetGroups,
  ungroup,
} from '../../lib/workout/superset-rules.ts';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { ExerciseProgressLink } from '../collection/ExerciseProgressLink.tsx';
import { useOnboarding } from '../onboarding/use-onboarding.ts';
import { saveBodyweight } from '../profile/save-bodyweight.ts';
import { recallLastSummary } from '../summary/last-summary.ts';
import { CardioExerciseCard } from './CardioExerciseCard.tsx';
import { ChallengeBanner } from './ChallengeBanner.tsx';
import { currentLoadTypes } from './current-load-types.ts';
import { type ExerciseCardActions, type SetPlace } from './exercise-card-actions.ts';
import { HoldExerciseCard } from './HoldExerciseCard.tsx';
import { lastSetForRow } from './last-set-rules.ts';
import { ExerciseMenu } from './ExerciseMenu.tsx';
import { ExerciseNote } from './ExerciseNote.tsx';
import { ExercisePicker } from './ExercisePicker.tsx';
import { NotifyPrompt } from './NotifyPrompt.tsx';
import { OtherAccountDraftNotice } from './OtherAccountDraftNotice.tsx';
import { useActiveProgram } from '../programs/use-active-program.ts';
import { QuickFill } from './QuickFill.tsx';
import { RestTimerBar } from './RestTimerBar.tsx';
import { SavingWorkoutView } from './SavingWorkoutView.tsx';
import { SetRow } from './SetRow.tsx';
import { SessionRpeField } from './SessionRpeField.tsx';
import { rowToFocusAfterRemoving } from './set-menu-rules.ts';
import { SupersetCard } from './SupersetCard.tsx';
import { TodayView } from './TodayView.tsx';
import { workoutHelpKeys } from './workout-help.ts';
import { useExerciseList } from './use-exercise-list.ts';
import { useExerciseNotes } from './use-exercise-notes.ts';
import { useFinishSync } from './use-finish-sync.ts';
import { useFocusAfterRemoval } from './use-focus-after-removal.ts';
import { useLatestBodyweight } from './use-latest-bodyweight.ts';
import { useRecentLiftSessions } from './use-recent-lift-sessions.ts';
import { useRestAlert } from './use-rest-alert.ts';
import { useRestTimer } from './use-rest-timer.ts';
import { useExerciseStrength, useSessionBaseline } from './use-session-strength.ts';
import { useSetDrop } from './use-set-drop.ts';
import { useWakeLock } from './use-wake-lock.ts';
import { useWorkoutStart } from './use-workout-start.ts';
import {
  EXERCISE_MENU_LABELS,
  type ExerciseMenuChoice,
  exerciseMenuChoices,
  isBarbellLift,
  liftAdvice,
  liftDetailsText,
  liftEquipment,
  restStartsAfterChange,
  warmupsToOffer,
} from './exercise-card-rules.ts';
import {
  canFinishWorkout,
  deviceSaveProblemText,
  finishDraft,
  finishPrompt,
  loadTypeChangedText,
  WAITING_DRAFT_TEXT,
} from './workout-rules.ts';
import { vibrate } from '../../lib/platform/device-effects.ts';
import { becomesRecord, previewRecords } from './record-preview.ts';
import { feedbackLabel, setFeedback } from './set-feedback-rules.ts';
import { donePreviewTotal, previewSession } from './xp-preview.ts';

interface WorkoutScreenProps {
  userId: string;
}

const DEFAULT_QUICK_FILL_SETS = 3;
const DEFAULT_QUICK_FILL_REPS = 8;
const MAX_SWAP_SUGGESTIONS = 6;

export function WorkoutScreen({ userId }: WorkoutScreenProps) {
  const navigate = useNavigate();
  const {
    state,
    store,
    saveProblem,
    waitingDraft,
    changeDraft,
    updateDraft,
    startWorkout,
    discardDraft,
    markSynced,
    reload,
    flush,
  } = useWorkoutDraft(userId);
  const offline = useIsOffline();
  const [finishProblem, setFinishProblem] = useState<string | null>(null);
  const [checkingFinish, setCheckingFinish] = useState(false);
  const [finishPromptFor, setFinishPromptFor] = useState<WorkoutDraft | null>(null);
  const [swappingKey, setSwappingKey] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [focusSetId, setFocusSetId] = useState<string | null>(null);
  const onlineSignal = useOnlineSignal();
  const queryClient = useQueryClient();
  const standing = useStanding(userId);
  const { cache: programCache, program: activeProgram, showCache: showProgramCache } = useActiveProgram(userId);
  const rest = useRestTimer(userId);
  useRestAlert(userId, rest.timer);
  const [keepAwake] = useState(() => readTrainingDeviceSettings(deviceStorage(), userId).keepAwake);
  const [plateSettings] = useState(() => readPlateSettings(deviceStorage(), userId));
  const finishButton = useRef<HTMLButtonElement>(null);
  const finishBar = useRef<HTMLDivElement>(null);
  const { unitPref, effortInputMode } = usePreferences();
  const draft = state.status === 'ready' ? state.draft : null;
  const onboarding = useOnboarding(userId, draft !== null);
  const focusPickerOnOpen = useRef(false);
  const draftSessionId = draft?.sessionId ?? null;
  const [stateSessionId, setStateSessionId] = useState(draftSessionId);
  if (stateSessionId !== draftSessionId) {
    setStateSessionId(draftSessionId);
    setFinishProblem(null);
    setSwappingKey(null);
    setFocusSetId(null);
    setConfirmingDiscard(false);
  }
  const liftExerciseIds =
    draft && !draft.finishedAt
      ? draft.exercises.flatMap((exercise) => (exercise.modality === 'lift' ? [exercise.exerciseId] : []))
      : [];
  const recentSessions = useRecentLiftSessions(`${userId}/${draftSessionId}`, liftExerciseIds, onlineSignal);
  useWakeLock(keepAwake, draft !== null && !draft.finishedAt);

  const { exercises, loadProblem, listNotice } = useExerciseList(userId);
  const { notes, saveNote } = useExerciseNotes(userId);
  const strength = useExerciseStrength(userId);
  const sessionBaseline = useSessionBaseline(userId, draft?.startedAt ?? null, onlineSignal);
  const previewStrength = sessionBaseline?.strength ?? null;
  const recordBaseline = sessionBaseline?.records ?? null;
  const bodyweightKg = useLatestBodyweight(userId);
  const start = useWorkoutStart({ userId, exercises, startWorkout, programCache, showProgramCache });

  const draftExercises = draft?.exercises ?? null;
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

  const { announcement: setAnnouncement, showDrop, dropOn } = useSetDrop();
  const { focusTarget, focusAfterNextChange } = useFocusAfterRemoval(draftExercises);

  const { status: finishStatus, retryNow } = useFinishSync({
    userId,
    draft,
    store,
    flush,
    markSynced,
    onSynced: (summary) => navigate('/reveal', { state: summary }),
    onSuperseded: (sessionId) => {
      if (recallLastSummary(userId)?.sessionId === sessionId) navigate('/reveal');
      else void reload();
    },
    onDeleted: () => void reload('deleted'),
  });

  if (state.status === 'loading') return <ScreenSkeleton />;

  const deviceNotices = (
    <>
      {saveProblem && (
        <p className="problem" role="alert">
          {deviceSaveProblemText(saveProblem)}
        </p>
      )}
      {waitingDraft && draft && (
        <p className="notice" role="status">
          {WAITING_DRAFT_TEXT}
        </p>
      )}
      {store && <OtherAccountDraftNotice store={store} userId={userId} />}
    </>
  );

  if (!draft) {
    return (
      <TodayView
        userId={userId}
        deviceNotices={deviceNotices}
        notice={state.notice}
        standing={standing}
        exercises={exercises}
        unit={unitPref}
        program={activeProgram}
        start={start}
        onboarding={onboarding}
        onFreestyleFromOnboarding={() => {
          focusPickerOnOpen.current = true;
          start.startFreestyle();
        }}
      />
    );
  }

  const backToEditing = () => changeDraft({ ...draft, finishedAt: null }, { reopen: true });
  const programBar = draftBar(activeProgram, draft.program?.enrollmentId ?? null);

  if (draft.finishedAt) {
    return (
      <SavingWorkoutView
        deviceNotices={deviceNotices}
        finishStatus={finishStatus}
        unit={unitPref}
        onRetryNow={retryNow}
        onBackToEditing={backToEditing}
        onSaveBodyweight={async (bodyweightKg) => {
          await saveBodyweight({ userId, bodyweightKg, storage: deviceStorage(), queryClient });
          retryNow();
        }}
        onDiscard={() => discardDraft(draft.sessionId)}
      />
    );
  }

  const finishCounts = {
    done: doneSetCount(draft),
    planned: notDoneSetCount(draft),
    leftToLifter: plannedSetsLeftToLifter(draft),
  };
  const prompt = finishPrompt(finishCounts);

  const finish = () => {
    if (prompt) setFinishPromptFor(draft);
    else void completeFinish(false);
  };

  const completeFinish = async (markPlannedDone: boolean) => {
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
    else rest.stop();
  };

  const canFinish = canFinishWorkout(finishCounts) && !checkingFinish;
  const roomForSet = canAddSetTo(draft, 'lift');
  const roomForBout = canAddSetTo(draft, 'cardio');
  const liftExercises = exercises.filter(isLiftExercise).filter((exercise) => exercise.measure === undefined);
  const equipment = liftEquipment(exercises);
  const swapSuggestions = (exerciseId: string) => {
    const original = liftExercises.find((candidate) => candidate.id === exerciseId);
    return original ? similarExercises(original, liftExercises, MAX_SWAP_SUGGESTIONS) : [];
  };
  const barbellSetup = barbellSetupFor(plateSettings, unitPref, programBar);
  const addPicked = async (exercise: Exercise) => {
    if (exercise.modality === 'cardio') {
      changeDraft(
        addSet(addCardioExercise(draft, exercise.id, exercise.name, exercise.activity), draft.exercises.length),
      );
      return;
    }
    if (exercise.measure !== undefined) {
      changeDraft(
        addSet(
          addHoldExercise(draft, exercise.id, exercise.name, exercise.loadType, exercise.measure),
          draft.exercises.length,
        ),
      );
      return;
    }
    const known = recentSessions.byExercise.has(exercise.id);
    const firstSet = firstSetFromLastSession(recentSessions.byExercise.get(exercise.id)?.[0], exercise.loadType);
    const exerciseIndex = draft.exercises.length;
    const added = addSet(addExercise(draft, exercise.id, exercise.name, exercise.loadType), exerciseIndex, firstSet);
    changeDraft(added);
    const addedExercise = added.exercises[exerciseIndex];
    const original = addedExercise?.modality === 'lift' ? addedExercise.sets[0] : undefined;
    if (known || original === undefined) return;
    const seed = firstSetFromLastSession((await recentSessions.loadFor(exercise.id))?.[0], exercise.loadType);
    if (seed) updateDraft((latest) => seedUntouchedSet(latest, exerciseIndex, original, seed));
  };
  const previewTotal = donePreviewTotal(previews, draft.exercises);
  const noteFor = (exerciseId: string, exerciseName: string) => (
    <ExerciseNote
      exerciseName={exerciseName}
      note={notes[exerciseId]}
      offline={offline}
      onSave={(body) => saveNote(exerciseId, body)}
    />
  );
  const changeSet = (next: WorkoutDraft, setId: string, place: SetPlace) => {
    const { exerciseIndex, setIndex } = place;
    const feedback = setFeedback({
      label: place.label,
      wasDone: draft.exercises[exerciseIndex]?.sets[setIndex]?.done ?? false,
      isDone: next.exercises[exerciseIndex]?.sets[setIndex]?.done ?? false,
      preview: () => previewsOf(next.exercises)[exerciseIndex][setIndex],
      record: () => previewRecords(next.exercises, previewStrength, recordBaseline)[exerciseIndex][setIndex],
      becameRecord: () =>
        becomesRecord(records, draft.exercises, next.exercises, setId, previewStrength, recordBaseline),
      vibrate: readTrainingDeviceSettings(deviceStorage(), userId).vibrate,
    });
    if (feedback.vibrationMs) vibrate(feedback.vibrationMs);
    if (feedback.drop) showDrop(feedback.drop, setId);
    changeDraft(next);
  };
  const cardKeys = draft.exercises.map((exercise) => exercise.clientId);
  if (swappingKey !== null && !cardKeys.includes(swappingKey)) setSwappingKey(null);
  const removeExerciseAt = (exerciseIndex: number) => changeDraft(removeExercise(draft, exerciseIndex));
  const discardWorkout = () => {
    rest.stop();
    discardDraft(draft.sessionId);
  };
  const groups = supersetGroups(draft);
  const groupOfIndex = new Map(
    groups.flatMap((group) => group.exerciseIndexes.map((index) => [index, group] as const)),
  );
  const addButtonKeyOf = (exerciseIndex: number) => {
    const group = groupOfIndex.get(exerciseIndex);
    return group === undefined ? cardKeys[exerciseIndex] : `superset-${group.id}`;
  };
  const removeSetAt = (exerciseIndex: number, setId: string) => {
    focusAfterNextChange({
      setId: rowToFocusAfterRemoving(
        draft.exercises[exerciseIndex].sets.map((set) => set.id),
        setId,
      ),
      addKey: addButtonKeyOf(exerciseIndex),
    });
    changeDraft(removeSet(draft, exerciseIndex, setId));
  };
  const cardActions: ExerciseCardActions = {
    changeDraft,
    changeSet,
    removeExerciseAt,
    removeSetAt,
    focusTarget,
    dropOn,
  };
  const barbellOf = (exercise: LiftDraftExercise) => (isBarbellLift(exercise, equipment) ? barbellSetup : null);
  const menuAction = (exerciseIndex: number, choice: ExerciseMenuChoice) => {
    if (choice === 'superset_with_next') return () => changeDraft(groupWithNext(draft, exerciseIndex));
    if (choice === 'ungroup') return () => changeDraft(ungroup(draft, exerciseIndex));
    if (choice === 'swap')
      return () => setSwappingKey(swappingKey === cardKeys[exerciseIndex] ? null : cardKeys[exerciseIndex]);
    return () => removeExerciseAt(exerciseIndex);
  };
  const menuActions = (exerciseIndex: number) =>
    exerciseMenuChoices(draft, exerciseIndex).map((choice) => ({
      label: EXERCISE_MENU_LABELS[choice],
      onChoose: menuAction(exerciseIndex, choice),
    }));
  const liftIntro = (exercise: LiftDraftExercise, exerciseIndex: number) => {
    const restS = rest.lengthFor(exercise.exerciseId, equipment.compoundIds.has(exercise.exerciseId));
    const details = liftDetailsText(exercise, strength?.get(exercise.exerciseId), restS, unitPref);
    const recent = recentSessions.byExercise.get(exercise.exerciseId);
    const lastTime = lastTimeText(recent?.[0], exercise.loadType, unitPref);
    const advice = liftAdvice(exercise, recent, unitPref, barbellOf(exercise));
    return (
      <>
        <header>
          <h2>{exercise.name}</h2>
          <span className="row">
            <ExerciseProgressLink exerciseId={exercise.exerciseId} exerciseName={exercise.name} />
            <ExerciseMenu exerciseName={exercise.name} actions={menuActions(exerciseIndex)} />
          </span>
        </header>
        <p className="muted">{details}</p>
        {lastTime && <p className="muted tiny last-time">{lastTime}</p>}
        {advice && <p className="tiny progression-advice">{advice}</p>}
        {noteFor(exercise.exerciseId, exercise.name)}
        {swappingKey === cardKeys[exerciseIndex] && canSwapExercise(draft, exerciseIndex) && (
          <ExercisePicker
            exercises={liftExercises}
            suggestions={swapSuggestions(exercise.exerciseId)}
            placeholder="Swap for…"
            onPick={(replacement) => {
              if (!isLiftExercise(replacement)) return;
              const swapped = swapExercise(draft, exerciseIndex, replacement);
              if (swapped) changeDraft(swapped);
              setSwappingKey(null);
            }}
          />
        )}
      </>
    );
  };
  const liftSetRow = (
    exercise: LiftDraftExercise,
    exerciseIndex: number,
    set: DraftSet,
    setIndex: number,
    doneLabel?: string,
    rowLabel?: string,
  ) => {
    const compound = equipment.compoundIds.has(exercise.exerciseId);
    const place = { exerciseIndex, setIndex, label: feedbackLabel(exercise.name, 'set', setIndex + 1) };
    const startRestAfter = (changes: Partial<Omit<DraftSet, 'id'>>) => {
      if (restStartsAfterChange(draft, exerciseIndex, set, changes, rest.timer))
        rest.start(set.id, exercise.exerciseId, compound);
    };
    return (
      <SetRow
        key={set.id}
        setNumber={setIndex + 1}
        loadType={exercise.loadType}
        set={set}
        preview={previews[exerciseIndex][setIndex]}
        record={records[exerciseIndex][setIndex]}
        drop={dropOn(set.id)}
        unit={unitPref}
        effortMode={effortInputMode}
        markers={programSetMarkerTexts(programSetMarkers(set, unitPref))}
        barbell={
          isBarbellLift(exercise, equipment)
            ? {
                plates: barbellPlates(shownWeight(set.weightKg, unitPref), barbellSetup, unitPref).plates,
                text: barbellPlatesText(shownWeight(set.weightKg, unitPref), barbellSetup, unitPref),
                setup: barbellSetup,
              }
            : null
        }
        last={lastSetForRow(exercise.sets, setIndex, recentSessions.byExercise.get(exercise.exerciseId)?.[0])}
        doneLabel={doneLabel}
        rowLabel={rowLabel}
        focusDone={focusSetId === set.id}
        onDoneFocused={() => setFocusSetId(null)}
        onChange={(changes) => {
          startRestAfter(changes);
          if (stopsRestForWarmup(set, changes, rest.timer)) rest.stop();
          changeSet(updateSet(draft, exerciseIndex, set.id, changes), set.id, place);
        }}
        menuRef={focusTarget(set.id)}
        onRemove={() => removeSetAt(exerciseIndex, set.id)}
        onToggleDone={() => {
          startRestAfter({ done: !set.done });
          setFocusSetId(set.done ? null : (nextInRound(draft, exerciseIndex, set.id)?.setId ?? null));
          changeSet(toggleSetDone(draft, exerciseIndex, set.id), set.id, place);
        }}
      />
    );
  };

  const helpKeys = workoutHelpKeys({
    mode: effortInputMode,
    exercises: draft.exercises,
    strength: previewStrength,
    challenge: draft.challenge?.definition ?? null,
  });

  return (
    <main className="screen stack">
      <header className="workout-header">
        <div className="stack" style={{ gap: 4 }}>
          {draft.programLabel && <span className="muted">{draft.programLabel}</span>}
          <h1 className="title">Workout</h1>
        </div>
        <div className="live-xp">
          <strong>~{formatXp(previewTotal)} XP</strong>
          <span className="muted tiny">{doneSetCount(draft)} sets done</span>
        </div>
      </header>
      <p className="visually-hidden" role="status">
        {setAnnouncement && <span key={setAnnouncement.key}>{setAnnouncement.text}</span>}
      </p>
      {deviceNotices}
      {draft.challenge && (
        <ChallengeBanner
          draft={draft}
          challenge={draft.challenge}
          exercises={exercises}
          unit={unitPref}
          onDiscard={discardWorkout}
        />
      )}
      {start.startNotice && (
        <p className="notice" role="status">
          {start.startNotice}
        </p>
      )}
      {listNotice && (
        <p className="notice" role="status">
          {listNotice}
        </p>
      )}
      {loadProblem && (
        <p className="problem" role="alert">
          {loadProblem}
        </p>
      )}
      <TermHelpRow keys={helpKeys} />
      {draft.exercises.map((exercise, exerciseIndex) => {
        if (exercise.modality === 'cardio')
          return (
            <CardioExerciseCard
              key={cardKeys[exerciseIndex]}
              draft={draft}
              exercise={exercise}
              exerciseIndex={exerciseIndex}
              cardKey={cardKeys[exerciseIndex]}
              previews={previews[exerciseIndex]}
              unit={unitPref}
              note={noteFor(exercise.exerciseId, exercise.name)}
              roomForBout={roomForBout}
              roomForSet={roomForSet}
              actions={cardActions}
            />
          );
        if (exercise.modality === 'hold')
          return (
            <HoldExerciseCard
              key={cardKeys[exerciseIndex]}
              draft={draft}
              exercise={exercise}
              exerciseIndex={exerciseIndex}
              cardKey={cardKeys[exerciseIndex]}
              previews={previews[exerciseIndex]}
              records={records[exerciseIndex]}
              unit={unitPref}
              note={noteFor(exercise.exerciseId, exercise.name)}
              roomForSet={roomForSet}
              actions={cardActions}
            />
          );
        const group = groupOfIndex.get(exerciseIndex);
        if (group !== undefined) {
          if (group.exerciseIndexes[0] !== exerciseIndex) return null;
          const members = group.exerciseIndexes.flatMap((index) => {
            const member = draft.exercises[index];
            return member?.modality === 'lift' ? [{ index, exercise: member }] : [];
          });
          return (
            <SupersetCard
              key={`superset-${group.id}`}
              exerciseNames={members.map(({ exercise: member }) => member.name)}
              members={members.map(({ index, exercise: member }) => (
                <div className="stack superset-member" key={cardKeys[index]}>
                  {liftIntro(member, index)}
                </div>
              ))}
              rounds={roundRows(draft, group)}
              renderCell={(cell, round) => {
                const member = members.find(({ index }) => index === cell.exerciseIndex)?.exercise;
                if (member === undefined) return null;
                const setIndex = member.sets.findIndex((set) => set.id === cell.setId);
                if (setIndex === -1)
                  return <li className="superset-gap muted tiny">{`No ${member.name} set in round ${round}`}</li>;
                return liftSetRow(
                  member,
                  cell.exerciseIndex,
                  member.sets[setIndex],
                  setIndex,
                  `Done ${member.name} round ${round}`,
                  `${member.name}, set ${setIndex + 1}`,
                );
              }}
              canAddRound={canAddRound(draft, group)}
              onAddRound={() => changeDraft(addRound(draft, group))}
              addRoundRef={focusTarget(`superset-${group.id}`)}
            />
          );
        }
        const workingSet = firstWorkingSet(exercise);
        const warmups = warmupsToOffer(exercise, unitPref, barbellOf(exercise), roomForSets(draft));
        const quickFillSets = mostQuickFillSets(draft, exerciseIndex);
        return (
          <section className="panel stack exercise-card" key={cardKeys[exerciseIndex]}>
            {liftIntro(exercise, exerciseIndex)}
            {warmups.length > 0 && (
              <button
                className="button dashed"
                type="button"
                onClick={() => changeDraft(addWarmupSets(draft, exerciseIndex, warmups))}
              >
                + Add warm-ups
              </button>
            )}
            <ol className="set-list">
              {exercise.sets.map((set, setIndex) => liftSetRow(exercise, exerciseIndex, set, setIndex))}
            </ol>
            <button
              ref={focusTarget(cardKeys[exerciseIndex])}
              className="button dashed"
              type="button"
              disabled={!roomForSet}
              onClick={() => changeDraft(addSet(draft, exerciseIndex))}
            >
              + Add set
            </button>
            {canQuickFill(exercise) && quickFillSets > 0 && (
              <QuickFill
                key={`${exercise.target?.sets ?? DEFAULT_QUICK_FILL_SETS}x${workingSet?.reps ?? DEFAULT_QUICK_FILL_REPS}`}
                defaultSets={exercise.target?.sets ?? DEFAULT_QUICK_FILL_SETS}
                mostSets={quickFillSets}
                defaultReps={workingSet?.reps ?? DEFAULT_QUICK_FILL_REPS}
                onFill={(sets, reps) => changeDraft(fillWorkingSets(draft, exerciseIndex, sets, reps))}
              />
            )}
          </section>
        );
      })}
      {roomForSet ? (
        <ExercisePicker
          exercises={addableExercises(draft, exercises)}
          onPick={(exercise) => void addPicked(exercise)}
          searchRef={(search) => {
            if (!search || !focusPickerOnOpen.current) return;
            focusPickerOnOpen.current = false;
            search.focus();
          }}
        />
      ) : (
        <p className="hint">A workout can hold at most {MAX_SETS_PER_SESSION} sets.</p>
      )}
      {roomForSet && !roomForBout && <p className="hint">Cardio exercises are not offered. {BOUTS_FULL_TEXT}</p>}
      <Link className="button link" to="/exercises?new=1">
        Create custom exercise
      </Link>
      <SessionRpeField
        sessionRpe={draft.sessionRpe ?? null}
        onChange={(sessionRpe) => changeDraft(withSessionRpe(draft, sessionRpe))}
      />
      <div ref={finishBar} className="finish-bar" tabIndex={-1}>
        <RestTimerBar
          {...rest}
          focusAfterStop={finishButton}
          focusFallback={finishBar}
          prompt={(moveFocusOn) => <NotifyPrompt userId={userId} onAnswered={moveFocusOn} />}
        />
        {finishProblem && (
          <p className="problem" role="alert">
            {finishProblem}
          </p>
        )}
        <button ref={finishButton} className="button primary big" type="button" disabled={!canFinish} onClick={finish}>
          Finish workout
        </button>
      </div>
      <p className="muted tiny preview-note">~ and new records are previews, confirmed when the workout syncs.</p>
      {!draft.challenge && (
        <button className="button link" type="button" onClick={() => setConfirmingDiscard(true)}>
          Discard workout
        </button>
      )}
      {confirmingDiscard && (
        <ConfirmDialog
          title="Discard this workout?"
          confirmLabel="Discard workout"
          danger
          onConfirm={discardWorkout}
          onCancel={() => setConfirmingDiscard(false)}
        >
          <p>Your logged sets will be lost.</p>
        </ConfirmDialog>
      )}
      {prompt && finishPromptFor === draft && (
        <ConfirmDialog
          title={prompt.title}
          confirmLabel={prompt.confirm.label}
          alternative={
            prompt.alternative
              ? { label: prompt.alternative.label, onChoose: () => void completeFinish(false) }
              : undefined
          }
          onConfirm={() => void completeFinish(prompt.confirm.marksPlannedDone)}
          onCancel={() => setFinishPromptFor(null)}
        >
          {prompt.body && <p>{prompt.body}</p>}
        </ConfirmDialog>
      )}
    </main>
  );
}
