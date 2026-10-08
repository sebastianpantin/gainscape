import { type ProgramDefinition, type RoundingMode, type WeightUnit } from '@domain/index.ts';
import { useEffect, useId, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { SegmentedChoice } from '../../components/SegmentedChoice.tsx';
import { fetchExercises } from '../../lib/catalog.ts';
import { readCachedExercises } from '../../lib/catalog-cache.ts';
import { isLiftExercise } from '../../lib/catalog-rules.ts';
import { PROGRAM_OFFLINE_TEXT, programErrorText } from '../../lib/program-error-rules.ts';
import { useIsOffline } from '../../lib/use-online.ts';
import { usePreferences } from '../../lib/preferences.ts';
import { enrollProgram, fetchProgramTemplates, forgetCachedEnrollment } from '../../lib/program-enrollment.ts';
import {
  barWeightLabel,
  type BindableExercise,
  type EnrollForm,
  enrollPayload,
  type EnrollProgramPayload,
  initialEnrollForm,
  inputFields,
  inputKindLabel,
  liftName,
  optionControls,
  referencePreview,
  replacedProgramName,
  roundingIncrementLabel,
  roundingTextOf,
  type TemplateListEntry,
  templateListEntries,
  withOption,
  withUnit,
} from '../../lib/program-enroll-rules.ts';
import { isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import { readProgramCache, updateProgramCache } from '../../offline/program-cache.ts';

interface ProgramEnrollScreenProps {
  userId: string;
}

type Loaded =
  | { status: 'loading' }
  | { status: 'failed'; problem: string }
  | { status: 'missing' }
  | { status: 'blocked'; name: string; message: string }
  | { status: 'ready'; definition: ProgramDefinition; name: string; exercises: BindableExercise[] };

const UNIT_OPTIONS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'lb', label: 'lb' },
];

const ROUNDING_MODES: { value: RoundingMode; label: string }[] = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'down', label: 'Down' },
];

const NOT_TRACKED = '';

function loadedEntry(entry: TemplateListEntry | undefined, exercises: BindableExercise[]): Loaded {
  if (!entry) return { status: 'missing' };
  if (entry.kind !== 'enrollable') return { status: 'blocked', name: entry.name, message: entry.message };
  return { status: 'ready', definition: entry.definition, name: entry.name, exercises };
}

function savedTemplatesAndExercises(userId: string) {
  const { templates } = readProgramCache(localStorage, userId);
  const exercises = readCachedExercises(localStorage, userId);
  return templates.length > 0 && exercises ? { templates, exercises } : null;
}

