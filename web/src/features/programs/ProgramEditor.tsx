import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { type Exercise, exerciseLabels, fetchExercises } from '../../lib/catalog.ts';
import { nameProblem, trimmedName } from '../../lib/names.ts';
import { cachedPrograms, fetchPrograms, type ProgramDoc, saveProgram } from '../../lib/programs.ts';
import type { PlannedExercise } from '../../offline/draft-format.ts';
import { ExercisePicker } from '../workout/ExercisePicker.tsx';

interface ProgramEditorProps {
  userId: string;
}

type EditorDay = ProgramDoc['days'][number];

const DEFAULT_TARGET = { targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 };

function moved<T>(items: T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function docFor(userId: string, programId: string): ProgramDoc | null {
  const program = cachedPrograms(userId)?.find((candidate) => candidate.id === programId);
  if (!program || program.ownerUserId !== userId) return null;
  return {
    id: program.id,
    name: program.name,
    days: program.days.map((day) => ({ id: day.id, name: day.name, exercises: day.exercises })),
  };
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
  const [doc, setDoc] = useState<ProgramDoc | null>(() => docFor(userId, programId));
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchExercises({ includeArchived: true }).then(setExercises, (error: Error) => setProblem(error.message));
  }, []);

  useEffect(() => {
    if (doc) return;
    fetchPrograms(userId).then(
      () => {
        const loaded = docFor(userId, programId);
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

  const changeDay = (dayIndex: number, update: (day: EditorDay) => EditorDay) =>
    setDoc({ ...doc, days: doc.days.map((day, index) => (index === dayIndex ? update(day) : day)) });

  const changeExercise = (dayIndex: number, exerciseIndex: number, changes: Partial<PlannedExercise>) =>
    changeDay(dayIndex, (day) => ({
      ...day,
      exercises: day.exercises.map((exercise, index) =>
        index === exerciseIndex ? { ...exercise, ...changes } : exercise,
      ),
    }));

  const nameIssue =
    nameProblem(doc.name, 60) ??
    doc.days.map((day) => nameProblem(day.name, 40)).find((issue) => issue !== null) ??
    null;

  const save = async () => {
    if (nameIssue) return setProblem(nameIssue);
    setSaving(true);
    setProblem(null);
    try {
      await saveProgram(userId, {
        ...doc,
        name: trimmedName(doc.name),
        days: doc.days.map((day) => ({ ...day, name: trimmedName(day.name) })),
      });
      navigate('/programs');
    } catch (error) {
      setProblem(error instanceof Error ? error.message : 'Could not save the program.');
      setSaving(false);
    }
  };

  return (
    <main className="screen stack">
      <h1 className="title">Edit program</h1>
      <label className="field">
        Program name
        <input value={doc.name} maxLength={60} onChange={(event) => setDoc({ ...doc, name: event.target.value })} />
      </label>
      {doc.days.map((day, dayIndex) => (
        <section className="panel stack" key={day.id} aria-label={`Day ${dayIndex + 1}`}>
          <div className="row spread">
            <label className="field">
              Day name
              <input
                value={day.name}
                maxLength={40}
                onChange={(event) => changeDay(dayIndex, (current) => ({ ...current, name: event.target.value }))}
              />
            </label>
            <span className="row">
              <button
                className="button link"
                type="button"
                disabled={dayIndex === 0}
                onClick={() => setDoc({ ...doc, days: moved(doc.days, dayIndex, -1) })}
              >
                Up
              </button>
              <button
                className="button link"
                type="button"
                disabled={dayIndex === doc.days.length - 1}
                onClick={() => setDoc({ ...doc, days: moved(doc.days, dayIndex, 1) })}
              >
                Down
              </button>
              <button
                className="button link"
                type="button"
                disabled={doc.days.length === 1}
                onClick={() => setDoc({ ...doc, days: doc.days.filter((_, index) => index !== dayIndex) })}
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
                        onClick={() =>
                          changeDay(dayIndex, (current) => ({
                            ...current,
                            exercises: moved(current.exercises, exerciseIndex, -1),
                          }))
                        }
                      >
                        Up
                      </button>
                      <button
                        className="button link"
                        type="button"
                        aria-label={`Move ${name} down`}
                        disabled={exerciseIndex === day.exercises.length - 1}
                        onClick={() =>
                          changeDay(dayIndex, (current) => ({
                            ...current,
                            exercises: moved(current.exercises, exerciseIndex, 1),
                          }))
                        }
                      >
                        Down
                      </button>
                      <button
                        className="button link"
                        type="button"
                        aria-label={`Remove ${name}`}
                        onClick={() =>
                          changeDay(dayIndex, (current) => ({
                            ...current,
                            exercises: current.exercises.filter((_, index) => index !== exerciseIndex),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </span>
                  </div>
                  <div className="row">
                    <NumberField
                      label="Sets"
                      value={planned.targetSets}
                      lowest={1}
                      highest={10}
                      onChange={(targetSets) => changeExercise(dayIndex, exerciseIndex, { targetSets })}
                    />
                    <NumberField
                      label="Reps min"
                      value={planned.targetRepsMin}
                      lowest={1}
                      highest={100}
                      onChange={(targetRepsMin) => changeExercise(dayIndex, exerciseIndex, { targetRepsMin })}
                    />
                    <NumberField
                      label="Reps max"
                      value={planned.targetRepsMax}
                      lowest={1}
                      highest={100}
                      onChange={(targetRepsMax) => changeExercise(dayIndex, exerciseIndex, { targetRepsMax })}
                    />
                  </div>
                </li>
              );
            })}
          </ol>
          <ExercisePicker
            exercises={pickable}
            onPick={(exercise) =>
              changeDay(dayIndex, (current) => ({
                ...current,
                exercises: [...current.exercises, { exerciseId: exercise.id, ...DEFAULT_TARGET }],
              }))
            }
          />
        </section>
      ))}
      <button
        className="button"
        type="button"
        disabled={doc.days.length >= 14}
        onClick={() =>
          setDoc({
            ...doc,
            days: [...doc.days, { id: crypto.randomUUID(), name: `Day ${doc.days.length + 1}`, exercises: [] }],
          })
        }
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
