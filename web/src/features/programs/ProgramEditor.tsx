import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useIsOffline } from '../../lib/platform/use-online.ts';
import { exerciseLabels, isLiftExercise, isPlannableExercise } from '../../lib/exercises/catalog-rules.ts';
import { cachedPrograms, type ProgramDoc, saveProgram } from '../../lib/programs/programs.ts';
import { type CarriedFollow, followStatus, workingWeights } from '../../lib/programs/program-follow-rules.ts';
import { PROGRAM_OFFLINE_TEXT, programErrorText } from '../../lib/programs/program-error-rules.ts';
import { BackLink } from '../../components/BackLink.tsx';
import { FieldProblem } from '../../components/FieldProblem.tsx';
import { nameProblem } from '../../lib/names.ts';
import { NumberTextField } from '../../components/NumberTextField.tsx';
import { ScreenProblem } from '../../components/ScreenProblem.tsx';
import { ListSkeleton } from '../../components/ScreenSkeleton.tsx';
import { SegmentedChoice } from '../../components/SegmentedChoice.tsx';
import { useUnsavedChangesGuard } from '../../components/UnsavedChangesGuard.tsx';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { exerciseListQuery, programsQuery, publishForEnroll, showChangedPrograms } from '../../lib/query/queries.ts';
import type { PlannedExercise, ProgressionKind } from '../../offline/draft-starts.ts';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import { useFocusAfterRemoval } from '../workout/use-focus-after-removal.ts';
import { useToast } from '../../lib/ui/toast.ts';
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
  restoreDay,
  targetIssue,
  TARGET_REPS_RANGE,
  TARGET_SETS_RANGE,
  trimmedDoc,
} from './program-edit.ts';
import { messageOf } from '../../lib/error-text.ts';
import { exerciseKeys } from '../../lib/exercises/exercise-key-rules.ts';
import { useActiveProgram } from './use-active-program.ts';

