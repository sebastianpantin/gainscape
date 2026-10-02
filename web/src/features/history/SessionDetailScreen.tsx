import { MAX_SETS_PER_SESSION } from '@domain/types.ts';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { canAddBout, describeBout } from '../../lib/cardio-rules.ts';
import { fetchExercises } from '../../lib/catalog.ts';
import { type Exercise, isLiftExercise } from '../../lib/catalog-rules.ts';
import { formatLoad } from '../../lib/format.ts';
import { deleteSession, editSession, fetchSession, fetchSessionSets } from '../../lib/history.ts';
import { tryAgainIn } from '../../lib/rate-limit.ts';
import { type HistorySession, isUuid, type StoredSetRow } from '../../lib/history-rules.ts';
import { type CatalogItem, describeDrops } from '../../lib/item-rules.ts';
import { fetchItemCatalog } from '../../lib/items.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { updatePrivateProfile } from '../../lib/profile.ts';
import { distanceUnitFor } from '../../lib/units.ts';
import { signOutKeepingDrafts } from '../../offline/sync-workout.ts';
import { forgetLastSummary } from '../summary/last-summary.ts';
import { BodyweightPrompt } from '../workout/BodyweightPrompt.tsx';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import { formatXp } from '../workout/xp-preview.ts';
import { HistoryBoutRow, HistorySetRow } from './HistorySetRow.tsx';
import {
  addEditExercise,
  addEditSet,
  canAddSet,
  dropsAtRisk,
  editFromSession,
  editPayload,
  editSetCount,
  effortLabel,
  type EditBout,
  type EditSet,
  type FailureAction,
  failureAction,
  formatSessionDate,
  hasChanges,
  isEditable,
  rebaseEdit,
  rebaseNotice,
  removeEditSet,
  type SessionEdit,
  sessionXp,
  swapEditExercise,
  updateEditBout,
  updateEditSet,
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
  return { session, sets, exercises, original: editFromSession(session, sets, exercisesById) };
}

const LATER_LOOT_NOTE = "Later workouts' PR loot may be recalculated.";

function itemNameIn(items: readonly CatalogItem[]): (itemId: string) => string {
  return (itemId) => items.find((item) => item.id === itemId)?.name ?? 'an item';
}

function removalText(drops: readonly { itemId: string; quantity: number }[], items: readonly CatalogItem[]): string {
  const described = describeDrops(drops, itemNameIn(items));
  return described && `This may remove ${described} from your collection.`;
}

function removedText(
  drops: readonly { itemId: string; revokedQuantity: number }[] | undefined,
  items: readonly CatalogItem[],
): string {
  const described = describeDrops(
    (drops ?? []).map((drop) => ({ itemId: drop.itemId, quantity: drop.revokedQuantity })),
    itemNameIn(items),
  );
  return described && `Removed ${described} from your collection.`;
}

function sameSetValues(a: EditSet | EditBout, b: EditSet | EditBout): boolean {
  return JSON.stringify({ ...a, id: '' }) === JSON.stringify({ ...b, id: '' });
}

interface SessionDetailScreenProps {
  userId: string;
}

