import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchExercises } from '../../lib/catalog.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import { useIsOffline, useOnlineSignal } from '../../lib/use-online.ts';
import { savedExerciseList } from '../../offline/collection-cache.ts';
import { isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import { type Exercise, exerciseLabels, isLiftExercise } from '../../lib/catalog-rules.ts';
import { cachedPrograms, loadProgramsCacheFirst, type ProgramDoc, saveProgram } from '../../lib/programs.ts';
import { type CarriedFollow, followStatus, workingWeights } from '../../lib/program-follow-rules.ts';
import { PROGRAM_OFFLINE_TEXT, programErrorText } from '../../lib/program-error-rules.ts';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { NumberTextField } from '../../components/NumberTextField.tsx';
import { SegmentedChoice } from '../../components/SegmentedChoice.tsx';
import { usePreferences } from '../../lib/preferences.ts';
import { publishForEnroll } from '../../lib/queries.ts';
import type { PlannedExercise, ProgressionKind } from '../../offline/draft-format.ts';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import {
  addDay,
  addPlannedExercise,
  canAddDay,
  canAddPlannedExercise,
  changePlannedExercise,
  changeProgression,
  DAY_NAME_MAX_LENGTH,
  docFor,
  exerciseIssue,
  hasUnsavedChanges,
  INCREMENT_PRESETS,
  INCREMENT_RANGE,
  INCREMENT_STEP,
  isPlannableExercise,
  MAX_EXERCISES_PER_DAY,
  moveDay,
  movePlannedExercise,
  nameIssue,
  newProgramDoc,
  pairedIncrement,
  PROGRAM_NAME_MAX_LENGTH,
  progressionIssue,
  removeDay,
  removePlannedExercise,
  renameDay,
  targetIssue,
  TARGET_REPS_RANGE,
  TARGET_SETS_RANGE,
  trimmedDoc,
} from './program-edit.ts';
import { messageOf } from '../../lib/error-text.ts';
import { exerciseKeys } from '../../lib/exercise-key-rules.ts';
import { useActiveProgram } from './use-active-program.ts';

const PROGRESSION_OPTIONS: { value: ProgressionKind; label: string }[] = [
  { value: 'none', label: 'Last weight' },
  { value: 'fixed', label: 'Fixed weight' },
  { value: 'linear', label: 'Add weight' },
];

const PROGRESSION_HINTS: Record<ProgressionKind, string | null> = {
  none: null,
  fixed: 'You set the weight when you follow this program.',
  linear: 'Adds the increment after a workout where every set hits its reps. A miss keeps the weight.',
};

interface ProgramEditorProps {
  userId: string;
  creating?: boolean;
}

export function ProgramEditor({ userId, creating = false }: ProgramEditorProps) {
  const { programId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [doc, setDoc] = useState<ProgramDoc | null>(() =>
    creating
      ? newProgramDoc(crypto.randomUUID(), crypto.randomUUID())
      : docFor(cachedPrograms(userId), userId, programId),
  );
  const [savedDoc, setSavedDoc] = useState(doc);
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [exercises, setExercises] = useState<Exercise[] | null>(null);
  const [problem, setProblem] = useState<{ text: string; shownFor: ProgramDoc | null } | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const onlineSignal = useOnlineSignal();
  const { unitPref } = usePreferences();
  const offline = useIsOffline();
  const { cache: programCache, program: followed } = useActiveProgram(userId);

  useEffect(() => {
    loadCacheFirstWhenOffline(
      isDeviceOffline,
      () => savedExerciseList(deviceStorage(), userId),
      () => fetchExercises({ includeArchived: true }),
    ).then(
      ({ loaded }) => setExercises(loaded),
      (error: Error) => setProblem({ text: error.message, shownFor: null }),
    );
  }, [userId, onlineSignal]);

  useEffect(() => {
    if (doc) return;
    loadProgramsCacheFirst(userId).then(
      ({ loaded: programs }) => {
        const loaded = docFor(programs, userId, programId);
        if (loaded) {
          setDoc(loaded);
          setSavedDoc(loaded);
        } else setMissing(true);
      },
      (error: Error) => setProblem({ text: error.message, shownFor: null }),
    );
  }, [doc, userId, programId, onlineSignal]);

  if (missing)
    return (
      <main className="screen">
        <p className="panel">This program doesn't exist.</p>
      </main>
    );
  if (!doc)
    return (
      <main className="screen">
        {problem ? (
          <p className="problem" role="alert">
            {problem.text}
          </p>
        ) : (
          <p>Loading…</p>
        )}
      </main>
    );

  const byId = new Map((exercises ?? []).map((exercise) => [exercise.id, exercise]));
  const pickable = (exercises ?? []).filter(isPlannableExercise).filter((exercise) => !exercise.archived);

  const nameOf = (exerciseId: string) => byId.get(exerciseId)?.name ?? 'Unknown exercise';
  const loadTypeOf = (exerciseId: string) => {
    const exercise = byId.get(exerciseId);
    return exercise && isLiftExercise(exercise) ? exercise.loadType : null;
  };
  const issue =
    nameIssue(doc) ?? exerciseIssue(doc) ?? targetIssue(doc, nameOf) ?? progressionIssue(doc, nameOf, loadTypeOf);
  const shownProblem = problem && (problem.shownFor === null || problem.shownFor === doc) ? problem.text : null;
  const changeAt = (dayIndex: number, exerciseIndex: number, changes: Partial<PlannedExercise>) =>
    setDoc(changePlannedExercise(doc, dayIndex, exerciseIndex, changes));
  const changeIncrement = (dayIndex: number, exerciseIndex: number, value: number) => {
    const { kg, lb } = pairedIncrement(value, unitPref);
    changeAt(dayIndex, exerciseIndex, { progression: { kind: 'linear', incrementKg: kg, incrementLb: lb } });
  };

  const save = async () => {
    if (issue) return setProblem({ text: issue, shownFor: doc });
    setSaving(true);
    setProblem(null);
    try {
      await saveProgram(userId, trimmedDoc(doc));
      navigate('/programs');
    } catch (error) {
      setProblem({ text: messageOf(error, 'Could not save the program.'), shownFor: doc });
      setSaving(false);
    }
  };

  const cancel = () => {
    if (savedDoc && hasUnsavedChanges(savedDoc, doc)) setConfirmingCancel(true);
    else navigate('/programs');
  };

  const outdated =
    !creating &&
    followStatus(trimmedDoc(doc), programCache.enrollment, programCache.templates, exercises ? loadTypeOf : null) ===
      'outdated';

  const followChanges = async () => {
    if (issue) return setProblem({ text: issue, shownFor: doc });
    if (!programCache.enrollment) return;
    const carried: CarriedFollow = {
      unit: programCache.enrollment.unit,
      workingWeights: followed.kind === 'ready' ? workingWeights(followed.state) : {},
    };
    setSaving(true);
    setProblem(null);
    try {
      await saveProgram(userId, trimmedDoc(doc));
      const { key } = await publishForEnroll(queryClient, userId, doc.id);
      navigate(`/programs/enroll/${key}`, { state: { carried } });
    } catch (error) {
      setProblem({ text: programErrorText(error), shownFor: doc });
      setSaving(false);
    }
  };

  return (
    <main className="screen stack">
      <div className="stack" style={{ gap: 4 }}>
        <button className="back-link" type="button" disabled={saving} onClick={cancel}>
          Cancel
        </button>
        <h1 className="title">{creating ? 'New program' : 'Edit program'}</h1>
      </div>
      {outdated && (
        <section className="panel stack" aria-label="Followed version">
          <p>You're following an earlier version</p>
          {offline && <p className="notice">{PROGRAM_OFFLINE_TEXT}</p>}
          <button className="button" type="button" disabled={saving || offline} onClick={() => void followChanges()}>
            Use these changes
          </button>
        </section>
      )}
      <label className="field">
        Program name
        <input
          value={doc.name}
          maxLength={PROGRAM_NAME_MAX_LENGTH}
          onChange={(event) => setDoc({ ...doc, name: event.target.value })}
        />
      </label>
      {doc.days.map((day, dayIndex) => (
        <section className="panel stack" key={day.id} aria-label={`Day ${dayIndex + 1}`}>
          <div className="row spread">
            <label className="field">
              Day name
              <input
                value={day.name}
                maxLength={DAY_NAME_MAX_LENGTH}
                onChange={(event) => setDoc(renameDay(doc, dayIndex, event.target.value))}
              />
            </label>
            <span className="row">
              <button
                className="button link"
                type="button"
                disabled={dayIndex === 0}
                onClick={() => setDoc(moveDay(doc, dayIndex, -1))}
              >
                Up
              </button>
              <button
                className="button link"
                type="button"
                disabled={dayIndex === doc.days.length - 1}
                onClick={() => setDoc(moveDay(doc, dayIndex, 1))}
              >
                Down
              </button>
              <button
                className="button link"
                type="button"
                disabled={doc.days.length === 1}
                onClick={() => setDoc(removeDay(doc, dayIndex))}
              >
                Remove day
              </button>
            </span>
          </div>
          <ol className="stack exercise-list">
            {exerciseKeys(day.exercises).map((plannedKey, exerciseIndex) => {
              const planned = day.exercises[exerciseIndex];
              const exercise = byId.get(planned.exerciseId);
              const name = nameOf(planned.exerciseId);
              const { progression } = planned;
              return (
                <li className="stack program-exercise" key={plannedKey}>
                  <div className="row spread">
                    <span>
                      {name} {exercise && <span className="muted">{exerciseLabels(exercise)}</span>}
                    </span>
                    <span className="row">
                      <button
                        className="button link"
                        type="button"
                        aria-label={`Move ${name} up`}
                        disabled={exerciseIndex === 0}
                        onClick={() => setDoc(movePlannedExercise(doc, dayIndex, exerciseIndex, -1))}
                      >
                        Up
                      </button>
                      <button
                        className="button link"
                        type="button"
                        aria-label={`Move ${name} down`}
                        disabled={exerciseIndex === day.exercises.length - 1}
                        onClick={() => setDoc(movePlannedExercise(doc, dayIndex, exerciseIndex, 1))}
                      >
                        Down
                      </button>
                      <button
                        className="button link"
                        type="button"
                        aria-label={`Remove ${name}`}
                        onClick={() => setDoc(removePlannedExercise(doc, dayIndex, exerciseIndex))}
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                  {(loadTypeOf(planned.exerciseId) === 'external' || progression.kind !== 'none') && (
                    <SegmentedChoice
                      label={`${name} progression`}
                      options={PROGRESSION_OPTIONS}
                      current={progression.kind}
                      onPick={(kind) => setDoc(changeProgression(doc, dayIndex, exerciseIndex, kind))}
                    />
                  )}
                  {PROGRESSION_HINTS[progression.kind] && <p className="hint">{PROGRESSION_HINTS[progression.kind]}</p>}
                  {progression.kind === 'linear' && (
                    <div className="row">
                      <SegmentedChoice
                        label={`${name} increment`}
                        options={INCREMENT_PRESETS.map((preset) => ({
                          value: preset[unitPref],
                          label: `${preset[unitPref]} ${unitPref}`,
                        }))}
                        current={unitPref === 'kg' ? progression.incrementKg : progression.incrementLb}
                        onPick={(value) => changeIncrement(dayIndex, exerciseIndex, value)}
                      />
                      <NumberTextField
                        label={`Increment (${unitPref})`}
                        value={unitPref === 'kg' ? progression.incrementKg : progression.incrementLb}
                        {...INCREMENT_RANGE[unitPref]}
                        step={INCREMENT_STEP[unitPref]}
                        onCommit={(value) => changeIncrement(dayIndex, exerciseIndex, value)}
                      />
                    </div>
                  )}
                  <div className="row">
                    <NumberTextField
                      label="Sets"
                      value={planned.targetSets}
                      {...TARGET_SETS_RANGE}
                      wholeNumber
                      onCommit={(targetSets) => changeAt(dayIndex, exerciseIndex, { targetSets })}
                    />
                    {progression.kind === 'linear' ? (
                      <NumberTextField
                        label="Reps"
                        value={planned.targetRepsMin}
                        {...TARGET_REPS_RANGE}
                        wholeNumber
                        lastInGroup
                        onCommit={(reps) =>
                          changeAt(dayIndex, exerciseIndex, { targetRepsMin: reps, targetRepsMax: reps })
                        }
                      />
                    ) : (
                      <>
                        <NumberTextField
                          label="Reps min"
                          value={planned.targetRepsMin}
                          {...TARGET_REPS_RANGE}
                          wholeNumber
                          onCommit={(targetRepsMin) => changeAt(dayIndex, exerciseIndex, { targetRepsMin })}
                        />
                        <NumberTextField
                          label="Reps max"
                          value={planned.targetRepsMax}
                          {...TARGET_REPS_RANGE}
                          wholeNumber
                          lastInGroup
                          onCommit={(targetRepsMax) => changeAt(dayIndex, exerciseIndex, { targetRepsMax })}
                        />
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
          {canAddPlannedExercise(day) ? (
            <ExercisePicker
              exercises={pickable}
              onPick={(exercise) => setDoc(addPlannedExercise(doc, dayIndex, exercise.id))}
            />
          ) : (
            <p className="hint">A day holds at most {MAX_EXERCISES_PER_DAY} exercises.</p>
          )}
        </section>
      ))}
      <button
        className="button"
        type="button"
        disabled={!canAddDay(doc)}
        onClick={() => setDoc(addDay(doc, crypto.randomUUID()))}
      >
        + Add day
      </button>
      {shownProblem && (
        <p className="problem" role="alert">
          {shownProblem}
        </p>
      )}
      <button className="button primary" type="button" disabled={saving} onClick={save}>
        Save
      </button>
      {confirmingCancel && (
        <ConfirmDialog
          title="Discard your changes?"
          confirmLabel="Discard changes"
          danger
          busy={saving}
          onConfirm={() => navigate('/programs')}
          onCancel={() => setConfirmingCancel(false)}
        >
          <p>{creating ? "This program isn't saved yet." : 'Your edits to this program are not saved.'}</p>
        </ConfirmDialog>
      )}
    </main>
  );
}
