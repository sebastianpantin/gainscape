import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_BALANCE, type Position } from '@domain/index.ts';
import { Link, useNavigate } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { TermHelpRow } from '../../components/TermHelpRow.tsx';
import { canAddBout } from '../../lib/cardio-rules.ts';
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
import { strengthText } from '../../lib/collection-rules.ts';
import { firstSetFromLastSession, lastTimeText } from '../../lib/last-session-rules.ts';
import { fatigueAdvice, nextWeightHint, progressionStep } from '../../lib/progression-rules.ts';
import { fetchProfile, type Profile, updatePrivateProfile } from '../../lib/profile.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { useStanding } from '../../lib/standing.ts';
import { RATE_LIMITED_CODE } from '../../lib/rate-limit.ts';
import { REST_OFF, restClock, startsRest, stopsRestForWarmup } from '../../lib/rest-timer-rules.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import { readTrainingDeviceSettings } from '../../lib/training-device-store.ts';
import type { SessionBaseline } from '../../lib/session-baseline-rules.ts';
import { readSessionBaseline, saveSessionBaseline } from '../../lib/session-baseline-store.ts';
import { barbellPlates, barbellPlatesText } from '../../lib/plate-rules.ts';
import { readPlateSettings } from '../../lib/plate-settings-store.ts';
import { warmupPlan } from '../../lib/warmup-rules.ts';
import { REQUEST_TIMEOUT_MS } from '../../lib/auth-restore.ts';
import { useIsOffline, useOnlineSignal } from '../../lib/use-online.ts';
import { type CacheFirstLoad, isDeviceOffline } from '../../offline/cache-first.ts';
import { profileCache, rememberSavedBodyweight } from '../../offline/profile-cache.ts';
import { formatXp } from '../../lib/format.ts';
import { shownWeight, unitToKg } from '../../lib/units.ts';
import {
  addCardioExercise,
  addExercise,
  addSet,
  addWarmupSets,
  canSwapExercise,
  doneSetCount,
  type DraftChallenge,
  type DraftSet,
  firstWorkingSet,
  canQuickFill,
  fillWorkingSets,
  markPlannedSetsDone,
  plannedSetsLeftToLifter,
  notDoneSetCount,
  removeExercise,
  removeSet,
  seedUntouchedSet,
  startDraft,
  startDraftFromDay,
  startDraftFromPrescription,
  type LiftDraftExercise,
  type PrescribedDayStart,
  swapExercise,
  toggleSetDone,
  updateBout,
  updateSet,
  withCurrentLoadTypes,
  withSessionRpe,
  type WorkoutDraft,
} from '../../offline/draft-format.ts';
import { fetchLastLoggedSets, type Program, type ProgramDay } from '../../lib/programs.ts';
import { adjustEnrollment, refreshProgramFactsOrCached } from '../../lib/program-enrollment.ts';
import { skipDayEvent } from '../../lib/program-skip-rules.ts';
import { barbellSetupFor, draftBar, programSetMarkers, programSetMarkerTexts } from '../../lib/program-set-rules.ts';
import { useWorkoutDraft } from '../../offline/use-workout-draft.ts';
import {
  addRound,
  groupWithNext,
  nextInRound,
  restsAfter,
  roundRows,
  supersetGroups,
  ungroup,
} from '../../lib/superset-rules.ts';
import { ScreenSkeleton } from '../../components/ScreenSkeleton.tsx';
import { InstallCard } from '../../pwa/InstallCard.tsx';
import { ExerciseProgressLink } from '../collection/ExerciseProgressLink.tsx';
import { recallLastSummary } from '../summary/last-summary.ts';
import { BodyweightPrompt } from './BodyweightPrompt.tsx';
import { CardioSetRow } from './CardioSetRow.tsx';
import { ExerciseMenu, type ExerciseMenuAction } from './ExerciseMenu.tsx';
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
import { canFinishWorkout, finishPrompt, rejectionText, stalledSyncText, syncProblemText } from './workout-rules.ts';
import { becomesRecord, previewRecords } from './record-preview.ts';
import { vibrateNewRecord } from './record-haptic.ts';
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
  if (!hasCustom || navigator.onLine === false) return new Map();
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
  onDiscard: () => void;
}

