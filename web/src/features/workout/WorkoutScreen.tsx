import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { TermHelpRow } from '../../components/TermHelpRow.tsx';
import { formatCount, formatXp } from '../../lib/format.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { useIsOffline, useOnlineSignal } from '../../lib/platform/use-online.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { useActiveProgram } from '../../lib/programs/enrollment.ts';
import { barbellSetupFor, draftBar } from '../../lib/programs/program-set-rules.ts';
import { useStanding } from '../../lib/progress/standing.ts';
import { BOUTS_FULL_TEXT } from '../../lib/workout/cardio-rules.ts';
import { addableExercises, canAddSetTo } from '../../lib/workout/exercise-edit-rules.ts';
import { readPlateSettings } from '../../lib/workout/plate-settings-store.ts';
import { currentSetId } from '../../lib/workout/current-set-rules.ts';
import { supersetGroups } from '../../lib/workout/superset-rules.ts';
import { readTrainingDeviceSettings } from '../../lib/workout/training-device-store.ts';
import { doneSetCount, withSessionRpe } from '../../offline/draft-edits.ts';
import { useWorkoutDraft } from '../../offline/use-workout-draft.ts';
import { useOnboarding } from '../onboarding/use-onboarding.ts';
import { saveBodyweight } from '../profile/save-bodyweight.ts';
import { finishOutcomeCovers } from '../../offline/finish-outcome.ts';
import { CardioExerciseCard } from './CardioExerciseCard.tsx';
import { ChallengeBanner } from './ChallengeBanner.tsx';
import { liftEquipment } from './exercise-card-rules.ts';
import { ExerciseNote } from './ExerciseNote.tsx';
import { ExercisePicker } from './ExercisePicker.tsx';
import { HoldExerciseCard } from './HoldExerciseCard.tsx';
import { type LiftCardContext } from './lift-card-context.ts';
import { LiftExerciseCard } from './LiftExerciseCard.tsx';
import { LiftSupersetCard } from './LiftSupersetCard.tsx';
import { NotifyPrompt } from './NotifyPrompt.tsx';
import { OtherAccountDraftNotice } from './OtherAccountDraftNotice.tsx';
import { RestTimerBar } from './RestTimerBar.tsx';
import { DiscardWorkoutDialog } from './DiscardWorkoutDialog.tsx';
import { SavingWorkoutView } from './SavingWorkoutView.tsx';
import { SessionRpeField } from './SessionRpeField.tsx';
import { TodayView } from './TodayView.tsx';
import { useExerciseList } from './use-exercise-list.ts';
import { useExerciseNotes } from './use-exercise-notes.ts';
import { useFinishBarClearance } from './use-finish-bar-clearance.ts';
import { useFinishSync } from './use-finish-sync.ts';
import { useFinishWorkout } from './use-finish-workout.ts';
import { useLatestBodyweight } from './use-latest-bodyweight.ts';
import { useRecentLiftSessions } from './use-recent-lift-sessions.ts';
import { useRestAlert } from './use-rest-alert.ts';
import { useRestTimer } from './use-rest-timer.ts';
import { useExerciseStrength, useSessionBaseline } from './use-session-strength.ts';
import { useSessionState } from './use-session-state.ts';
import { useWakeLock } from './use-wake-lock.ts';
import { useWorkoutCommands } from './use-workout-commands.ts';
import { WorkoutClock } from './WorkoutClock.tsx';
import { AddProgramDay } from './AddProgramDay.tsx';
import { useProgramDays } from './use-program-days.ts';
import { type DraftExercise } from '../../offline/draft-format.ts';
import {
  canAddSecondDay,
  canRemoveSecondDay,
  type DraftDay,
  dayNameOf,
  draftTitle,
  exerciseIndexesOf,
} from '../../offline/draft-days.ts';
import { useWorkoutPreviews } from './use-workout-previews.ts';
import { useWorkoutStart } from './use-workout-start.ts';
import { workoutHelpKeys } from './workout-help.ts';
import { deviceSaveProblemText, savingAtRisk, SETS_FULL_TEXT, WAITING_DRAFT_TEXT } from './workout-rules.ts';
import { liftIdsToRecall, swappableLifts } from './workout-screen-rules.ts';
import { donePreviewTotal } from './xp-preview.ts';

