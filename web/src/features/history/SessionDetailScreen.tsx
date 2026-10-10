import { isSessionEditable } from '@domain/edit-window.ts';
import { MAX_SETS_PER_SESSION } from '@domain/types.ts';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { canAddBout, describeBout } from '../../lib/cardio-rules.ts';
import { fetchExercises } from '../../lib/catalog.ts';
import { type Exercise, isLiftExercise } from '../../lib/catalog-rules.ts';
import { effortLabel } from '../../lib/effort-labels.ts';
import { canAddSet, setCount, updateBout, updateSet } from '../../lib/exercise-edit-rules.ts';
import { exerciseKeys } from '../../lib/exercise-key-rules.ts';
import {
  formatLoad,
  formatSessionDate,
  formatXp,
  sessionChallengeBonus,
  sessionGearBonus,
  sessionXp,
} from '../../lib/format.ts';
import { sessionTimingParts } from '../../lib/session-timing-rules.ts';
import { deleteSession, editSession, fetchSession, fetchSessionSets } from '../../lib/history.ts';
import { type HistorySession, isUuid, type StoredSetRow } from '../../lib/history-rules.ts';
import type { CatalogItem } from '../../lib/item-rules.ts';
import { fetchItemCatalog } from '../../lib/items.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import { distanceUnitFor } from '../../lib/units.ts';
import { signOutKeepingDrafts } from '../../offline/sync-workout.ts';
import { forgetDeletedProgramSession } from '../../offline/program-cache.ts';
import { ExerciseProgressLink } from '../collection/ExerciseProgressLink.tsx';
import { saveBodyweight } from '../profile/save-bodyweight.ts';
import { forgetLastSummary, recallLastSummary } from '../summary/last-summary.ts';
import { BodyweightPrompt } from '../workout/BodyweightPrompt.tsx';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import { HistoryBoutRow, HistorySetRow } from './HistorySetRow.tsx';
import {
  addEditExercise,
  addEditSet,
  dropsAtRisk,
  editFromSession,
  editPayload,
  type EditBout,
  type EditSet,
  type FailureAction,
  failureAction,
  failureText,
  hasChanges,
  rebaseEdit,
  rebaseNotice,
  removalText,
  removedText,
  removeEditSet,
  sameSetValues,
  savedEdit,
  type SessionEdit,
  summariesToForget,
  swapEditExercise,
  withNewSetIds,
  withoutBodyweightLoads,
} from './session-edit.ts';

const HISTORY_PATH = '/collection/history';
const MAX_NOTES_LENGTH = 2000;
const SET_ID_RETRIES = 2;

interface Loaded {
  session: HistorySession;
  sets: StoredSetRow[];
  exercises: Exercise[];
  original: SessionEdit;
  xpBasis: SessionEdit;
}

type Problem =
  | { kind: 'conflict'; fresh: Loaded }
  | { kind: 'bodyweight'; pending: SessionEdit }
  | { kind: 'unknown_exercise'; exerciseIds: string[] }
  | { kind: 'refresh_failed'; text: string; retry: () => void }
  | { kind: 'message'; text: string };

type Busy = { kind: 'idle' } | { kind: 'saving' | 'deleting'; retrying: string | null };

const IDLE: Busy = { kind: 'idle' };

async function loadSession(sessionId: string): Promise<Loaded | null> {
  const [session, sets, exercises] = await Promise.all([
    fetchSession(sessionId),
    fetchSessionSets(sessionId),
    fetchExercises({ includeArchived: true }),
  ]);
  if (!session) return null;
  const exercisesById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const original = editFromSession(session, sets, exercisesById);
  return { session, sets, exercises, original, xpBasis: original };
}

const LATER_LOOT_NOTE = "Later workouts' PR loot may be recalculated.";

interface SessionDetailScreenProps {
  userId: string;
}

