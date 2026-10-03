import { useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_BALANCE, type Position, type StrengthState } from '@domain/index.ts';
import { Link, useNavigate } from 'react-router-dom';
import { canAddBout } from '../../lib/cardio-rules.ts';
import { fetchExercises } from '../../lib/catalog.ts';
import { type Exercise, isLiftExercise, type LoadType } from '../../lib/catalog-rules.ts';
import { loadExercisesCacheFirst } from '../../lib/catalog-cache.ts';
import { type ExerciseStrengthView, fetchExerciseStrength, fetchStrengthState } from '../../lib/collection-data.ts';
import { strengthText } from '../../lib/collection-rules.ts';
import { fetchProfile, updatePrivateProfile } from '../../lib/profile.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { useStanding } from '../../lib/standing.ts';
import { RATE_LIMITED_CODE } from '../../lib/rate-limit.ts';
import { startsRest } from '../../lib/rest-timer-rules.ts';
import { REQUEST_TIMEOUT_MS } from '../../lib/auth-restore.ts';
import { formatXp } from '../../lib/format.ts';
import {
  addCardioExercise,
  addExercise,
  addSet,
  canSwapExercise,
  doneSetCount,
  notDoneSetCount,
  removeExercise,
  removeSet,
  startDraft,
  startDraftFromDay,
  startDraftFromPrescription,
  type PrescribedDayStart,
  swapExercise,
  toggleSetDone,
  updateBout,
  updateSet,
  withCurrentLoadTypes,
  type WorkoutDraft,
} from '../../offline/draft-format.ts';
import { fetchLastLoggedSets, type Program, type ProgramDay } from '../../lib/programs.ts';
import { adjustEnrollment, refreshProgramFacts } from '../../lib/program-enrollment.ts';
import { skipDayEvent } from '../../lib/program-skip-rules.ts';
import { draftBar, programSetMarkers, programSetMarkerTexts } from '../../lib/program-set-rules.ts';
import { readProgramCache } from '../../offline/program-cache.ts';
import { useWorkoutDraft } from '../../offline/use-workout-draft.ts';
import { InstallCard } from '../../pwa/InstallCard.tsx';
import { recallLastSummary } from '../summary/last-summary.ts';
import { BodyweightPrompt } from './BodyweightPrompt.tsx';
import { CardioSetRow } from './CardioSetRow.tsx';
import { ExercisePicker } from './ExercisePicker.tsx';
import { OtherAccountDraftNotice } from './OtherAccountDraftNotice.tsx';
import { useActiveProgram } from '../programs/use-active-program.ts';
import { ProgramDayStarts } from './ProgramDayStarts.tsx';
import { ProgramSummary } from './ProgramSummary.tsx';
import { ProgramToday } from './ProgramToday.tsx';
import { RestTimerBar } from './RestTimerBar.tsx';
import { SetRow } from './SetRow.tsx';
import { useFinishSync } from './use-finish-sync.ts';
import { useRestTimer } from './use-rest-timer.ts';
import { rejectionText, syncProblemText } from './workout-rules.ts';
import { donePreviewTotal, previewSession } from './xp-preview.ts';

interface WorkoutScreenProps {
  userId: string;
}

const LOAD_TYPE_CHECK_TIMEOUT_MS = 5000;

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

