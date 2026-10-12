import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_BALANCE, MAX_SETS_PER_SESSION, type Position } from '@domain/index.ts';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { TermHelpRow } from '../../components/TermHelpRow.tsx';
import { BOUTS_FULL_TEXT } from '../../lib/cardio-rules.ts';
import { challengeSummaryText, challengeVolumeText } from '../../lib/challenge-rules.ts';
import { fetchExercises } from '../../lib/catalog.ts';
import { type Exercise, isLiftExercise, type LoadType } from '../../lib/catalog-rules.ts';
import { loadExercisesCacheFirst } from '../../lib/catalog-cache.ts';
import { loadExerciseNotesCacheFirst, saveCachedExerciseNotes } from '../../lib/exercise-note-cache.ts';
import { type ExerciseNotes, type LocalNoteSaves, withNote } from '../../lib/exercise-note-rules.ts';
import { fetchExerciseNotes, saveExerciseNote } from '../../lib/exercise-notes.ts';
import {
  type ExerciseStrengthView,
  fetchExerciseStrength,
  fetchRecordBaseline,
  fetchStrengthState,
} from '../../lib/collection-data.ts';
import { firstSetFromLastSession, lastTimeText } from '../../lib/last-session-rules.ts';
import { fetchProfile, type UnitPref } from '../../lib/profile.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { useStanding } from '../../lib/standing.ts';
import { RATE_LIMITED_CODE } from '../../lib/rate-limit.ts';
import { stopsRestForWarmup } from '../../lib/rest-timer-rules.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import { readTrainingDeviceSettings } from '../../lib/training-device-store.ts';
import { type SessionBaseline, sessionBaselineAsOf } from '../../lib/session-baseline-rules.ts';
import { readSessionBaseline, saveSessionBaseline } from '../../lib/session-baseline-store.ts';
import { barbellPlates, barbellPlatesText } from '../../lib/plate-rules.ts';
import { readPlateSettings } from '../../lib/plate-settings-store.ts';
import { REQUEST_TIMEOUT_MS } from '../../lib/auth-restore.ts';
import { useIsOffline, useOnlineSignal } from '../../lib/use-online.ts';
import { isDeviceOffline } from '../../offline/cache-first.ts';
import { profileCache } from '../../offline/profile-cache.ts';
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
  type DraftChallenge,
  type DraftSet,
  firstWorkingSet,
  canQuickFill,
  mostQuickFillSets,
  fillWorkingSets,
  plannedSetsLeftToLifter,
  notDoneSetCount,
  removeExercise,
  seedUntouchedSet,
  startDraft,
  startDraftFromDay,
  startDraftFromPrescription,
  type LiftDraftExercise,
  type PrescribedDayStart,
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
  updateBout,
  updateHoldSet,
  updateSet,
} from '../../lib/exercise-edit-rules.ts';
import { fetchLastLoggedSets, type Program, type ProgramDay } from '../../lib/programs.ts';
import { adjustEnrollment, refreshProgramFactsOrCached } from '../../lib/program-enrollment.ts';
import { skipDayEvent } from '../../lib/program-skip-rules.ts';
import { barbellSetupFor, draftBar, programSetMarkers, programSetMarkerTexts } from '../../lib/program-set-rules.ts';
import { useWorkoutDraft } from '../../offline/use-workout-draft.ts';
import {
  addRound,
  canAddRound,
  groupWithNext,
  nextInRound,
  roundRows,
  supersetGroups,
  ungroup,
} from '../../lib/superset-rules.ts';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { InstallCard } from '../../pwa/InstallCard.tsx';
import { ExerciseProgressLink } from '../collection/ExerciseProgressLink.tsx';
import { saveBodyweight } from '../profile/save-bodyweight.ts';
import { recallLastSummary } from '../summary/last-summary.ts';
import { BodyweightPrompt } from './BodyweightPrompt.tsx';
import { CardioSetRow } from './CardioSetRow.tsx';
import { HoldSetRow } from './HoldSetRow.tsx';
import { lastSetForRow } from './last-set-rules.ts';
import { ExerciseMenu } from './ExerciseMenu.tsx';
import { ExerciseNote } from './ExerciseNote.tsx';
import { ExercisePicker } from './ExercisePicker.tsx';
import { OtherAccountDraftNotice } from './OtherAccountDraftNotice.tsx';
import { useActiveProgram } from '../programs/use-active-program.ts';
import { ProgramDayStarts } from './ProgramDayStarts.tsx';
import { ProgramSummary } from './ProgramSummary.tsx';
import { ProgramToday } from './ProgramToday.tsx';
import { QuickFill } from './QuickFill.tsx';
import { RestTimerBar } from './RestTimerBar.tsx';
import { SetRow } from './SetRow.tsx';
import { SessionRpeField } from './SessionRpeField.tsx';
import { SupersetCard } from './SupersetCard.tsx';
import { workoutHelpKeys } from './workout-help.ts';
import { useFinishSync } from './use-finish-sync.ts';
import { WeeklyGoalCard } from './WeeklyGoalCard.tsx';
import { useRecentLiftSessions } from './use-recent-lift-sessions.ts';
import { useRestAlert } from './use-rest-alert.ts';
import { useRestTimer } from './use-rest-timer.ts';
import { useWakeLock } from './use-wake-lock.ts';
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
  rejectionText,
  stalledSyncText,
  startNoticeText,
  syncProblemText,
  WAITING_DRAFT_TEXT,
} from './workout-rules.ts';
import { becomesRecord, previewRecords } from './record-preview.ts';
import { vibrate } from './rest-alert-effects.ts';
import { feedbackLabel, setFeedback, type ShownSetDrop, XP_DROP_MS } from './set-feedback-rules.ts';
import { donePreviewTotal, previewSession } from './xp-preview.ts';