export function ProgramEnrollScreen({ userId }: ProgramEnrollScreenProps) {
  const { key } = useParams();
  const navigate = useNavigate();
  const { unitPref } = usePreferences();
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [editedForm, setEditedForm] = useState<EnrollForm | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const idPrefix = useId();
  const offline = useIsOffline();
  const [confirmingReplace, setConfirmingReplace] = useState<EnrollProgramPayload | null>(null);
  const [enrolledRow] = useState(() => readProgramCache(localStorage, userId).enrollment);

  useEffect(() => {
    let active = true;
    loadCacheFirstWhenOffline(
      isDeviceOffline,
      () => savedTemplatesAndExercises(userId),
      async () => {
        const [templates, exercises] = await Promise.all([
          fetchProgramTemplates(),
          fetchExercises({ includeArchived: false }),
        ]);
        updateProgramCache(localStorage, userId, (cache) => ({ ...cache, templates }));
        return { templates, exercises };
      },
    ).then(
      ({ loaded: { templates, exercises } }) => {
        if (!active) return;
        const bindable = exercises
          .filter(isLiftExercise)
          .map((exercise) => ({ id: exercise.id, key: exercise.key ?? null, name: exercise.name, archived: false }));
        const next = loadedEntry(
          templateListEntries(templates).find((entry) => entry.key === key),
          bindable,
        );
        setLoaded(next);
      },
      (error: Error) => active && setLoaded({ status: 'failed', problem: error.message }),
    );
    return () => {
      active = false;
    };
  }, [userId, key]);

  if (loaded.status === 'loading' || loaded.status === 'failed' || loaded.status === 'missing')
    return (
      <main className="screen stack">
        {loaded.status === 'loading' && <p>Loading…</p>}
        {loaded.status === 'failed' && (
          <p className="problem" role="alert">
            {loaded.problem}
          </p>
        )}
        {loaded.status === 'missing' && <p className="problem">This program doesn't exist.</p>}
      </main>
    );

  if (loaded.status === 'blocked')
    return (
      <main className="screen stack">
        <h1 className="title">Follow {loaded.name}</h1>
        <p className="panel muted">{loaded.message}</p>
      </main>
    );

  const { definition, name, exercises } = loaded;
  const form = editedForm ?? initialEnrollForm(definition, unitPref, exercises);
  const change = (changes: Partial<EnrollForm>) => setEditedForm({ ...form, ...changes });
  const roundingText = roundingTextOf(form);
  const replacing = replacedProgramName(readProgramCache(localStorage, userId).templates, enrolledRow);

  const enroll = async (payload: EnrollProgramPayload) => {
    setConfirmingReplace(null);
    setProblems([]);
    setBusy(true);
    try {
      await enrollProgram(payload);
      forgetCachedEnrollment(userId);
      navigate('/');
    } catch (error) {
      setProblems([programErrorText(error)]);
      setBusy(false);
    }
  };

  const start = () => {
    const result = enrollPayload(definition, form);
    if (result.kind === 'invalid') {
      setProblems(result.problems);
      return;
    }
    if (replacing === null) void enroll(result.payload);
    else setConfirmingReplace(result.payload);
  };

  return (
    <main className="screen stack">
      <h1 className="title">Follow {name}</h1>
      <div className="panel stack">
        <span className="field">Unit</span>
        <SegmentedChoice
          label="Unit"
          options={UNIT_OPTIONS}
          current={form.unit}
          onPick={(unit) => setEditedForm(withUnit(form, unit, definition))}
        />
      </div>
      <section className="panel stack" aria-label="Starting weights">
        <h2>Starting weights</h2>
        {inputFields(definition, form).map((field) => {
          const preview = referencePreview(definition, form, field.lift);
          return (
            <div className="stack" key={field.lift} style={{ gap: 6 }}>
              {field.kinds.length > 1 && (
                <SegmentedChoice
                  label={`${liftName(definition, field.lift)} input`}
                  options={field.kinds.map((kind) => ({ value: kind, label: inputKindLabel(kind) }))}
                  current={field.kind}
                  onPick={(kind) => change({ inputKinds: { ...form.inputKinds, [field.lift]: kind } })}
                />
              )}
              <label className="field">
                {field.label}
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="any"
                  value={form.inputValues[field.lift] ?? ''}
                  onChange={(event) =>
                    change({ inputValues: { ...form.inputValues, [field.lift]: event.target.value } })
                  }
                />
              </label>
              {preview && <p className="hint">{preview}</p>}
            </div>
          );
        })}
      </section>
      {definition.options.length > 0 && (
        <section className="panel stack" aria-label="Options">
          <h2>Options</h2>
          {optionControls(definition, form.unit).map((control) =>
            control.kind === 'choice' ? (
              <div className="stack" key={control.key} style={{ gap: 6 }}>
                <span className="field">{control.label}</span>
                <SegmentedChoice
                  label={control.label}
                  options={control.choices}
                  current={form.options[control.key] ?? control.defaultValue}
                  stacked={control.choices.length > 3}
                  onPick={(value) => setEditedForm(withOption(definition, form, control.key, value, exercises))}
                />
              </div>
            ) : (
              <label className="field" key={control.key}>
                {control.label}
                <input
                  type="number"
                  inputMode="decimal"
                  min={control.min}
                  max={control.max}
                  step={0.01}
                  value={form.optionText?.[control.key] ?? String(control.defaultValue)}
                  onChange={(event) =>
                    change({ optionText: { ...form.optionText, [control.key]: event.target.value } })
                  }
                />
              </label>
            ),
          )}
        </section>
      )}
      <section className="panel stack" aria-label="Exercises">
        <h2>Exercises</h2>
        {definition.lifts.map((lift) => (
          <div className="field" key={lift.key}>
            <label htmlFor={`${idPrefix}-${lift.key}`}>{lift.name} exercise</label>
            <select
              id={`${idPrefix}-${lift.key}`}
              value={form.bindings[lift.key] ?? NOT_TRACKED}
              onChange={(event) =>
                change({
                  bindings: {
                    ...form.bindings,
                    [lift.key]: event.target.value === NOT_TRACKED ? null : event.target.value,
                  },
                })
              }
            >
              <option value={NOT_TRACKED}>Not tracked</option>
              {exercises.map((exercise) => (
                <option key={exercise.id} value={exercise.id}>
                  {exercise.name}
                </option>
              ))}
            </select>
          </div>
        ))}
      </section>
      <section className="panel stack" aria-label="Rounding">
        <h2>Rounding</h2>
        <label className="field">
          {roundingIncrementLabel(form.unit)}
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={roundingText.increment}
            onChange={(event) => change({ roundingText: { ...roundingText, increment: event.target.value } })}
          />
        </label>
        <span className="field">Rounding direction</span>
        <SegmentedChoice
          label="Rounding direction"
          options={ROUNDING_MODES}
          current={form.rounding.mode}
          onPick={(mode) => change({ rounding: { ...form.rounding, mode } })}
        />
        <label className="field">
          {barWeightLabel(form.unit)}
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={roundingText.barWeight}
            onChange={(event) => change({ roundingText: { ...roundingText, barWeight: event.target.value } })}
          />
        </label>
      </section>
      {problems.length > 0 && (
        <div className="problem" role="alert">
          {problems.map((problem) => (
            <p key={problem}>{problem}</p>
          ))}
        </div>
      )}
      {offline && <p className="notice">{PROGRAM_OFFLINE_TEXT}</p>}
      <button className="button primary big" type="button" disabled={busy || offline} onClick={start}>
        Start following
      </button>
      {confirmingReplace && replacing !== null && (
        <ConfirmDialog
          title={`Replace ${replacing}?`}
          confirmLabel="Replace"
          busy={busy}
          onConfirm={() => void enroll(confirmingReplace)}
          onCancel={() => setConfirmingReplace(null)}
        >
          <p>You'll follow {name} instead. Your logged workouts stay in your history.</p>
        </ConfirmDialog>
      )}
    </main>
  );
}