function ChallengeBanner({ draft, challenge, exercises, onDiscard }: ChallengeBannerProps) {
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const nameOf = (exerciseId: string) =>
    exercises.find((exercise) => exercise.id === exerciseId)?.name ??
    draft.exercises.find((exercise) => exercise.exerciseId === exerciseId)?.name ??
    'Exercise';
  const { definition } = challenge;
  return (
    <section className="panel stack" aria-label="Challenge">
      <h2>Challenge: {challenge.name}</h2>
      <span className="muted">{challengeSummaryText(definition, nameOf)}</span>
      {definition.kind === 'volume' && definition.metric === 'kg' && (
        <p className="stack" style={{ gap: 2 }}>
          <span>{challengeVolumeText(draft, definition.target)}</span>
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
  const { state, store, saveProblem, changeDraft, updateDraft, startWorkout, discardDraft, markSynced, reload, flush } =
    useWorkoutDraft(userId);
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
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  const [focusSetId, setFocusSetId] = useState<string | null>(null);
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
  const liftExerciseIds =
    draft && !draft.finishedAt
      ? draft.exercises.flatMap((exercise) => (exercise.modality === 'lift' ? [exercise.exerciseId] : []))
      : [];
  const recentSessions = useRecentLiftSessions(userId, liftExerciseIds, onlineSignal);
  useWakeLock(keepAwake, draft !== null && !draft.finishedAt);

  useEffect(() => {
    let active = true;
    void loadExercisesCacheFirst(
      localStorage,
      userId,
      () => fetchExercises({ includeArchived: false, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
      (list) => {
        if (!active) return;
        setExercises(list.exercises);
        setListNotice(list.notice);
        setLoadProblem(list.problem);
      },
      () => navigator.onLine === false,
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
  }, [userId]);

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
  const sessionBaseline =
    [loadedBaseline, cachedBaseline].find((baseline) => baseline !== null && baseline.asOf === draftStartedAt) ?? null;
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
  const previews = useMemo(() => {
    if (draftExercises === null) return [];
    const customIds = new Set(exercises.filter((exercise) => exercise.custom).map((exercise) => exercise.id));
    return previewSession(draftExercises, (exerciseId) => !customIds.has(exerciseId), previewStrength, bodyweightKg);
  }, [draftExercises, exercises, previewStrength, bodyweightKg]);
  const records = useMemo(
    () => (draftExercises === null ? [] : previewRecords(draftExercises, previewStrength, recordBaseline)),
    [draftExercises, previewStrength, recordBaseline],
  );

  const { status: finishStatus, retryNow } = useFinishSync({
    userId,
    draft,
    store,
    flush,
    markSynced,
    onSynced: (summary) => navigate('/reveal', { state: summary }),
    onSuperseded: (sessionId) => {
      if (recallLastSummary()?.sessionId === sessionId) navigate('/reveal');
      else void reload();
    },
    onDeleted: () => void reload('deleted'),
  });

  if (state.status === 'loading') return <ScreenSkeleton />;

  const deviceNotices = (
    <>
      {saveProblem && (
        <p className="problem" role="alert">
          Couldn't save on this device
        </p>
      )}
      {store && <OtherAccountDraftNotice store={store} userId={userId} />}
    </>
  );

  const openStartedDraft = async (started: { draft: WorkoutDraft; skippedExerciseIds: string[] }) => {
    const skipped = started.skippedExerciseIds.length;
    const startedFresh = await startWorkout(() => started.draft);
    setStartingDay(false);
    setStartNotice(
      startedFresh && skipped > 0
        ? `${skipped} exercise(s) in this day are no longer available and were skipped.`
        : null,
    );
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
            void startWorkout(startDraft);
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
              await updatePrivateProfile(userId, { bodyweightKg });
              rememberSavedBodyweight(deviceStorage(), userId, bodyweightKg);
              queryClient.setQueryData<CacheFirstLoad<Profile>>(
                ['profile', userId],
                (current) => current && { ...current, loaded: { ...current.loaded, bodyweightKg } },
              );
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
      if (latest.sessionId !== draft.sessionId || latest.finishedAt) return latest;
      const checked = withCurrentLoadTypes(latest, loadTypes);
      changedNames = checked.changedNames;
      if (changedNames.length > 0) return checked.draft;
      const logged = markPlannedDone ? markPlannedSetsDone(checked.draft) : checked.draft;
      return { ...logged, finishedAt: new Date().toISOString() };
    });
    if (changedNames.length > 0) setFinishProblem(`Load type of ${changedNames.join(', ')} changed; check the weights`);
    else rest.stop();
  };

  const canFinish = canFinishWorkout(finishCounts) && !checkingFinish;
  const roomForBouts = canAddBout(
    draft.exercises.flatMap((exercise) => (exercise.modality === 'cardio' ? exercise.sets : [])),
  );
  const liftExercises = exercises.filter(isLiftExercise);
  const barbellIds = new Set(
    liftExercises
      .filter((exercise) => exercise.equipment === 'barbell' && exercise.loadType === 'external')
      .map((exercise) => exercise.id),
  );
  const compoundIds = new Set(liftExercises.filter((exercise) => exercise.compound).map((exercise) => exercise.id));
  const barbellSetup = barbellSetupFor(plateSettings, unitPref, programBar);
  const addPicked = async (exercise: Exercise) => {
    if (exercise.modality === 'cardio') {
      changeDraft(
        addSet(addCardioExercise(draft, exercise.id, exercise.name, exercise.activity), draft.exercises.length),
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
  const changeSet = (next: WorkoutDraft, setId: string) => {
    const celebrate = becomesRecord(records, draft.exercises, next.exercises, setId, previewStrength, recordBaseline);
    if (celebrate && readTrainingDeviceSettings(deviceStorage(), userId).vibrate) vibrateNewRecord();
    changeDraft(next);
  };
  const groups = supersetGroups(draft);
  const groupOfIndex = new Map(
    groups.flatMap((group) => group.exerciseIndexes.map((index) => [index, group] as const)),
  );
  const isBarbellLift = (exercise: LiftDraftExercise) =>
    exercise.loadType === 'external' && barbellIds.has(exercise.exerciseId);
  const menuActions = (exerciseIndex: number) => {
    const group = groupOfIndex.get(exerciseIndex);
    const actions: ExerciseMenuAction[] = [];
    const groupedWithNext = group !== undefined && groupOfIndex.get(exerciseIndex + 1) === group;
    if (draft.exercises[exerciseIndex + 1]?.modality === 'lift' && !groupedWithNext)
      actions.push({ label: 'Superset with next', onChoose: () => changeDraft(groupWithNext(draft, exerciseIndex)) });
    if (group !== undefined)
      actions.push({ label: 'Ungroup', onChoose: () => changeDraft(ungroup(draft, exerciseIndex)) });
    if (canSwapExercise(draft, exerciseIndex))
      actions.push({
        label: 'Swap',
        onChoose: () => setSwappingIndex(swappingIndex === exerciseIndex ? null : exerciseIndex),
      });
    actions.push({ label: 'Remove', onChoose: () => changeDraft(removeExercise(draft, exerciseIndex)) });
    return actions;
  };
  const liftIntro = (exercise: LiftDraftExercise, exerciseIndex: number) => {
    const doneHere = exercise.sets.filter((set) => set.done).length;
    const restS = rest.lengthFor(exercise.exerciseId, compoundIds.has(exercise.exerciseId));
    const details = [
      exercise.target && `${exercise.target.sets} × ${exercise.target.repsMin}–${exercise.target.repsMax}`,
      strengthText(strength?.get(exercise.exerciseId), exercise.loadType, unitPref),
      restS !== REST_OFF && `Rest ${restClock(restS)}`,
    ].filter(Boolean);
    const recent = recentSessions.byExercise.get(exercise.exerciseId);
    const lastSessionSets = recent?.[0];
    const lastTime = lastTimeText(lastSessionSets, exercise.loadType, unitPref);
    const isBarbell = isBarbellLift(exercise);
    const followsProgram = exercise.sets.some((set) => Boolean(set.prescription));
    const step = progressionStep(unitPref, isBarbell ? barbellSetup.plates : null);
    const advice = followsProgram
      ? null
      : (fatigueAdvice(recent, exercise.loadType, unitPref, step, isBarbell ? barbellSetup.barWeight : 0) ??
        nextWeightHint(lastSessionSets, exercise.loadType, exercise.target, unitPref, step));
    return (
      <>
        <header>
          <h2>{exercise.name}</h2>
          <span className="row">
            <ExerciseProgressLink exerciseId={exercise.exerciseId} exerciseName={exercise.name} />
            <ExerciseMenu exerciseName={exercise.name} actions={menuActions(exerciseIndex)} />
          </span>
        </header>
        <p className="muted">{[...details, `${doneHere}/${exercise.sets.length} sets`].join(' · ')}</p>
        {lastTime && <p className="muted tiny last-time">{lastTime}</p>}
        {advice && <p className="tiny progression-advice">{advice}</p>}
        {noteFor(exercise.exerciseId, exercise.name)}
        {swappingIndex === exerciseIndex && canSwapExercise(draft, exerciseIndex) && (
          <ExercisePicker
            exercises={liftExercises}
            placeholder="Swap for…"
            onPick={(replacement) => {
              if (!isLiftExercise(replacement)) return;
              const swapped = swapExercise(draft, exerciseIndex, replacement);
              if (swapped) changeDraft(swapped);
              setSwappingIndex(null);
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
  ) => {
    const compound = compoundIds.has(exercise.exerciseId);
    const startRestAfter = (changes: Partial<Omit<DraftSet, 'id'>>) => {
      if (startsRest(set, changes, rest.timer) && restsAfter(draft, exerciseIndex, set.id))
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
        unit={unitPref}
        effortMode={effortInputMode}
        markers={programSetMarkerTexts(programSetMarkers(set, unitPref))}
        barbell={
          isBarbellLift(exercise)
            ? {
                plates: barbellPlates(shownWeight(set.weightKg, unitPref), barbellSetup, unitPref).plates,
                text: barbellPlatesText(shownWeight(set.weightKg, unitPref), barbellSetup, unitPref),
                setup: barbellSetup,
              }
            : null
        }
        doneLabel={doneLabel}
        focusDone={focusSetId === set.id}
        onDoneFocused={() => setFocusSetId(null)}
        onChange={(changes) => {
          startRestAfter(changes);
          if (stopsRestForWarmup(set, changes, rest.timer)) rest.stop();
          changeSet(updateSet(draft, exerciseIndex, set.id, changes), set.id);
        }}
        onRemove={() => changeDraft(removeSet(draft, exerciseIndex, set.id))}
        onToggleDone={() => {
          startRestAfter({ done: !set.done });
          setFocusSetId(set.done ? null : (nextInRound(draft, exerciseIndex, set.id)?.setId ?? null));
          changeSet(toggleSetDone(draft, exerciseIndex, set.id), set.id);
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
        <div className="live-xp" aria-live="polite">
          <strong>~{formatXp(previewTotal)} XP</strong>
          <span className="muted tiny">{doneSetCount(draft)} sets done</span>
        </div>
      </header>
      {deviceNotices}
      {draft.challenge && (
        <ChallengeBanner
          draft={draft}
          challenge={draft.challenge}
          exercises={exercises}
          onDiscard={() => discardDraft(draft.sessionId)}
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
            <section className="panel stack exercise-card" key={`${exercise.exerciseId}-${exerciseIndex}`}>
              <header>
                <h2>{exercise.name}</h2>
                <span className="row">
                  <button
                    className="button link"
                    type="button"
                    onClick={() => changeDraft(removeExercise(draft, exerciseIndex))}
                  >
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
                    preview={previews[exerciseIndex][boutIndex]}
                    unit={unitPref}
                    onChange={(changes) => changeDraft(updateBout(draft, exerciseIndex, bout.id, changes))}
                    onRemove={() => changeDraft(removeSet(draft, exerciseIndex, bout.id))}
                    onToggleDone={() => changeDraft(toggleSetDone(draft, exerciseIndex, bout.id))}
                  />
                ))}
              </ol>
              <button
                className="button dashed"
                type="button"
                disabled={!roomForBouts}
                onClick={() => changeDraft(addSet(draft, exerciseIndex))}
              >
                + Add bout
              </button>
              {!roomForBouts && <p className="hint">Bouts in one workout can add up to at most 4 hours.</p>}
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
                <div className="stack superset-member" key={`${member.exerciseId}-${index}`}>
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
                );
              }}
              onAddRound={() => changeDraft(addRound(draft, group))}
            />
          );
        }
        const workingSet = firstWorkingSet(exercise);
        const warmups =
          workingSet !== undefined && !exercise.sets.some((set) => set.isWarmup)
            ? warmupPlan(
                { weight: shownWeight(workingSet.weightKg, unitPref), reps: workingSet.reps },
                isBarbellLift(exercise) ? barbellSetup : null,
              )
            : [];
        return (
          <section className="panel stack exercise-card" key={`${exercise.exerciseId}-${exerciseIndex}`}>
            {liftIntro(exercise, exerciseIndex)}
            {warmups.length > 0 && (
              <button
                className="button dashed"
                type="button"
                onClick={() =>
                  changeDraft(
                    addWarmupSets(
                      draft,
                      exerciseIndex,
                      warmups.map(({ weight, reps }) => ({ weightKg: unitToKg(weight, unitPref), reps })),
                    ),
                  )
                }
              >
                + Add warm-ups
              </button>
            )}
            <ol className="set-list">
              {exercise.sets.map((set, setIndex) => liftSetRow(exercise, exerciseIndex, set, setIndex))}
            </ol>
            <button className="button dashed" type="button" onClick={() => changeDraft(addSet(draft, exerciseIndex))}>
              + Add set
            </button>
            {canQuickFill(exercise) && (
              <QuickFill
                key={`${exercise.target?.sets ?? DEFAULT_QUICK_FILL_SETS}x${workingSet?.reps ?? DEFAULT_QUICK_FILL_REPS}`}
                defaultSets={exercise.target?.sets ?? DEFAULT_QUICK_FILL_SETS}
                defaultReps={workingSet?.reps ?? DEFAULT_QUICK_FILL_REPS}
                onFill={(sets, reps) => changeDraft(fillWorkingSets(draft, exerciseIndex, sets, reps))}
              />
            )}
          </section>
        );
      })}
      <ExercisePicker exercises={exercises} onPick={(exercise) => void addPicked(exercise)} />
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
