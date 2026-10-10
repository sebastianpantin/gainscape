import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchExercises } from '../../lib/catalog.ts';
import { deviceStorage } from '../../lib/rest-timer-store.ts';
import { useOnlineSignal } from '../../lib/use-online.ts';
import { savedExerciseList } from '../../offline/collection-cache.ts';
import { isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import { type Exercise, exerciseLabels, isLiftExercise } from '../../lib/catalog-rules.ts';
import { cachedPrograms, loadProgramsCacheFirst, type ProgramDoc, saveProgram } from '../../lib/programs.ts';
import { NumberTextField } from '../../components/NumberTextField.tsx';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import {
  addDay,
  addPlannedExercise,
  canAddDay,
  canAddPlannedExercise,
  changePlannedExercise,
  DAY_NAME_MAX_LENGTH,
  docFor,
  MAX_EXERCISES_PER_DAY,
  moveDay,
  movePlannedExercise,
  nameIssue,
  newProgramDoc,
  PROGRAM_NAME_MAX_LENGTH,
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

interface ProgramEditorProps {
  userId: string;
  creating?: boolean;
}

export function ProgramEditor({ userId, creating = false }: ProgramEditorProps) {
  const { programId = '' } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<ProgramDoc | null>(() =>
    creating
      ? newProgramDoc(crypto.randomUUID(), crypto.randomUUID())
      : docFor(cachedPrograms(userId), userId, programId),
  );
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);
  const onlineSignal = useOnlineSignal();

  useEffect(() => {
    loadCacheFirstWhenOffline(
      isDeviceOffline,
      () => savedExerciseList(deviceStorage(), userId),
      () => fetchExercises({ includeArchived: true }),
    ).then(
      ({ loaded }) => setExercises(loaded.filter(isLiftExercise)),
      (error: Error) => setProblem(error.message),
    );
  }, [userId, onlineSignal]);

  useEffect(() => {
    if (doc) return;
    loadProgramsCacheFirst(userId).then(
      ({ loaded: programs }) => {
        const loaded = docFor(programs, userId, programId);
        if (loaded) setDoc(loaded);
        else setMissing(true);
      },
      (error: Error) => setProblem(error.message),
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
            {problem}
          </p>
        ) : (
          <p>Loading…</p>
        )}
      </main>
    );

  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const pickable = exercises.filter((exercise) => !exercise.archived);

  const nameOf = (exerciseId: string) => byId.get(exerciseId)?.name ?? 'Unknown exercise';
  const issue = nameIssue(doc) ?? targetIssue(doc, nameOf);

  const save = async () => {
    if (issue) return setProblem(issue);
    setSaving(true);
    setProblem(null);
    try {
      await saveProgram(userId, trimmedDoc(doc));
      navigate('/programs');
    } catch (error) {
      setProblem(messageOf(error, 'Could not save the program.'));
      setSaving(false);
    }
  };

  return (
    <main className="screen stack">
      <h1 className="title">{creating ? 'New program' : 'Edit program'}</h1>
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
                  <div className="row">
                    <NumberTextField
                      label="Sets"
                      value={planned.targetSets}
                      {...TARGET_SETS_RANGE}
                      wholeNumber
                      onCommit={(targetSets) =>
                        setDoc(changePlannedExercise(doc, dayIndex, exerciseIndex, { targetSets }))
                      }
                    />
                    <NumberTextField
                      label="Reps min"
                      value={planned.targetRepsMin}
                      {...TARGET_REPS_RANGE}
                      wholeNumber
                      onCommit={(targetRepsMin) =>
                        setDoc(changePlannedExercise(doc, dayIndex, exerciseIndex, { targetRepsMin }))
                      }
                    />
                    <NumberTextField
                      label="Reps max"
                      value={planned.targetRepsMax}
                      {...TARGET_REPS_RANGE}
                      wholeNumber
                      onCommit={(targetRepsMax) =>
                        setDoc(changePlannedExercise(doc, dayIndex, exerciseIndex, { targetRepsMax }))
                      }
                    />
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
      {problem && (
        <p className="problem" role="alert">
          {problem}
        </p>
      )}
      <button className="button primary" type="button" disabled={saving} onClick={save}>
        Save
      </button>
    </main>
  );
}
