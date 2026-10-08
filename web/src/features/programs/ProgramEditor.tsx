import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { fetchExercises } from '../../lib/catalog.ts';
import { readCachedExercises } from '../../lib/catalog-cache.ts';
import { isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import { type Exercise, exerciseLabels, isLiftExercise } from '../../lib/catalog-rules.ts';
import { cachedPrograms, loadProgramsCacheFirst, type ProgramDoc, saveProgram } from '../../lib/programs.ts';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';
import {
  addDay,
  addPlannedExercise,
  canAddDay,
  changePlannedExercise,
  DAY_NAME_MAX_LENGTH,
  docFor,
  moveDay,
  movePlannedExercise,
  nameIssue,
  PROGRAM_NAME_MAX_LENGTH,
  removeDay,
  removePlannedExercise,
  renameDay,
  TARGET_REPS_RANGE,
  TARGET_SETS_RANGE,
  trimmedDoc,
} from './program-edit.ts';
import { messageOf } from '../../lib/error-text.ts';

interface ProgramEditorProps {
  userId: string;
}

interface NumberFieldProps {
  label: string;
  value: number;
  lowest: number;
  highest: number;
  onChange: (value: number) => void;
}

function NumberField({ label, value, lowest, highest, onChange }: NumberFieldProps) {
  return (
    <label className="compact-field">
      {label}
      <input
        type="number"
        inputMode="numeric"
        min={lowest}
        max={highest}
        step={1}
        value={value}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (event.target.value.trim() !== '' && Number.isInteger(next)) onChange(next);
        }}
      />
    </label>
  );
}

export function ProgramEditor({ userId }: ProgramEditorProps) {
  const { programId = '' } = useParams();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<ProgramDoc | null>(() => docFor(cachedPrograms(userId), userId, programId));
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadCacheFirstWhenOffline(
      isDeviceOffline,
      () => readCachedExercises(localStorage, userId),
      () => fetchExercises({ includeArchived: true }),
    ).then(
      ({ loaded }) => setExercises(loaded.filter(isLiftExercise)),
      (error: Error) => setProblem(error.message),
    );
  }, [userId]);

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
  }, [doc, userId, programId]);

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

  const issue = nameIssue(doc);

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
      <h1 className="title">Edit program</h1>
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
            {day.exercises.map((planned, exerciseIndex) => {
              const exercise = byId.get(planned.exerciseId);
              const name = exercise?.name ?? 'Unknown exercise';
              return (
                <li className="stack program-exercise" key={`${planned.exerciseId}-${exerciseIndex}`}>
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
                    <NumberField
                      label="Sets"
                      value={planned.targetSets}
                      {...TARGET_SETS_RANGE}
                      onChange={(targetSets) =>
                        setDoc(changePlannedExercise(doc, dayIndex, exerciseIndex, { targetSets }))
                      }
                    />
                    <NumberField
                      label="Reps min"
                      value={planned.targetRepsMin}
                      {...TARGET_REPS_RANGE}
                      onChange={(targetRepsMin) =>
                        setDoc(changePlannedExercise(doc, dayIndex, exerciseIndex, { targetRepsMin }))
                      }
                    />
                    <NumberField
                      label="Reps max"
                      value={planned.targetRepsMax}
                      {...TARGET_REPS_RANGE}
                      onChange={(targetRepsMax) =>
                        setDoc(changePlannedExercise(doc, dayIndex, exerciseIndex, { targetRepsMax }))
                      }
                    />
                  </div>
                </li>
              );
            })}
          </ol>
          <ExercisePicker
            exercises={pickable}
            onPick={(exercise) => setDoc(addPlannedExercise(doc, dayIndex, exercise.id))}
          />
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