export function WorkoutScreen({ userId }: WorkoutScreenProps) {
  const navigate = useNavigate();
  const { state, store, saveProblem, changeDraft, updateDraft, startWorkout, discardDraft, markSynced, reload, flush } =
    useWorkoutDraft(userId);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [listNotice, setListNotice] = useState<string | null>(null);
  const [finishProblem, setFinishProblem] = useState<string | null>(null);
  const [checkingFinish, setCheckingFinish] = useState(false);
  const [startingDay, setStartingDay] = useState(false);
  const [startNotice, setStartNotice] = useState<string | null>(null);
  const [swappingIndex, setSwappingIndex] = useState<number | null>(null);
  const [strength, setStrength] = useState<Map<string, ExerciseStrengthView> | null>(null);
  const [loadedStrength, setLoadedStrength] = useState<{ asOf: string; state: StrengthState } | null>(null);
  const [bodyweightKg, setBodyweightKg] = useState<number | null>(null);
  const [onlineSignal, setOnlineSignal] = useState(0);
  const standing = useStanding(userId);
  const { cache: programCache, program: activeProgram, showCache: showProgramCache } = useActiveProgram(userId);
  const rest = useRestTimer(userId);
  const finishButton = useRef<HTMLButtonElement>(null);
  const finishBar = useRef<HTMLDivElement>(null);
  const { unitPref, effortInputMode } = usePreferences();
  const draft = state.status === 'ready' ? state.draft : null;

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
    fetchExerciseStrength(userId).then(
      (loaded) => active && setStrength(loaded),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    const signalOnline = () => setOnlineSignal((count) => count + 1);
    window.addEventListener('online', signalOnline);
    return () => window.removeEventListener('online', signalOnline);
  }, []);

  const draftStartedAt = draft?.startedAt ?? null;
  useEffect(() => {
    if (draftStartedAt === null) return;
    let active = true;
    fetchStrengthState(draftStartedAt, DEFAULT_BALANCE.e1rmWindowDays).then(
      (state) => active && setLoadedStrength({ asOf: draftStartedAt, state }),
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [userId, draftStartedAt, onlineSignal]);
  const previewStrength =
    loadedStrength !== null && loadedStrength.asOf === draftStartedAt ? loadedStrength.state : null;

  useEffect(() => {
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

  if (state.status === 'loading') {
    return (
      <main className="screen">
        <p>Loading…</p>
      </main>
    );
  }

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
    const skipped = started.skippedExerciseIds.length;
    const startedFresh = await startWorkout(() => started.draft);
    setStartingDay(false);
    setStartNotice(
      startedFresh && skipped > 0
        ? `${skipped} exercise(s) in this day are no longer available and were skipped.`
        : null,
    );
  };

  const startFromPrescription = async (day: PrescribedDayStart) => {
    setStartingDay(true);
    const started = startDraftFromPrescription(
      day,
      new Map(exercises.map((exercise) => [exercise.id, exercise])),
      new Date(),
    );
    const skipped = started.skippedExerciseIds.length;
    const startedFresh = await startWorkout(() => started.draft);
    setStartingDay(false);
    setStartNotice(
      startedFresh && skipped > 0
        ? `${skipped} exercise(s) in this day are no longer available and were skipped.`
        : null,
    );
  };

  const skipProgramDay = async (position: Position) => {
    const enrollment = programCache.enrollment;
    if (!enrollment) return;
    await adjustEnrollment(enrollment.id, skipDayEvent(position));
    showProgramCache(await refreshProgramFacts(userId, enrollment).catch(() => readProgramCache(localStorage, userId)));
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
        {finishStatus.kind === 'rejected' && finishStatus.reason === 'bodyweight_required' && (
          <BodyweightPrompt
            unit={unitPref}
            onSave={async (bodyweightKg) => {
              await updatePrivateProfile(userId, { bodyweightKg });
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

  const finish = async () => {
    const skippedSets = notDoneSetCount(draft);
    if (skippedSets > 0 && !window.confirm(`${skippedSets} planned sets not done will be skipped`)) return;
    setCheckingFinish(true);
    setFinishProblem(null);
    const loadTypes = await currentLoadTypes(draft, exercises);
    setCheckingFinish(false);
    let changedNames: string[] = [];
    updateDraft((latest) => {
      if (latest.sessionId !== draft.sessionId || latest.finishedAt) return latest;
      const checked = withCurrentLoadTypes(latest, loadTypes);
      changedNames = checked.changedNames;
      return changedNames.length > 0 ? checked.draft : { ...checked.draft, finishedAt: new Date().toISOString() };
    });
    if (changedNames.length > 0) setFinishProblem(`Load type of ${changedNames.join(', ')} changed; check the weights`);
    else rest.stop();
  };

  const canFinish = doneSetCount(draft) > 0 && !checkingFinish;
  const roomForBouts = canAddBout(
    draft.exercises.flatMap((exercise) => (exercise.modality === 'cardio' ? exercise.sets : [])),
  );
  const liftExercises = exercises.filter(isLiftExercise);
  const addPicked = (exercise: Exercise) => {
    const added =
      exercise.modality === 'cardio'
        ? addCardioExercise(draft, exercise.id, exercise.name, exercise.activity)
        : addExercise(draft, exercise.id, exercise.name, exercise.loadType);
    changeDraft(addSet(added, draft.exercises.length));
  };
  const previewTotal = donePreviewTotal(previews, draft.exercises);

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
      {draft.exercises.map((exercise, exerciseIndex) => {
        const doneHere = exercise.sets.filter((set) => set.done).length;
        const removeButton = (
          <button
            className="button link"
            type="button"
            onClick={() => changeDraft(removeExercise(draft, exerciseIndex))}
          >
            Remove
          </button>
        );
        if (exercise.modality === 'cardio') {
          return (
            <section className="panel stack exercise-card" key={`${exercise.exerciseId}-${exerciseIndex}`}>
              <header>
                <h2>{exercise.name}</h2>
                <span className="row">{removeButton}</span>
              </header>
              <p className="muted">{`${doneHere}/${exercise.sets.length} bouts`}</p>
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
        const details = [
          exercise.target && `${exercise.target.sets} × ${exercise.target.repsMin}–${exercise.target.repsMax}`,
          strengthText(strength?.get(exercise.exerciseId), exercise.loadType, unitPref),
        ].filter(Boolean);
        return (
          <section className="panel stack exercise-card" key={`${exercise.exerciseId}-${exerciseIndex}`}>
            <header>
              <h2>{exercise.name}</h2>
              <span className="row">
                {canSwapExercise(draft, exerciseIndex) && (
                  <button
                    className="button link"
                    type="button"
                    onClick={() => setSwappingIndex(swappingIndex === exerciseIndex ? null : exerciseIndex)}
                  >
                    Swap
                  </button>
                )}
                {removeButton}
              </span>
            </header>
            <p className="muted">{[...details, `${doneHere}/${exercise.sets.length} sets`].join(' · ')}</p>
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
            <ol className="set-list">
              {exercise.sets.map((set, setIndex) => (
                <SetRow
                  key={set.id}
                  setNumber={setIndex + 1}
                  loadType={exercise.loadType}
                  set={set}
                  preview={previews[exerciseIndex][setIndex]}
                  unit={unitPref}
                  effortMode={effortInputMode}
                  markers={programSetMarkerTexts(programSetMarkers(set, unitPref, programBar))}
                  onChange={(changes) => {
                    if (startsRest(set, changes, rest.timer)) rest.start(set.id);
                    changeDraft(updateSet(draft, exerciseIndex, set.id, changes));
                  }}
                  onRemove={() => changeDraft(removeSet(draft, exerciseIndex, set.id))}
                  onToggleDone={() => {
                    if (startsRest(set, { done: !set.done }, rest.timer)) rest.start(set.id);
                    changeDraft(toggleSetDone(draft, exerciseIndex, set.id));
                  }}
                />
              ))}
            </ol>
            <button className="button dashed" type="button" onClick={() => changeDraft(addSet(draft, exerciseIndex))}>
              + Add set
            </button>
          </section>
        );
      })}
      <ExercisePicker exercises={exercises} onPick={addPicked} />
      <Link className="button link" to="/exercises?new=1">
        Create custom exercise
      </Link>
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
        <span className="muted tiny">~ is a preview. XP is confirmed when the workout syncs.</span>
      </div>
    </main>
  );
}