interface WorkoutScreenProps {
  userId: string;
}

const LOAD_TYPE_CHECK_TIMEOUT_MS = 5000;
const DEFAULT_QUICK_FILL_SETS = 3;
const DEFAULT_QUICK_FILL_REPS = 8;

async function currentLoadTypes(draft: WorkoutDraft, exercises: Exercise[]): Promise<Map<string, LoadType>> {
  const builtInIds = new Set(exercises.filter((exercise) => !exercise.custom).map((exercise) => exercise.id));
  const hasCustom = draft.exercises.some((exercise) => !builtInIds.has(exercise.exerciseId));
  if (!hasCustom || isDeviceOffline()) return new Map();
  try {
    const catalog = await fetchExercises({
      includeArchived: true,
      signal: AbortSignal.timeout(LOAD_TYPE_CHECK_TIMEOUT_MS),
    });
    const customIds = new Set(
      draft.exercises.map((exercise) => exercise.exerciseId).filter((id) => !builtInIds.has(id)),
    );
    return new Map(
      catalog
        .filter(isLiftExercise)
        .filter((exercise) => customIds.has(exercise.id))
        .map((exercise) => [exercise.id, exercise.loadType]),
    );
  } catch {
    return new Map();
  }
}

interface ChallengeBannerProps {
  draft: WorkoutDraft;
  challenge: DraftChallenge;
  exercises: readonly Exercise[];
  unit: UnitPref;
  onDiscard: () => void;
}