interface WorkoutScreenProps {
  userId: string;
}

function exerciseIdToAdd(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('addExerciseId' in state)) return null;
  return typeof state.addExerciseId === 'string' ? state.addExerciseId : null;
}

function nextSetToLog(scope: ParentNode | null | undefined): HTMLButtonElement | null {
  const toggles = [...(scope?.querySelectorAll<HTMLButtonElement>('button.done-toggle') ?? [])];
  const ticked = toggles.map((toggle) => toggle.getAttribute('aria-pressed') === 'true');
  const afterLastTicked = toggles.slice(ticked.lastIndexOf(true) + 1);
  const unticked = (toggle: HTMLButtonElement) => toggle.getAttribute('aria-pressed') === 'false';
  return afterLastTicked.find(unticked) ?? toggles.find(unticked) ?? null;
}

export function WorkoutScreen({ userId }: WorkoutScreenProps) {
  const navigate = useNavigate();
  const location = useLocation();
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
  const onlineSignal = useOnlineSignal();
  const queryClient = useQueryClient();
  const standing = useStanding(userId);
  const { program: activeProgram, loadStatus: programLoadStatus, adjust: adjustProgram } = useActiveProgram(userId);
  const rest = useRestTimer(userId);
  useRestAlert(userId, rest.timer);
  const [keepAwake] = useState(() => readTrainingDeviceSettings(deviceStorage(), userId).keepAwake);
  const [plateSettings] = useState(() => readPlateSettings(deviceStorage(), userId));
  const finishButton = useRef<HTMLButtonElement>(null);
  const finishBar = useRef<HTMLDivElement>(null);
  const finishBlockedId = useId();
  const { unitPref, effortInputMode } = usePreferences();
  const draft = state.status === 'ready' ? state.draft : null;
  const onboarding = useOnboarding(userId, draft !== null);
  const focusPickerOnOpen = useRef(false);
  const draftSessionId = draft?.sessionId ?? null;
  const pickCount = useRef(0);
  const [pickedExercise, setPickedExercise] = useSessionState<{ name: string; key: number } | null>(
    draftSessionId,
    null,
  );
  const recentSessions = useRecentLiftSessions(`${userId}/${draftSessionId}`, liftIdsToRecall(draft), onlineSignal);
  const workoutOpen = draft !== null && !draft.finishedAt;
  useWakeLock(keepAwake, workoutOpen);
  useFinishBarClearance(finishBar, workoutOpen);
  const changesAtRisk = savingAtRisk(saveProblem);
  useEffect(() => {
    if (!changesAtRisk) return;
    const holdPage = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', holdPage);
    return () => window.removeEventListener('beforeunload', holdPage);
  }, [changesAtRisk]);
  useEffect(() => {
    if (pickedExercise === null) return;
    const headings = finishBar.current?.parentElement?.querySelectorAll<HTMLElement>('.exercise-card > header > h2');
    headings?.[headings.length - 1]?.focus();
  }, [pickedExercise]);

  const { exercises, loadProblem, listNotice } = useExerciseList(userId);
  const { notes, saveNote } = useExerciseNotes(userId);
  const strength = useExerciseStrength(userId);
  const sessionBaseline = useSessionBaseline(userId, draft?.startedAt ?? null, onlineSignal);
  const bodyweightKg = useLatestBodyweight(userId);
  const start = useWorkoutStart({ userId, exercises, startWorkout, adjustProgram });
  const { previews, records, feedbackFor } = useWorkoutPreviews({
    exercises,
    draft,
    baseline: sessionBaseline,
    bodyweightKg,
  });
  const commands = useWorkoutCommands({
    userId,
    draft,
    draftActions: { updateDraft, discardDraft },
    recentSessions,
    feedbackFor,
    stopRest: rest.stop,
  });
  const exerciseToAdd = exerciseIdToAdd(location.state);
  const addedForLocation = useRef<string | null>(null);
  useEffect(() => {
    if (exerciseToAdd === null || !workoutOpen || addedForLocation.current === location.key) return;
    const added = addableExercises(draft, exercises).find((exercise) => exercise.id === exerciseToAdd);
    if (added === undefined && exercises.every((exercise) => exercise.id !== exerciseToAdd)) return;
    addedForLocation.current = location.key;
    if (added !== undefined) void commands.addPicked(added);
    void navigate('/', { replace: true, state: null });
  }, [exerciseToAdd, workoutOpen, location.key, draft, exercises, commands, navigate]);
  const finishing = useFinishWorkout({ userId, draft, exercises, updateDraft, stopRest: rest.stop });
  const programDays = useProgramDays(draft, exercises, updateDraft);

  const {
    status: finishStatus,
    holding,
    retryNow,
    saveNow,
  } = useFinishSync({
    userId,
    draft,
    store,
    flush,
    markSynced,
    onSynced: (summary) => navigate('/reveal', { state: summary }),
    onSuperseded: (sessionId) => {
      if (finishOutcomeCovers(userId, sessionId)) navigate('/reveal');
      else void reload();
    },
    onDeleted: () => void reload('deleted'),
  });

  if (state.status === 'loading') return <ScreenSkeleton />;

  const deviceNotices = (
    <>
      {saveProblem && (
        <div className="stack">
          <p className="problem" role="alert">
            {deviceSaveProblemText(saveProblem)}
          </p>
          {changesAtRisk && draft && (
            <button className="button" type="button" onClick={() => changeDraft(draft)}>
              Retry
            </button>
          )}
        </div>
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
        programLoadStatus={programLoadStatus}
        start={start}
        onboarding={onboarding}
        onFreestyleFromOnboarding={() => {
          focusPickerOnOpen.current = true;
          start.startFreestyle();
        }}
      />
    );
  }

  if (draft.finishedAt) {
    return (
      <SavingWorkoutView
        offline={offline}
        deviceNotices={deviceNotices}
        finishStatus={finishStatus}
        holding={holding}
        unit={unitPref}
        onSaveNow={saveNow}
        onRetryNow={retryNow}
        onBackToEditing={() => updateDraft((latest) => ({ ...latest, finishedAt: null }), { reopen: true })}
        onSaveBodyweight={async (bodyweightKg) => {
          await saveBodyweight({ userId, bodyweightKg, storage: deviceStorage(), queryClient });
          retryNow();
        }}
        onDiscard={() => discardDraft(draft.sessionId)}
      />
    );
  }

  const roomForSet = canAddSetTo(draft, 'lift');
  const roomForBout = canAddSetTo(draft, 'cardio');
  const { cardActions } = commands;
  const noteFor = (exerciseId: string, exerciseName: string) => (
    <ExerciseNote
      exerciseName={exerciseName}
      note={notes[exerciseId]}
      offline={offline}
      onSave={(body) => saveNote(exerciseId, body)}
    />
  );
  const currentSet = currentSetId(draft);
  const lift: LiftCardContext = {
    draft,
    catalog: exercises,
    previews,
    records,
    unit: unitPref,
    effortMode: effortInputMode,
    equipment: liftEquipment(exercises),
    barbellSetup: barbellSetupFor(
      plateSettings,
      unitPref,
      draftBar(activeProgram, draft.program?.enrollmentId ?? null),
    ),
    strength,
    recentSessions: recentSessions.byExercise,
    rest,
    roomForSet,
    actions: cardActions,
    menuActions: commands.menuActions,
    swap: { openKey: commands.swappingKey, lifts: swappableLifts(exercises), swapTo: commands.swapTo },
    focusSetId: commands.focusSetId,
    currentSetId: currentSet,
    onFocusSet: commands.setFocusSetId,
    note: noteFor,
  };
  const groups = supersetGroups(draft);
  const title = draftTitle(draft);
  const secondDayName = draft.secondDay ? dayNameOf(draft.secondDay.programLabel) : null;
  const prompt = finishing.prompt;

  const helpKeys = workoutHelpKeys({
    mode: effortInputMode,
    exercises: draft.exercises,
    strength: sessionBaseline?.strength ?? null,
    challenge: draft.challenge?.definition ?? null,
  });

  const renderCard = (exercise: DraftExercise, exerciseIndex: number) => {
    if (exercise.modality === 'cardio')
      return (
        <CardioExerciseCard
          key={exercise.clientId}
          exercise={exercise}
          exerciseIndex={exerciseIndex}
          previews={previews[exerciseIndex]}
          records={records[exerciseIndex]}
          unit={unitPref}
          note={noteFor(exercise.exerciseId, exercise.name)}
          roomForBout={roomForBout}
          roomForSet={roomForSet}
          currentSetId={currentSet}
          actions={cardActions}
        />
      );
    if (exercise.modality === 'hold')
      return (
        <HoldExerciseCard
          key={exercise.clientId}
          exercise={exercise}
          exerciseIndex={exerciseIndex}
          previews={previews[exerciseIndex]}
          records={records[exerciseIndex]}
          unit={unitPref}
          note={noteFor(exercise.exerciseId, exercise.name)}
          roomForSet={roomForSet}
          currentSetId={currentSet}
          actions={cardActions}
        />
      );
    const group = groups.find((candidate) => candidate.exerciseIndexes.includes(exerciseIndex));
    if (group !== undefined)
      return group.exerciseIndexes[0] === exerciseIndex ? (
        <LiftSupersetCard key={`superset-${group.id}`} group={group} lift={lift} />
      ) : null;
    return <LiftExerciseCard key={exercise.clientId} exercise={exercise} exerciseIndex={exerciseIndex} lift={lift} />;
  };
  const exercisesOfDay = (day: DraftDay) =>
    exerciseIndexesOf(draft, day).map((exerciseIndex) => renderCard(draft.exercises[exerciseIndex], exerciseIndex));

  return (
    <main className="screen stack">
      <header className="workout-header">
        <div className="stack" style={{ gap: 'var(--space-1)' }}>
          {title && <span className="muted">{title}</span>}
          <h1 className="title">Workout</h1>
        </div>
        <div className="live-xp">
          <strong>~{formatXp(donePreviewTotal(previews, draft.exercises))} XP</strong>
        </div>
      </header>
      <p className="visually-hidden" role="status">
        {commands.announcement && <span key={commands.announcement.key}>{commands.announcement.text}</span>}
      </p>
      <p className="visually-hidden" role="status">
        {pickedExercise && <span key={pickedExercise.key}>{pickedExercise.name} added</span>}
      </p>
      {deviceNotices}
      {draft.challenge && (
        <ChallengeBanner
          draft={draft}
          challenge={draft.challenge}
          exercises={exercises}
          unit={unitPref}
          onDiscard={commands.discardWorkout}
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
      {draft.secondDay && draft.programLabel && <h2>{dayNameOf(draft.programLabel)}</h2>}
      {exercisesOfDay('first')}
      {secondDayName !== null && (
        <div className="row spread">
          <h2>{secondDayName}</h2>
          {canRemoveSecondDay(draft) && (
            <button
              className="button link"
              type="button"
              aria-label={`Remove ${secondDayName}`}
              onClick={programDays.removeSecondDay}
            >
              Remove day
            </button>
          )}
        </div>
      )}
      {exercisesOfDay('second')}
      {roomForSet ? (
        <ExercisePicker
          exercises={addableExercises(draft, exercises)}
          onPick={(exercise) => {
            void commands.addPicked(exercise);
            pickCount.current += 1;
            setPickedExercise({ name: exercise.name, key: pickCount.current });
          }}
          searchRef={(search) => {
            if (!search || !focusPickerOnOpen.current) return;
            focusPickerOnOpen.current = false;
            search.focus();
          }}
        />
      ) : (
        <p className="hint">{SETS_FULL_TEXT}</p>
      )}
      {roomForSet && !roomForBout && <p className="hint">Cardio exercises are not offered. {BOUTS_FULL_TEXT}</p>}
      {roomForSet && draft.program && canAddSecondDay(draft) && (
        <AddProgramDay program={activeProgram} link={draft.program} onAdd={programDays.addDay} />
      )}
      <Link className="button link" to="/exercises?new=1&from=workout">
        Create custom exercise
      </Link>
      {draft.exercises.length > 0 && (
        <SessionRpeField
          sessionRpe={draft.sessionRpe ?? null}
          onChange={(sessionRpe) => updateDraft((latest) => withSessionRpe(latest, sessionRpe))}
        />
      )}
      <div ref={finishBar} className="finish-bar" tabIndex={-1}>
        <p className="finish-status">
          <span className="active-workout-clock">
            <WorkoutClock startedAt={draft.startedAt} finishedAt={draft.finishedAt} />
          </span>{' '}
          · {formatCount(doneSetCount(draft), 'set')} done
        </p>
        <RestTimerBar
          {...rest}
          focusAfterStop={() => {
            const finish = finishButton.current;
            return nextSetToLog(finishBar.current?.parentElement) ?? (finish && !finish.disabled ? finish : null);
          }}
          focusFallback={finishBar}
          prompt={(moveFocusOn) => <NotifyPrompt userId={userId} onAnswered={moveFocusOn} />}
        />
        {finishing.finishProblem && (
          <p className="problem" role="alert">
            {finishing.finishProblem}
          </p>
        )}
        {finishing.blockedText && (
          <p className="hint" id={finishBlockedId}>
            {finishing.blockedText}
          </p>
        )}
        <button
          ref={finishButton}
          className="button primary big"
          type="button"
          disabled={!finishing.canFinish}
          aria-describedby={finishing.blockedText ? finishBlockedId : undefined}
          onClick={finishing.finish}
        >
          Finish<span className="finish-word"> workout</span>
        </button>
      </div>
      <p className="muted tiny preview-note">~ and new records are previews, confirmed when the workout syncs.</p>
      {!draft.challenge && (
        <button className="button link" type="button" onClick={() => commands.setConfirmingDiscard(true)}>
          Discard workout
        </button>
      )}
      {commands.removeConfirm && (
        <ConfirmDialog
          title={`Remove ${commands.removeConfirm.exerciseName}?`}
          confirmLabel="Remove exercise"
          danger
          onConfirm={commands.removeConfirm.confirm}
          onCancel={commands.removeConfirm.cancel}
        >
          <p>Its sets will be lost.</p>
        </ConfirmDialog>
      )}
      {commands.confirmingDiscard && (
        <DiscardWorkoutDialog
          onConfirm={commands.discardWorkout}
          onCancel={() => commands.setConfirmingDiscard(false)}
        />
      )}
      {prompt && (
        <ConfirmDialog
          title={prompt.title}
          confirmLabel={prompt.confirm.label}
          alternative={
            prompt.alternative
              ? {
                  label: prompt.alternative.label,
                  onChoose: () => finishing.completeFinish(!prompt.confirm.marksPlannedDone),
                }
              : undefined
          }
          onConfirm={() => finishing.completeFinish(prompt.confirm.marksPlannedDone)}
          onCancel={finishing.cancelPrompt}
        >
          {prompt.body && <p>{prompt.body}</p>}
        </ConfirmDialog>
      )}
    </main>
  );
}
