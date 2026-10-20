import { useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { TermHelpRow } from '../../components/TermHelpRow.tsx';
import { formatCount, formatXp } from '../../lib/format.ts';
import { deviceStorage } from '../../lib/platform/keyed-store.ts';
import { useIsOffline, useOnlineSignal } from '../../lib/platform/use-online.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { barbellSetupFor, draftBar } from '../../lib/programs/program-set-rules.ts';
import { useStanding } from '../../lib/progress/standing.ts';
import { BOUTS_FULL_TEXT } from '../../lib/workout/cardio-rules.ts';
import { addableExercises, canAddSetTo } from '../../lib/workout/exercise-edit-rules.ts';
import { readPlateSettings } from '../../lib/workout/plate-settings-store.ts';
import { supersetGroups } from '../../lib/workout/superset-rules.ts';
import { readTrainingDeviceSettings } from '../../lib/workout/training-device-store.ts';
import { doneSetCount, withSessionRpe } from '../../offline/draft-edits.ts';
import { useWorkoutDraft } from '../../offline/use-workout-draft.ts';
import { useOnboarding } from '../onboarding/use-onboarding.ts';
import { useActiveProgram } from '../programs/use-active-program.ts';
import { saveBodyweight } from '../profile/save-bodyweight.ts';
import { recallLastSummary } from '../../offline/last-summary.ts';
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
import { useFinishSync } from './use-finish-sync.ts';
import { useFinishWorkout } from './use-finish-workout.ts';
import { useLatestBodyweight } from './use-latest-bodyweight.ts';
import { useRecentLiftSessions } from './use-recent-lift-sessions.ts';
import { useRestAlert } from './use-rest-alert.ts';
import { useRestTimer } from './use-rest-timer.ts';
import { useExerciseStrength, useSessionBaseline } from './use-session-strength.ts';
import { useWakeLock } from './use-wake-lock.ts';
import { useWorkoutCommands } from './use-workout-commands.ts';
import { useWorkoutPreviews } from './use-workout-previews.ts';
import { useWorkoutStart } from './use-workout-start.ts';
import { workoutHelpKeys } from './workout-help.ts';
import { deviceSaveProblemText, SETS_FULL_TEXT, WAITING_DRAFT_TEXT } from './workout-rules.ts';
import { liftIdsToRecall, swappableLifts } from './workout-screen-rules.ts';
import { donePreviewTotal } from './xp-preview.ts';

interface WorkoutScreenProps {
  userId: string;
}

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
  const finishBlockedId = useId();
  const { unitPref, effortInputMode } = usePreferences();
  const draft = state.status === 'ready' ? state.draft : null;
  const onboarding = useOnboarding(userId, draft !== null);
  const focusPickerOnOpen = useRef(false);
  const draftSessionId = draft?.sessionId ?? null;
  const recentSessions = useRecentLiftSessions(`${userId}/${draftSessionId}`, liftIdsToRecall(draft), onlineSignal);
  useWakeLock(keepAwake, draft !== null && !draft.finishedAt);

  const { exercises, loadProblem, listNotice } = useExerciseList(userId);
  const { notes, saveNote } = useExerciseNotes(userId);
  const strength = useExerciseStrength(userId);
  const sessionBaseline = useSessionBaseline(userId, draft?.startedAt ?? null, onlineSignal);
  const bodyweightKg = useLatestBodyweight(userId);
  const start = useWorkoutStart({ userId, exercises, startWorkout, programCache, showProgramCache });
  const { previews, records, feedbackFor } = useWorkoutPreviews({
    exercises,
    draftExercises: draft?.exercises ?? null,
    baseline: sessionBaseline,
    bodyweightKg,
  });
  const commands = useWorkoutCommands({
    userId,
    draft,
    draftActions: { changeDraft, updateDraft, discardDraft },
    recentSessions,
    feedbackFor,
    stopRest: rest.stop,
  });
  const finishing = useFinishWorkout({ userId, draft, exercises, updateDraft, stopRest: rest.stop });

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

  if (draft.finishedAt) {
    return (
      <SavingWorkoutView
        deviceNotices={deviceNotices}
        finishStatus={finishStatus}
        unit={unitPref}
        onRetryNow={retryNow}
        onBackToEditing={() => changeDraft({ ...draft, finishedAt: null }, { reopen: true })}
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
  const lift: LiftCardContext = {
    draft,
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
    onFocusSet: commands.setFocusSetId,
    note: noteFor,
  };
  const groups = supersetGroups(draft);
  const prompt = finishing.prompt;

  const helpKeys = workoutHelpKeys({
    mode: effortInputMode,
    exercises: draft.exercises,
    strength: sessionBaseline?.strength ?? null,
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
          <strong>~{formatXp(donePreviewTotal(previews, draft.exercises))} XP</strong>
          <span className="muted tiny">{formatCount(doneSetCount(draft), 'set')} done</span>
        </div>
      </header>
      <p className="visually-hidden" role="status">
        {commands.announcement && <span key={commands.announcement.key}>{commands.announcement.text}</span>}
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
      {draft.exercises.map((exercise, exerciseIndex) => {
        if (exercise.modality === 'cardio')
          return (
            <CardioExerciseCard
              key={exercise.clientId}
              draft={draft}
              exercise={exercise}
              exerciseIndex={exerciseIndex}
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
              key={exercise.clientId}
              draft={draft}
              exercise={exercise}
              exerciseIndex={exerciseIndex}
              previews={previews[exerciseIndex]}
              records={records[exerciseIndex]}
              unit={unitPref}
              note={noteFor(exercise.exerciseId, exercise.name)}
              roomForSet={roomForSet}
              actions={cardActions}
            />
          );
        const group = groups.find((candidate) => candidate.exerciseIndexes.includes(exerciseIndex));
        if (group !== undefined)
          return group.exerciseIndexes[0] === exerciseIndex ? (
            <LiftSupersetCard key={`superset-${group.id}`} group={group} lift={lift} />
          ) : null;
        return (
          <LiftExerciseCard key={exercise.clientId} exercise={exercise} exerciseIndex={exerciseIndex} lift={lift} />
        );
      })}
      {roomForSet ? (
        <ExercisePicker
          exercises={addableExercises(draft, exercises)}
          onPick={(exercise) => void commands.addPicked(exercise)}
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
      <Link className="button link" to="/exercises?new=1">
        Create custom exercise
      </Link>
      {draft.exercises.length > 0 && (
        <SessionRpeField
          sessionRpe={draft.sessionRpe ?? null}
          onChange={(sessionRpe) => changeDraft(withSessionRpe(draft, sessionRpe))}
        />
      )}
      <div ref={finishBar} className="finish-bar" tabIndex={-1}>
        <RestTimerBar
          {...rest}
          focusAfterStop={finishButton}
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
          Finish workout
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
              ? { label: prompt.alternative.label, onChoose: () => finishing.completeFinish(false) }
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