export function SessionDetailScreen({ userId }: SessionDetailScreenProps) {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { unitPref, effortInputMode } = usePreferences();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [edit, setEdit] = useState<SessionEdit | null>(null);
  const [readOnly, setReadOnly] = useState(true);
  const [loadProblem, setLoadProblem] = useState<string | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [busy, setBusy] = useState<Busy>(IDLE);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [items, setItems] = useState<CatalogItem[]>([]);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchItemCatalog().then(
      (catalog) => setItems(catalog.items),
      () => setItems([]),
    );
  }, []);

  const adopt = useCallback((next: Loaded) => {
    setLoaded(next);
    setEdit(next.original);
    setReadOnly(!isSessionEditable(next.session, Date.now()));
  }, []);

  const goBackGone = useCallback(
    () => navigate(HISTORY_PATH, { replace: true, state: { notice: 'That workout is no longer there.' } }),
    [navigate],
  );

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    if (!isUuid(sessionId)) {
      goBackGone();
      return () => controller.abort();
    }
    loadSession(sessionId).then(
      (next) => {
        if (controller.signal.aborted) return;
        if (next) adopt(next);
        else goBackGone();
      },
      (error: Error) => !controller.signal.aborted && setLoadProblem(error.message),
    );
    return () => controller.abort();
  }, [sessionId, adopt, goBackGone]);

  if (loadProblem)
    return (
      <main className="screen stack">
        <Link className="back-link" to={HISTORY_PATH}>
          ← History
        </Link>
        <p className="problem" role="alert">
          {loadProblem}
        </p>
      </main>
    );
  if (!loaded || !edit)
    return (
      <main className="screen">
        <p>Loading…</p>
      </main>
    );

  const currentSignal = () => controllerRef.current!.signal;

  const reloadSession = async (
    signal: AbortSignal,
    failedText: string,
    onFresh: (fresh: Loaded) => void,
  ): Promise<void> => {
    let fresh: Loaded | null;
    try {
      fresh = await loadSession(sessionId);
    } catch {
      if (signal.aborted) return;
      setProblem({
        kind: 'refresh_failed',
        text: failedText,
        retry: () => void reloadSession(signal, failedText, onFresh),
      });
      return;
    }
    if (signal.aborted) return;
    if (!fresh) return goBackGone();
    onFresh(fresh);
  };

  const handleCommonFailure = (action: FailureAction, verb: 'save' | 'delete') => {
    if (action.kind === 'sign_out') return void signOutKeepingDrafts();
    if (action.kind === 'gone') return goBackGone();
    if (action.kind === 'read_only') {
      setReadOnly(true);
      setEdit(loaded.original);
    }
    setProblem({ kind: 'message', text: failureText(action, verb) });
  };

  const save = async (toSend: SessionEdit, setIdRetriesLeft = SET_ID_RETRIES): Promise<void> => {
    const signal = currentSignal();
    setProblem(null);
    setNotice(null);
    setBusy({ kind: 'saving', retrying: null });
    let retried = false;
    const outcome = await editSession(userId, editPayload(toSend), signal, (reason) => {
      retried = true;
      setBusy({ kind: 'saving', retrying: reason });
    });
    if (signal.aborted) return;
    setBusy(IDLE);
    if (outcome.kind === 'ok') {
      const { revision, replayedSessionIds, revokedDrops } = outcome.data;
      forgetLastSummary(
        summariesToForget(sessionId, replayedSessionIds, retried, recallLastSummary(userId)?.sessionId),
      );
      const saved = savedEdit(toSend, revision);
      setLoaded((current) => current && { ...current, session: { ...current.session, revision }, original: saved });
      setEdit(saved);
      const removed = removedText(revokedDrops, items);
      setNotice(removed ? `Changes saved. ${removed}` : 'Changes saved.');
      return reloadSession(signal, "Saved, but couldn't refresh the workout.", (fresh) => {
        adopt(fresh);
        setProblem(null);
      });
    }
    const action = failureAction(outcome);
    if (action.kind === 'reid_sets' && setIdRetriesLeft > 0) {
      const reIded = withNewSetIds(toSend, action.setIds);
      setEdit(reIded);
      return save(reIded, setIdRetriesLeft - 1);
    }
    if (action.kind === 'revision_conflict') {
      return reloadSession(
        signal,
        "This workout was changed on another device, and the latest version couldn't be loaded.",
        (fresh) => setProblem({ kind: 'conflict', fresh }),
      );
    }
    if (action.kind === 'ask_bodyweight') {
      setProblem({ kind: 'bodyweight', pending: toSend });
      return;
    }
    if (action.kind === 'unknown_exercise') {
      setProblem({ kind: 'unknown_exercise', exerciseIds: action.exerciseIds });
      return;
    }
    if (action.kind === 'fix_bodyweight_load') {
      const exercises = await fetchExercises({ includeArchived: true }).catch(() => loaded.exercises);
      if (signal.aborted) return;
      const loadTypes = new Map(exercises.filter(isLiftExercise).map((exercise) => [exercise.id, exercise.loadType]));
      setEdit(withoutBodyweightLoads(toSend, loadTypes));
      setProblem({
        kind: 'message',
        text: "Bodyweight-only exercises can't carry added weight, so it was reset to 0. Check the sets and save again.",
      });
      return;
    }
    handleCommonFailure(action, 'save');
  };

  const remove = async () => {
    const signal = currentSignal();
    setProblem(null);
    setNotice(null);
    setBusy({ kind: 'deleting', retrying: null });
    const outcome = await deleteSession(userId, { sessionId, ifRevision: loaded.session.revision }, signal, (reason) =>
      setBusy({ kind: 'deleting', retrying: reason }),
    );
    if (signal.aborted) return;
    setBusy(IDLE);
    setConfirmingDelete(false);
    if (outcome.kind === 'ok') {
      forgetLastSummary([sessionId, ...outcome.data.replayedSessionIds]);
      forgetDeletedProgramSession(localStorage, userId, sessionId);
      const removed = removedText(outcome.data.revokedDrops, items);
      navigate(HISTORY_PATH, {
        replace: true,
        state: { notice: removed ? `Workout deleted. ${removed}` : 'Workout deleted.' },
      });
      return;
    }
    const action = failureAction(outcome);
    if (action.kind === 'revision_conflict') {
      return reloadSession(
        signal,
        "This workout was changed on another device, and the latest version couldn't be loaded.",
        (fresh) => {
          adopt(fresh);
          setProblem({ kind: 'message', text: failureText(action, 'delete') });
        },
      );
    }
    handleCommonFailure(action, 'delete');
  };

  const { session } = loaded;
  const scoredSets = new Map(
    loaded.xpBasis.exercises.flatMap((exercise) =>
      exercise.sets.map((set: EditSet | EditBout) => [set.id, { exerciseId: exercise.exerciseId, set }] as const),
    ),
  );
  const storedXp = new Map(loaded.sets.map((row) => [row.id, row.xpAwarded]));
  const xpShownFor = (exerciseId: string, set: EditSet | EditBout) => {
    const scored = scoredSets.get(set.id);
    const unchanged = scored?.exerciseId === exerciseId && sameSetValues(scored.set, set);
    return unchanged ? { label: formatXp(storedXp.get(set.id) ?? 0), note: 'XP' } : { label: '~?', note: 'after save' };
  };
  const unknownIds = problem?.kind === 'unknown_exercise' ? problem.exerciseIds : [];
  const pickable = loaded.exercises.filter((exercise) => !exercise.archived);
  const working = busy.kind !== 'idle';
  const changed = hasChanges(edit, loaded.original);
  const editedSetCount = setCount(edit);
  const askingBodyweight = problem?.kind === 'bodyweight';
  const canSave =
    changed && !working && !askingBodyweight && editedSetCount > 0 && editedSetCount <= MAX_SETS_PER_SESSION;
  const roomForSets = canAddSet(edit);
  const roomForBouts = canAddBout(
    edit.exercises.flatMap((exercise) => (exercise.modality === 'cardio' ? exercise.sets : [])),
  );
  const activeDrops = session.summary.drops ?? [];
  const editWarning = removalText(dropsAtRisk(edit, loaded.original, activeDrops), items);
  const deleteWarning = removalText(activeDrops, items);

  const timingText = sessionTimingParts(session).join(' · ');
  const gearBonus = session.historyOnly ? 0 : sessionGearBonus(session.summary);
  const challengeBonus = session.historyOnly ? 0 : sessionChallengeBonus(session.summary);
  const header = (
    <>
      <Link className="back-link" to={HISTORY_PATH}>
        ← History
      </Link>
      <header className="workout-header">
        <div className="stack" style={{ gap: 4 }}>
          <span className="muted">{formatSessionDate(session.localDate)}</span>
          <h1 className="title">Workout</h1>
          {timingText && <span className="muted tiny">{timingText}</span>}
        </div>
        <div className="live-xp">
          <output aria-label="Workout XP">
            {session.historyOnly ? 'No XP' : `+${formatXp(sessionXp(session.summary))} XP`}
          </output>
          {challengeBonus > 0 && (
            <span className="muted tiny">includes Challenge bonus +{formatXp(challengeBonus)} XP</span>
          )}
          {gearBonus > 0 && <span className="muted tiny">includes Gear bonus +{formatXp(gearBonus)} XP</span>}
          <span className="muted tiny">{session.setCount} sets</span>
        </div>
      </header>
      {session.historyOnly && (
        <p className="notice" role="status">
          Saved to history, no XP
        </p>
      )}
    </>
  );

  const problemPanel = problem && (
    <>
      {problem.kind === 'message' && (
        <p className="problem" role="alert">
          {problem.text}
        </p>
      )}
      {problem.kind === 'refresh_failed' && (
        <div className="panel stack" role="alert">
          <p className="problem">{problem.text}</p>
          <button
            className="button"
            type="button"
            onClick={() => {
              setProblem(null);
              problem.retry();
            }}
          >
            Try again
          </button>
        </div>
      )}
      {problem.kind === 'conflict' && (
        <div className="panel stack" role="alert">
          <p>This workout was changed on another device.</p>
          <button
            className="button primary"
            type="button"
            onClick={() => {
              const { fresh } = problem;
              setLoaded(fresh);
              const rebased = rebaseEdit(edit, loaded.original, fresh.original);
              setEdit(rebased.edit);
              setReadOnly(!isSessionEditable(fresh.session, Date.now()));
              setProblem(null);
              setNotice(rebaseNotice(rebased, fresh.original));
            }}
          >
            Apply my changes to the latest version
          </button>
          <button
            className="button"
            type="button"
            onClick={() => {
              adopt(problem.fresh);
              setProblem(null);
            }}
          >
            Discard my changes
          </button>
        </div>
      )}
      {problem.kind === 'bodyweight' && (
        <BodyweightPrompt
          unit={unitPref}
          submitLabel="Save bodyweight and changes"
          onSave={async (bodyweightKg) => {
            await saveBodyweight({ userId, bodyweightKg, storage: deviceStorage(), queryClient });
            await save(problem.pending);
          }}
        />
      )}
    </>
  );

  if (readOnly) {
    const storedKeys = exerciseKeys(loaded.original.exercises);
    return (
      <main className="screen stack">
        {header}
        {problemPanel}
        {!session.historyOnly && (
          <p className="notice" role="status">
            Only workouts from the last 7 days can be changed.
          </p>
        )}
        {loaded.original.exercises.map((exercise, exerciseIndex) => (
          <section className="panel stack exercise-card" key={storedKeys[exerciseIndex]}>
            <header>
              <h2>{exercise.name}</h2>
              {exercise.modality === 'lift' && (
                <ExerciseProgressLink exerciseId={exercise.exerciseId} exerciseName={exercise.name} />
              )}
            </header>
            <ol className="stored-set-list">
              {exercise.modality === 'cardio'
                ? exercise.sets.map((bout, boutIndex) => (
                    <li className="row spread" key={bout.id}>
                      <span>
                        {boutIndex + 1}. {describeBout(bout, distanceUnitFor(unitPref, exercise.paceUnit))}
                        {effortLabel(bout.effort) && ` · ${effortLabel(bout.effort)}`}
                      </span>
                      <span className="xp-text">{formatXp(storedXp.get(bout.id) ?? 0)} XP</span>
                    </li>
                  ))
                : exercise.sets.map((set, setIndex) => (
                    <li className="row spread" key={set.id}>
                      <span>
                        {setIndex + 1}.{' '}
                        {exercise.loadType === 'bodyweight'
                          ? 'bodyweight'
                          : formatLoad(set.weightKg, exercise.loadType, unitPref)}{' '}
                        × {set.reps}
                        {set.isWarmup && ' · warm-up'}
                        {effortLabel(set.effort) && ` · ${effortLabel(set.effort)}`}
                      </span>
                      <span className="xp-text">{formatXp(storedXp.get(set.id) ?? 0)} XP</span>
                    </li>
                  ))}
            </ol>
          </section>
        ))}
        {session.notes && <p className="panel">{session.notes}</p>}
      </main>
    );
  }

  const editKeys = exerciseKeys(edit.exercises);
  return (
    <main className="screen stack">
      {header}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {busy.kind !== 'idle' && busy.retrying && (
        <p className="notice" role="status">
          Couldn't reach the server ({busy.retrying}). Retrying…
        </p>
      )}
      {problemPanel}
      <fieldset className="stack" disabled={working || askingBodyweight} style={{ border: 'none', padding: 0 }}>
        {edit.exercises.map((exercise, exerciseIndex) => (
          <section className="panel stack exercise-card" key={editKeys[exerciseIndex]}>
            <header>
              <h2>{exercise.name}</h2>
              {exercise.modality === 'lift' && (
                <ExerciseProgressLink exerciseId={exercise.exerciseId} exerciseName={exercise.name} />
              )}
            </header>
            {unknownIds.includes(exercise.exerciseId) && (
              <>
                <p className="problem" role="alert">
                  This exercise isn't available. Pick another one or remove its sets.
                </p>
                <ExercisePicker
                  exercises={pickable.filter((candidate) => candidate.modality === exercise.modality)}
                  placeholder="Replace with…"
                  onPick={(replacement) => {
                    setEdit(swapEditExercise(edit, exerciseIndex, replacement));
                    const remaining = unknownIds.filter((id) => id !== exercise.exerciseId);
                    setProblem(remaining.length > 0 ? { kind: 'unknown_exercise', exerciseIds: remaining } : null);
                  }}
                />
              </>
            )}
            <ol className="set-list">
              {exercise.modality === 'cardio'
                ? exercise.sets.map((bout, boutIndex) => {
                    const xp = xpShownFor(exercise.exerciseId, bout);
                    return (
                      <HistoryBoutRow
                        key={bout.id}
                        boutNumber={boutIndex + 1}
                        bout={bout}
                        paceUnit={exercise.paceUnit}
                        xpLabel={xp.label}
                        xpNote={xp.note}
                        unit={unitPref}
                        onChange={(changes) => setEdit(updateBout(edit, exerciseIndex, bout.id, changes))}
                        onRemove={() => setEdit(removeEditSet(edit, exerciseIndex, bout.id))}
                      />
                    );
                  })
                : exercise.sets.map((set, setIndex) => {
                    const xp = xpShownFor(exercise.exerciseId, set);
                    return (
                      <HistorySetRow
                        key={set.id}
                        setNumber={setIndex + 1}
                        loadType={exercise.loadType}
                        set={set}
                        xpLabel={xp.label}
                        xpNote={xp.note}
                        unit={unitPref}
                        effortMode={effortInputMode}
                        onChange={(changes) => setEdit(updateSet(edit, exerciseIndex, set.id, changes))}
                        onRemove={() => setEdit(removeEditSet(edit, exerciseIndex, set.id))}
                      />
                    );
                  })}
            </ol>
            <button
              className="button dashed"
              type="button"
              disabled={!roomForSets || (exercise.modality === 'cardio' && !roomForBouts)}
              onClick={() => setEdit(addEditSet(edit, exerciseIndex))}
            >
              {exercise.modality === 'cardio' ? '+ Add bout' : '+ Add set'}
            </button>
          </section>
        ))}
        {roomForSets ? (
          <ExercisePicker exercises={pickable} onPick={(exercise) => setEdit(addEditExercise(edit, exercise))} />
        ) : (
          <p className="hint">A workout can hold at most {MAX_SETS_PER_SESSION} sets.</p>
        )}
        <label className="field notes-field">
          Notes
          <textarea
            maxLength={MAX_NOTES_LENGTH}
            value={edit.notes}
            onChange={(event) => setEdit({ ...edit, notes: event.target.value })}
          />
        </label>
      </fieldset>
      {editedSetCount === 0 && (
        <p className="hint">A workout needs at least one set. Delete it instead to remove it.</p>
      )}
      {changed && (
        <div className="notice" role="status" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
          {editWarning && <p>{editWarning}</p>}
          <p>{LATER_LOOT_NOTE}</p>
        </div>
      )}
      <button className="button primary big" type="button" disabled={!canSave} onClick={() => void save(edit)}>
        {busy.kind === 'saving' ? 'Saving…' : 'Save changes'}
      </button>
      {changed && (
        <button
          className="button"
          type="button"
          disabled={working || askingBodyweight}
          onClick={() => {
            setEdit(loaded.original);
            setProblem(null);
            setNotice(null);
          }}
        >
          Undo my changes
        </button>
      )}
      <section className="danger-zone">
        {confirmingDelete ? (
          <>
            <p>Delete this workout? This can't be undone. XP and records are recalculated without it.</p>
            {deleteWarning && <p>{deleteWarning}</p>}
            <p>{LATER_LOOT_NOTE}</p>
            <button className="button danger" type="button" disabled={working} onClick={() => void remove()}>
              {busy.kind === 'deleting' ? 'Deleting…' : 'Delete for good'}
            </button>
            <button className="button" type="button" disabled={working} onClick={() => setConfirmingDelete(false)}>
              Keep workout
            </button>
          </>
        ) : (
          <button
            className="button danger-outline"
            type="button"
            disabled={working}
            onClick={() => setConfirmingDelete(true)}
          >
            Delete workout
          </button>
        )}
      </section>
    </main>
  );
}