function ChallengeBanner({ draft, challenge, exercises, unit, onDiscard }: ChallengeBannerProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const nameOf = (exerciseId: string) =>
    exercises.find((exercise) => exercise.id === exerciseId)?.name ??
    draft.exercises.find((exercise) => exercise.exerciseId === exerciseId)?.name ??
    'Exercise';
  const { definition } = challenge;
  return (
    <section className="panel stack" aria-label="Challenge">
      <h2>Challenge: {challenge.name}</h2>
      <span className="muted">{challengeSummaryText(definition, nameOf, unit)}</span>
      {definition.kind === 'volume' && definition.metric === 'kg' && (
        <p className="stack" style={{ gap: 2 }}>
          <span>{challengeVolumeText(draft, definition.target, unit)}</span>
          <span className="muted tiny">Only the weight you load counts, never your bodyweight.</span>
        </p>
      )}
      <button className="button link" type="button" onClick={() => setConfirmingDiscard(true)}>
        Discard challenge
      </button>
      {confirmingDiscard && (
        <ConfirmDialog
          title="Discard this challenge workout?"
          confirmLabel="Discard workout"
          danger
          onConfirm={onDiscard}
          onCancel={() => setConfirmingDiscard(false)}
        >
          <p>Your scroll is kept until a challenge workout is saved.</p>
        </ConfirmDialog>
      )}
    </section>
  );
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
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const [notes, setNotes] = useState<ExerciseNotes>({});
  const notesSavedHere = useRef<LocalNoteSaves>({});
  const offline = useIsOffline();
  const [finishProblem, setFinishProblem] = useState<string | null>(null);
  const [checkingFinish, setCheckingFinish] = useState(false);
  const [finishPromptFor, setFinishPromptFor] = useState<WorkoutDraft | null>(null);
  const [startingDay, setStartingDay] = useState(false);
  const [startNotice, setStartNotice] = useState<string | null>(null);
  const [swappingKey, setSwappingKey] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [focusSetId, setFocusSetId] = useState<string | null>(null);
  const [drop, setDrop] = useState<ShownSetDrop | null>(null);
  const [setAnnouncement, setSetAnnouncement] = useState<{ text: string; key: number } | null>(null);
  const dropCount = useRef(0);
  const [strength, setStrength] = useState<Map<string, ExerciseStrengthView> | null>(null);
  const [loadedBaseline, setLoadedBaseline] = useState<SessionBaseline | null>(null);
  const [cachedBaseline] = useState(() => readSessionBaseline(deviceStorage(), userId));
  const onlineSignal = useOnlineSignal();
  const queryClient = useQueryClient();
  const [bodyweightKg, setBodyweightKg] = useState<number | null>(
    () => profileCache.read(deviceStorage(), userId)?.bodyweightKg ?? null,
  );
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

  useEffect(() => {
    let active = true;
    void loadExerciseNotesCacheFirst(
      localStorage,
      userId,
      fetchExerciseNotes,
      (loaded) => active && setNotes(loaded),
      () => notesSavedHere.current,
    );
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    let active = true;
    fetchExerciseStrength(userId).then(
      (loaded) => active && setStrength(loaded),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [userId, draftSessionId]);

  const draftStartedAt = draft?.startedAt ?? null;
  useEffect(() => {
    if (draftStartedAt === null) return;
    let active = true;
    const records = fetchRecordBaseline(userId).catch(() => null);
    fetchStrengthState(draftStartedAt, DEFAULT_BALANCE.e1rmWindowDays).then(
      async (strength) => {
        const baseline = { asOf: draftStartedAt, strength, records: await records };
        if (!active) return;
        saveSessionBaseline(deviceStorage(), userId, baseline);
        setLoadedBaseline(baseline);
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [userId, draftStartedAt, onlineSignal]);
  const sessionBaseline = sessionBaselineAsOf(draftStartedAt, loadedBaseline, cachedBaseline);
  const previewStrength = sessionBaseline?.strength ?? null;
  const recordBaseline = sessionBaseline?.records ?? null;

  useEffect(() => {
    if (isDeviceOffline()) return;
    let active = true;
    fetchProfile(userId).then(
      (profile) => active && setBodyweightKg(profile.bodyweightKg),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [userId, onlineSignal]);

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

  useEffect(() => {
    if (drop === null) return;
    const timer = setTimeout(() => setDrop(null), XP_DROP_MS);
    return () => clearTimeout(timer);
  }, [drop]);

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

  const openStartedDraft = async (started: { draft: WorkoutDraft; skippedExerciseIds: string[] }) => {
    const outcome = await startWorkout(() => started.draft);
    setStartingDay(false);
    setStartNotice(startNoticeText(outcome, started.skippedExerciseIds.length));
  };

  const startFromDay = async (program: Program, day: ProgramDay) => {
    setStartingDay(true);
    const exerciseIds = [...new Set(day.exercises.map((planned) => planned.exerciseId))];
    const [catalog, lastSets] = await Promise.all([
      fetchExercises({ includeArchived: true }).catch(() => exercises),
      fetchLastLoggedSets(exerciseIds).catch(() => new Map()),
    ]);
    const started = startDraftFromDay(
      { id: day.id, name: day.name, programName: program.name, exercises: day.exercises },
      new Map(catalog.map((exercise) => [exercise.id, exercise])),
      lastSets,
      new Date(),
    );
    await openStartedDraft(started);
  };

  const startFromPrescription = async (day: PrescribedDayStart) => {
    setStartingDay(true);
    const started = startDraftFromPrescription(
      day,
      new Map(exercises.map((exercise) => [exercise.id, exercise])),
      new Date(),
    );
    await openStartedDraft(started);
  };

  const skipProgramDay = async (position: Position) => {
    const enrollment = programCache.enrollment;
    if (!enrollment) return;
    await adjustEnrollment(enrollment.id, skipDayEvent(position));
    showProgramCache(await refreshProgramFactsOrCached(userId, enrollment));
  };

  if (!draft) {
    return (
      <main className="screen stack">
        <div className="screen-header">
          <div className="stack" style={{ gap: 4 }}>
            <span className="muted">
              {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}
            </span>
            <h1 className="title">Today</h1>
          </div>
          {standing.status === 'ready' && (
            <Link className="header-stat" to="/skills">
              <span className="muted tiny">Total · Combat</span>
              <strong>
                {standing.standing.totalLevel} · {standing.standing.combatLevel}
              </strong>
            </Link>
          )}
        </div>
        {deviceNotices}
        {state.notice === 'deleted' && (
          <p className="notice" role="status">
            This workout was deleted
          </p>
        )}
        {state.notice === 'saved_elsewhere' && (
          <p className="notice" role="status">
            This workout was saved in another tab.
          </p>
        )}
        <InstallCard userId={userId} />
        <WeeklyGoalCard />
        <ProgramSummary userId={userId} program={activeProgram} />
        <ProgramToday
          program={activeProgram}
          exercises={exercises}
          unit={unitPref}
          disabled={startingDay}
          onStart={startFromPrescription}
          onSkip={skipProgramDay}
        />
        <ProgramDayStarts userId={userId} disabled={startingDay} onStart={startFromDay} />
        <button
          className="button primary big"
          type="button"
          disabled={startingDay}
          onClick={() => {
            setStartNotice(null);
            void startWorkout(startDraft).then((outcome) => setStartNotice(startNoticeText(outcome, 0)));
          }}
        >
          Start workout
        </button>
        <p className="muted" style={{ textAlign: 'center' }}>
          Freestyle: add exercises as you go.
        </p>
      </main>
    );
  }

  const backToEditing = () => changeDraft({ ...draft, finishedAt: null }, { reopen: true });
  const programBar = draftBar(activeProgram, draft.program?.enrollmentId ?? null);

  if (draft.finishedAt) {
    return (
      <main className="screen stack">
        <h1 className="title">Saving workout…</h1>
        {deviceNotices}
        {finishStatus.kind === 'syncing' && (
          <div className="panel stack" role="status">
            <p>
              {finishStatus.lastProblem
                ? syncProblemText(finishStatus.lastProblem, finishStatus.waitMs)
                : 'Sending your workout…'}
            </p>
            {finishStatus.lastProblem && finishStatus.lastProblem !== RATE_LIMITED_CODE && (
              <button className="button" type="button" onClick={retryNow}>
                Retry now
              </button>
            )}
          </div>
        )}
        {finishStatus.kind === 'stalled' && (
          <div className="panel stack">
            <p className="problem" role="alert">
              {stalledSyncText(finishStatus.reason)}
            </p>
            <button className="button" type="button" onClick={retryNow}>
              Retry now
            </button>
            <button className="button" type="button" onClick={backToEditing}>
              Back to editing
            </button>
          </div>
        )}
        {finishStatus.kind === 'rejected' && finishStatus.reason === 'bodyweight_required' && (
          <BodyweightPrompt
            unit={unitPref}
            onSave={async (bodyweightKg) => {
              await saveBodyweight({ userId, bodyweightKg, storage: deviceStorage(), queryClient });
              setBodyweightKg(bodyweightKg);
              retryNow();
            }}
          />
        )}
        {finishStatus.kind === 'rejected' && finishStatus.reason !== 'bodyweight_required' && (
          <div className="panel stack">
            <p className="problem" role="alert">
              {rejectionText(finishStatus.reason)}
            </p>
            <button className="button" type="button" onClick={backToEditing}>
              Back to editing
            </button>
            <button className="button danger" type="button" onClick={() => discardDraft(draft.sessionId)}>
              Discard workout
            </button>
          </div>
        )}
      </main>
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
    const loadTypes = await currentLoadTypes(draft, exercises);
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
      onSave={async (body) => {
        const saved = await saveExerciseNote(exerciseId, body);
        notesSavedHere.current = { ...notesSavedHere.current, [exerciseId]: saved };
        setNotes((current) => {
          const next = withNote(current, exerciseId, saved);
          saveCachedExerciseNotes(localStorage, userId, next);
          return next;
        });
      }}
    />
  );
  const changeSet = (
    next: WorkoutDraft,
    setId: string,
    place: { exerciseIndex: number; setIndex: number; label: string },
  ) => {
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
    if (feedback.drop) {
      dropCount.current += 1;
      setDrop({ ...feedback.drop, setId, key: dropCount.current });
      setSetAnnouncement({ text: feedback.drop.announcement, key: dropCount.current });
    }
    changeDraft(next);
  };
  const dropOn = (setId: string) => (drop?.setId === setId ? drop : null);
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
        onRemove={() => changeDraft(removeSet(draft, exerciseIndex, set.id))}
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
      {startNotice && (
        <p className="notice" role="status">
          {startNotice}
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
        if (exercise.modality === 'cardio') {
          const doneHere = exercise.sets.filter((set) => set.done).length;
          return (
            <section className="panel stack exercise-card" key={cardKeys[exerciseIndex]}>
              <header>
                <h2>{exercise.name}</h2>
                <span className="row">
                  <button className="button link" type="button" onClick={() => removeExerciseAt(exerciseIndex)}>
                    Remove
                  </button>
                </span>
              </header>
              <p className="muted">{`${doneHere}/${exercise.sets.length} bouts`}</p>
              {noteFor(exercise.exerciseId, exercise.name)}
              <ol className="set-list">
                {exercise.sets.map((bout, boutIndex) => (
                  <CardioSetRow
                    key={bout.id}
                    boutNumber={boutIndex + 1}
                    bout={bout}
                    paceUnit={exercise.activity.paceUnit}
                    tracksDistance={exercise.activity.tracksDistance}
                    preview={previews[exerciseIndex][boutIndex]}
                    drop={dropOn(bout.id)}
                    unit={unitPref}
                    onChange={(changes) =>
                      changeSet(updateBout(draft, exerciseIndex, bout.id, changes), bout.id, {
                        exerciseIndex,
                        setIndex: boutIndex,
                        label: feedbackLabel(exercise.name, 'bout', boutIndex + 1),
                      })
                    }
                    onRemove={() => changeDraft(removeSet(draft, exerciseIndex, bout.id))}
                    onToggleDone={() =>
                      changeSet(toggleSetDone(draft, exerciseIndex, bout.id), bout.id, {
                        exerciseIndex,
                        setIndex: boutIndex,
                        label: feedbackLabel(exercise.name, 'bout', boutIndex + 1),
                      })
                    }
                  />
                ))}
              </ol>
              <button
                className="button dashed"
                type="button"
                disabled={!roomForBout}
                onClick={() => changeDraft(addSet(draft, exerciseIndex))}
              >
                + Add bout
              </button>
              {roomForSet && !roomForBout && <p className="hint">{BOUTS_FULL_TEXT}</p>}
            </section>
          );
        }
        if (exercise.modality === 'hold') {
          const doneHere = exercise.sets.filter((set) => set.done).length;
          return (
            <section className="panel stack exercise-card" key={cardKeys[exerciseIndex]}>
              <header>
                <h2>{exercise.name}</h2>
                <span className="row">
                  <button className="button link" type="button" onClick={() => removeExerciseAt(exerciseIndex)}>
                    Remove
                  </button>
                </span>
              </header>
              <p className="muted">{`${doneHere}/${exercise.sets.length} sets`}</p>
              {noteFor(exercise.exerciseId, exercise.name)}
              <ol className="set-list">
                {exercise.sets.map((set, setIndex) => (
                  <HoldSetRow
                    key={set.id}
                    setNumber={setIndex + 1}
                    set={set}
                    measure={exercise.measure}
                    loadType={exercise.loadType}
                    preview={previews[exerciseIndex][setIndex]}
                    record={records[exerciseIndex][setIndex]}
                    drop={dropOn(set.id)}
                    unit={unitPref}
                    onChange={(changes) =>
                      changeSet(updateHoldSet(draft, exerciseIndex, set.id, changes), set.id, {
                        exerciseIndex,
                        setIndex,
                        label: feedbackLabel(exercise.name, 'set', setIndex + 1),
                      })
                    }
                    onRemove={() => changeDraft(removeSet(draft, exerciseIndex, set.id))}
                    onToggleDone={() =>
                      changeSet(toggleSetDone(draft, exerciseIndex, set.id), set.id, {
                        exerciseIndex,
                        setIndex,
                        label: feedbackLabel(exercise.name, 'set', setIndex + 1),
                      })
                    }
                  />
                ))}
              </ol>
              <button
                className="button dashed"
                type="button"
                disabled={!roomForSet}
                onClick={() => changeDraft(addSet(draft, exerciseIndex))}
              >
                + Add set
              </button>
            </section>
          );
        }
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
        <RestTimerBar {...rest} focusAfterStop={finishButton} focusFallback={finishBar} />
        {finishProblem && (
          <p className="problem" role="alert">
            {finishProblem}
          </p>
        )}
        <button ref={finishButton} className="button primary big" type="button" disabled={!canFinish} onClick={finish}>
          Finish workout
        </button>
        <span className="muted tiny">~ and new records are previews, confirmed when the workout syncs.</span>
      </div>
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