const ADD_DAY_FOCUS_KEY = 'add-day';

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
  const [problem, setProblem] = useState<{ text: string; shownFor: ProgramDoc } | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [namesChecked, setNamesChecked] = useState(false);
  const fieldId = useId();
  const { unitPref } = usePreferences();
  const offline = useIsOffline();
  const { cache: programCache, program: followed } = useActiveProgram(userId);
  const { showToast } = useToast();
  const { focusTarget, focusAfterNextChange } = useFocusAfterRemoval(doc?.days);
  const exerciseList = useQuery(exerciseListQuery(userId));
  const programList = useQuery(programsQuery(userId));
  const exercises = exerciseList.data ?? null;
  const loadedPrograms = programList.data?.loaded;
  const unsaved = useUnsavedChangesGuard(
    doc !== null && savedDoc !== null && hasUnsavedChanges(savedDoc, doc),
    creating ? "This program isn't saved yet." : 'Your edits to this program are not saved.',
  );

  if (!doc && !missing && loadedPrograms && !programList.isFetching) {
    const loaded = docFor(loadedPrograms, userId, programId);
    if (loaded) {
      setDoc(loaded);
      setSavedDoc(loaded);
    } else setMissing(true);
  }

  const loadProblem =
    (doc || programList.data ? null : programList.error?.message) ??
    (exercises ? null : exerciseList.error?.message) ??
    null;

  const heading = (
    <div className="stack" style={{ gap: 'var(--space-1)' }}>
      <BackLink parent="/programs" label="Cancel" disabled={saving} />
      <h1 className="title">{creating ? 'New program' : 'Edit program'}</h1>
    </div>
  );
  const retryLoad = () => Promise.all([programList.refetch(), exerciseList.refetch()]);

  if (missing)
    return (
      <main className="screen stack">
        {heading}
        <p className="panel">This program doesn't exist.</p>
      </main>
    );
  if (!doc)
    return loadProblem ? (
      <ScreenProblem heading={heading} problem={loadProblem} onRetry={retryLoad} />
    ) : (
      <main className="screen stack">
        {heading}
        <ListSkeleton />
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
  const shownProblem = problem?.shownFor === doc ? problem.text : loadProblem;
  const removeDayAt = (dayIndex: number, dayLabel: string) => {
    const removed = doc.days[dayIndex];
    const remaining = removeDay(doc, dayIndex);
    const nextDay = remaining.days.length > 1 ? (remaining.days[dayIndex] ?? remaining.days[dayIndex - 1]) : null;
    focusAfterNextChange({ setId: nextDay?.id ?? null, addKey: ADD_DAY_FOCUS_KEY });
    setDoc(remaining);
    showToast(`${dayLabel} removed.`, {
      label: 'Undo',
      onAct: () => setDoc((current) => current && restoreDay(current, dayIndex, removed)),
    });
  };
  const changeAt = (dayIndex: number, exerciseIndex: number, changes: Partial<PlannedExercise>) =>
    setDoc(changePlannedExercise(doc, dayIndex, exerciseIndex, changes));
  const changeIncrement = (dayIndex: number, exerciseIndex: number, value: number) => {
    const { kg, lb } = pairedIncrement(value, unitPref);
    changeAt(dayIndex, exerciseIndex, { progression: { kind: 'linear', incrementKg: kg, incrementLb: lb } });
  };

  const programNameId = `${fieldId}-program`;
  const dayNameId = (dayId: string) => `${fieldId}-day-${dayId}`;
  const programNameProblem = namesChecked ? nameProblem(doc.name, PROGRAM_NAME_MAX_LENGTH) : null;
  const refuse = (text: string) => {
    setProblem({ text, shownFor: doc });
    const firstBadName = [
      { id: programNameId, problem: nameProblem(doc.name, PROGRAM_NAME_MAX_LENGTH) },
      ...doc.days.map((day) => ({ id: dayNameId(day.id), problem: nameProblem(day.name, DAY_NAME_MAX_LENGTH) })),
    ].find(({ problem }) => problem !== null);
    if (!firstBadName) return;
    setNamesChecked(true);
    document.getElementById(firstBadName.id)?.focus();
  };

  const save = async () => {
    if (issue) return refuse(issue);
    setSaving(true);
    setProblem(null);
    try {
      await saveProgram(userId, trimmedDoc(doc));
      showChangedPrograms(queryClient, userId);
      unsaved.allowLeaving();
      void navigate('/programs');
    } catch (error) {
      setProblem({ text: messageOf(error, 'Could not save the program.'), shownFor: doc });
      setSaving(false);
    }
  };

  const outdated =
    !creating &&
    followStatus(trimmedDoc(doc), programCache.enrollment, programCache.templates, exercises ? loadTypeOf : null) ===
      'outdated';

  const followChanges = async () => {
    if (issue) return refuse(issue);
    if (!programCache.enrollment) return;
    const carried: CarriedFollow = {
      unit: programCache.enrollment.unit,
      workingWeights: followed.kind === 'ready' ? workingWeights(followed.state) : {},
    };
    setSaving(true);
    setProblem(null);
    try {
      await saveProgram(userId, trimmedDoc(doc));
      showChangedPrograms(queryClient, userId);
      const { key } = await publishForEnroll(queryClient, userId, doc.id);
      unsaved.allowLeaving();
      void navigate(`/programs/enroll/${key}`, { state: { carried } });
    } catch (error) {
      setProblem({ text: programErrorText(error), shownFor: doc });
      setSaving(false);
    }
  };

  return (
    <main className="screen stack">
      {heading}
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
          id={programNameId}
          value={doc.name}
          maxLength={PROGRAM_NAME_MAX_LENGTH}
          onChange={(event) => setDoc({ ...doc, name: event.target.value })}
          aria-invalid={programNameProblem !== null || undefined}
          aria-describedby={programNameProblem ? `${programNameId}-problem` : undefined}
        />
      </label>
      <FieldProblem id={`${programNameId}-problem`} problem={programNameProblem} />
      {doc.days.map((day, dayIndex) => {
        const dayLabel = day.name.trim() || `Day ${dayIndex + 1}`;
        const dayProblem = namesChecked ? nameProblem(day.name, DAY_NAME_MAX_LENGTH) : null;
        return (
          <section className="panel stack" key={day.id} aria-label={`Day ${dayIndex + 1}`}>
            <div className="row spread">
              <label className="field">
                Day name
                <input
                  id={dayNameId(day.id)}
                  value={day.name}
                  maxLength={DAY_NAME_MAX_LENGTH}
                  onChange={(event) => setDoc(renameDay(doc, dayIndex, event.target.value))}
                  aria-invalid={dayProblem !== null || undefined}
                  aria-describedby={dayProblem ? `${dayNameId(day.id)}-problem` : undefined}
                />
              </label>
              <span className="row">
                <button
                  className="button link"
                  type="button"
                  aria-label={`Move ${dayLabel} up`}
                  disabled={dayIndex === 0}
                  onClick={() => setDoc(moveDay(doc, dayIndex, -1))}
                >
                  Up
                </button>
                <button
                  className="button link"
                  type="button"
                  aria-label={`Move ${dayLabel} down`}
                  disabled={dayIndex === doc.days.length - 1}
                  onClick={() => setDoc(moveDay(doc, dayIndex, 1))}
                >
                  Down
                </button>
                <button
                  className="button link"
                  type="button"
                  aria-label={`Remove day ${dayLabel}`}
                  ref={focusTarget(day.id)}
                  disabled={doc.days.length === 1}
                  onClick={() => removeDayAt(dayIndex, dayLabel)}
                >
                  Remove day
                </button>
              </span>
            </div>
            <FieldProblem id={`${dayNameId(day.id)}-problem`} problem={dayProblem} />
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
                    {PROGRESSION_HINTS[progression.kind] && (
                      <p className="hint">{PROGRESSION_HINTS[progression.kind]}</p>
                    )}
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
        );
      })}
      <button
        ref={focusTarget(ADD_DAY_FOCUS_KEY)}
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
      {unsaved.prompt}
    </main>
  );
}