export function SessionDetailScreen({ userId }: SessionDetailScreenProps) {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
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
    setReadOnly(!isEditable(next.session, Date.now()));
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

  const refreshAfterSave = async (signal: AbortSignal, removed = ''): Promise<void> => {
    let fresh: Loaded | null;
    try {
      fresh = await loadSession(sessionId);
    } catch {
      if (signal.aborted) return;
      setProblem({
        kind: 'refresh_failed',
        text: "Saved, but couldn't refresh the workout.",
        retry: () => void refreshAfterSave(signal, removed),
      });
      return;
    }
    if (signal.aborted) return;
    if (!fresh) return goBackGone();
    adopt(fresh);
    setProblem(null);
    setNotice(removed ? `Changes saved. ${removed}` : 'Changes saved.');
  };

  const loadConflict = async (signal: AbortSignal): Promise<void> => {
    let fresh: Loaded | null;
    try {
      fresh = await loadSession(sessionId);
    } catch {
      if (signal.aborted) return;
      setProblem({
        kind: 'refresh_failed',
        text: "This workout was changed on another device, and the latest version couldn't be loaded.",
        retry: () => void loadConflict(signal),
      });
      return;
    }
    if (signal.aborted) return;
    if (!fresh) return goBackGone();
    setProblem({ kind: 'conflict', fresh });
  };

  const handleCommonFailure = (action: FailureAction, verb: string) => {
    switch (action.kind) {
      case 'sign_out':
        void signOutKeepingDrafts();
        return;
      case 'gone':
        goBackGone();
        return;
      case 'read_only':
        setReadOnly(true);
        setEdit(loaded.original);
        setProblem({ kind: 'message', text: 'This workout is older than 7 days, so it can no longer be changed.' });
        return;
      case 'wrong_account':
        setProblem({ kind: 'message', text: 'You are signed in as someone else in another tab. Reload the app.' });
        return;
      case 'retry':
        setProblem({ kind: 'message', text: `Couldn't reach the server (${action.reason}). Try again.` });
        return;
      case 'rate_limited':
        setProblem({ kind: 'message', text: `Too many changes. ${tryAgainIn(action.retryAfterSeconds)}` });
        return;
      case 'bug':
        setProblem({ kind: 'message', text: `Couldn't ${verb} this workout: ${action.code}` });
        return;
      default:
        setProblem({ kind: 'message', text: `Couldn't ${verb} this workout: ${action.kind}` });
    }
  };

  const save = async (toSend: SessionEdit, setIdRetriesLeft = SET_ID_RETRIES): Promise<void> => {
    const signal = currentSignal();
    setProblem(null);
    setNotice(null);
    setBusy({ kind: 'saving', retrying: null });
    const outcome = await editSession(userId, editPayload(toSend), signal, (reason) =>
      setBusy({ kind: 'saving', retrying: reason }),
    );
    if (signal.aborted) return;
    setBusy(IDLE);
    if (outcome.kind === 'ok') {
      const { revision, replayedSessionIds, revokedDrops } = outcome.data;
      forgetLastSummary([sessionId, ...replayedSessionIds]);
      setLoaded(
        (current) =>
          current && {
            ...current,
            session: { ...current.session, revision },
            original: { ...current.original, revision },
          },
      );
      setEdit({ ...toSend, revision });
      return refreshAfterSave(signal, removedText(revokedDrops, items));
    }
    const action = failureAction(outcome);
    if (action.kind === 'reid_sets' && setIdRetriesLeft > 0) {
      const reIded = withNewSetIds(toSend, action.setIds);
      setEdit(reIded);
      return save(reIded, setIdRetriesLeft - 1);
    }
    if (action.kind === 'revision_conflict') return loadConflict(signal);
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
    const outcome = await deleteSession(userId, sessionId, signal, (reason) =>
      setBusy({ kind: 'deleting', retrying: reason }),
    );
    if (signal.aborted) return;
    setBusy(IDLE);
    setConfirmingDelete(false);
    if (outcome.kind === 'ok') {
      forgetLastSummary([sessionId, ...outcome.data.replayedSessionIds]);
      const removed = removedText(outcome.data.revokedDrops, items);
      navigate(HISTORY_PATH, {
        replace: true,
        state: { notice: removed ? `Workout deleted. ${removed}` : 'Workout deleted.' },
      });
      return;
    }
    handleCommonFailure(failureAction(outcome), 'delete');
  };

  const { session } = loaded;
  const originalSets = new Map(
    loaded.original.exercises.flatMap((exercise) =>
      exercise.sets.map((set: EditSet | EditBout) => [set.id, { exerciseId: exercise.exerciseId, set }] as const),
    ),
  );
  const storedXp = new Map(loaded.sets.map((row) => [row.id, row.xpAwarded]));
  const xpShownFor = (exerciseId: string, set: EditSet | EditBout) => {
    const original = originalSets.get(set.id);
    const unchanged = original?.exerciseId === exerciseId && sameSetValues(original.set, set);
    return unchanged ? { label: formatXp(storedXp.get(set.id) ?? 0), note: 'XP' } : { label: '~?', note: 'after save' };
  };
  const unknownIds = problem?.kind === 'unknown_exercise' ? problem.exerciseIds : [];
  const pickable = loaded.exercises.filter((exercise) => !exercise.archived);
  const working = busy.kind !== 'idle';
  const changed = hasChanges(edit, loaded.original);
  const setCount = editSetCount(edit);
  const askingBodyweight = problem?.kind === 'bodyweight';
  const canSave = changed && !working && !askingBodyweight && setCount > 0 && setCount <= MAX_SETS_PER_SESSION;
  const roomForSets = canAddSet(edit);
  const roomForBouts = canAddBout(
    edit.exercises.flatMap((exercise) => (exercise.modality === 'cardio' ? exercise.sets : [])),
  );
  const activeDrops = session.summary.drops ?? [];
  const editWarning = removalText(dropsAtRisk(edit, loaded.original, activeDrops), items);
  const deleteWarning = removalText(activeDrops, items);

  const header = (
    <>
      <Link className="back-link" to={HISTORY_PATH}>
        ← History
      </Link>
      <header className="workout-header">
        <div className="stack" style={{ gap: 4 }}>
          <span className="muted">{formatSessionDate(session.localDate)}</span>
          <h1 className="title">Workout</h1>
        </div>
        <div className="live-xp">
          <strong data-testid="session-xp">
            {session.historyOnly ? 'No XP' : `+${formatXp(sessionXp(session.summary))} XP`}
          </strong>
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
              setReadOnly(!isEditable(fresh.session, Date.now()));
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
            await updatePrivateProfile(userId, { bodyweightKg });
            await save(problem.pending);
          }}
        />
      )}
    </>
  );

  if (readOnly) {
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
          <section className="panel stack exercise-card" key={`${exercise.exerciseId}-${exerciseIndex}`}>
            <header>
              <h2>{exercise.name}</h2>
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
          <section className="panel stack exercise-card" key={`${exercise.exerciseId}-${exerciseIndex}`}>
            <header>
              <h2>{exercise.name}</h2>
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
                        onChange={(changes) => setEdit(updateEditBout(edit, exerciseIndex, bout.id, changes))}
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
                        onChange={(changes) => setEdit(updateEditSet(edit, exerciseIndex, set.id, changes))}
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
      {setCount === 0 && <p className="hint">A workout needs at least one set. Delete it instead to remove it.</p>}
      {changed && (
        <div
          className="notice"
          role="status"
          data-testid="edit-loot-warning"
          style={{ flexDirection: 'column', alignItems: 'flex-start' }}
        >
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
            {deleteWarning && <p data-testid="delete-loot-warning">{deleteWarning}</p>}
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
