import { type ProgramDefinition, type RoundingMode, type WeightUnit } from '@domain/index.ts';
import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog.tsx';
import { SegmentedChoice } from '../../components/SegmentedChoice.tsx';
import { TermHelpRow } from '../../components/TermHelpRow.tsx';
import { isLiftExercise } from '../../lib/exercises/catalog-rules.ts';
import { PROGRAM_OFFLINE_TEXT, programErrorText } from '../../lib/programs/program-error-rules.ts';
import { inputHelpKeys } from '../../lib/ui/term-help-rules.ts';
import { useIsOffline } from '../../lib/platform/use-online.ts';
import { usePreferences } from '../../lib/profile/preferences.ts';
import { type EnrollChoices, enrollProgram, forgetCachedEnrollment } from '../../lib/programs/program-enrollment.ts';
import { enrollChoicesQuery } from '../../lib/query/queries.ts';
import { type LoadedState, loadedState } from '../../lib/query/query-state-rules.ts';
import {
  barWeightLabel,
  type BindableExercise,
  bindingSelectLifts,
  type EnrollFieldProblem,
  enrollFieldProblems,
  type EnrollForm,
  enrollPayload,
  type EnrollProgramPayload,
  initialEnrollForm,
  inputFieldKey,
  inputFields,
  inputKindLabel,
  liftName,
  optionControls,
  optionFieldKey,
  referencePreview,
  replacedProgramName,
  roundingIncrementLabel,
  roundingTextOf,
  startingWeightHint,
  templateEntry,
  type TemplateListEntry,
  withOption,
  withUnit,
} from '../../lib/programs/program-enroll-rules.ts';
import { carriedFollowOf, carriedInputs } from '../../lib/programs/program-follow-rules.ts';
import { readProgramCache } from '../../offline/program-cache.ts';

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
  { value: 'kg', label: 'Kilograms' },
  { value: 'lb', label: 'Pounds' },
];

const ROUNDING_MODES: { value: RoundingMode; label: string }[] = [
  { value: 'nearest', label: 'Nearest' },
  { value: 'down', label: 'Down' },
];

const NOT_TRACKED = '';

function FieldProblem({ id, problem }: { id: string; problem: string | undefined }) {
  if (!problem) return null;
  return (
    <p className="problem" id={id}>
      {problem}
    </p>
  );
}

function describedBy(...ids: (string | false | undefined)[]): string | undefined {
  const present = ids.filter((id) => typeof id === 'string');
  return present.length > 0 ? present.join(' ') : undefined;
}

function loadedEntry(entry: TemplateListEntry | undefined, exercises: BindableExercise[]): Loaded {
  if (!entry) return { status: 'missing' };
  if (entry.kind !== 'enrollable') return { status: 'blocked', name: entry.name, message: entry.message };
  return { status: 'ready', definition: entry.definition, name: entry.name, exercises };
}

function loadedChoices(choices: LoadedState<EnrollChoices>, key: string | undefined): Loaded {
  if (choices.status !== 'ready') return choices;
  const { templates, exercises } = choices.data;
  const bindable = exercises
    .filter(isLiftExercise)
    .map((exercise) => ({ id: exercise.id, key: exercise.key ?? null, name: exercise.name, archived: false }));
  return loadedEntry(key === undefined ? undefined : templateEntry(templates, key), bindable);
}

export function ProgramEnrollScreen({ userId }: ProgramEnrollScreenProps) {
  const { key } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [carried] = useState(() => carriedFollowOf(location.state));
  const { unitPref } = usePreferences();
  const choices = useQuery(enrollChoicesQuery(userId));
  const loaded = loadedChoices(loadedState(choices.data, choices.isFetching ? null : choices.error), key);
  const [editedForm, setEditedForm] = useState<EnrollForm | null>(null);
  const [problems, setProblems] = useState<string[]>([]);
  const [fieldProblems, setFieldProblems] = useState<EnrollFieldProblem[]>([]);
  const [busy, setBusy] = useState(false);
  const idPrefix = useId();
  const offline = useIsOffline();
  const [confirmingReplace, setConfirmingReplace] = useState<EnrollProgramPayload | null>(null);
  const [enrolledRow] = useState(() => readProgramCache(localStorage, userId).enrollment);

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
        <Link className="back-link" to="/programs">
          ‹ Programs
        </Link>
        <h1 className="title">Follow {loaded.name}</h1>
        <p className="panel muted">{loaded.message}</p>
      </main>
    );

  const { definition, name, exercises } = loaded;
  const initialForm = carried
    ? {
        ...initialEnrollForm(definition, carried.unit, exercises),
        inputValues: carriedInputs(carried.workingWeights, definition),
      }
    : initialEnrollForm(definition, unitPref, exercises);
  const form = editedForm ?? initialForm;
  const change = (changes: Partial<EnrollForm>) => {
    setFieldProblems([]);
    setEditedForm({ ...form, ...changes });
  };
  const fieldId = (field: string) => `${idPrefix}-${field}`;
  const problemId = (field: string) => `${idPrefix}-${field}-problem`;
  const problemOf = (field: string) => fieldProblems.find((problem) => problem.field === field)?.text;
  const fieldA11y = (field: string, hintId?: string) => ({
    id: fieldId(field),
    'aria-invalid': problemOf(field) ? true : undefined,
    'aria-describedby': describedBy(problemOf(field) && problemId(field), hintId),
  });
  const roundingText = roundingTextOf(form);
  const fields = inputFields(definition, form);
  const weightHint = startingWeightHint(fields, form);
  const weightHintId = `${idPrefix}-weight-hint`;
  const replacing = replacedProgramName(readProgramCache(localStorage, userId).templates, enrolledRow);
  const selectLifts = bindingSelectLifts(definition);

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
    const issues = enrollFieldProblems(definition, form);
    if (issues.length > 0) {
      flushSync(() => setFieldProblems(issues));
      document.getElementById(fieldId(issues[0].field))?.focus();
      return;
    }
    const result = enrollPayload(definition, form);
    if (result.kind === 'invalid') {
      setProblems(result.problems);
      return;
    }
    const refollowing = carried !== null && enrolledRow?.template_key === definition.key;
    if (replacing === null || refollowing) void enroll(result.payload);
    else setConfirmingReplace(result.payload);
  };

  return (
    <main className="screen stack">
      <Link className="back-link" to="/programs">
        ‹ Programs
      </Link>
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
        <TermHelpRow keys={inputHelpKeys(fields)} />
        {weightHint && (
          <p className="hint" id={weightHintId}>
            {weightHint}
          </p>
        )}
        {fields.map((field) => {
          const preview = referencePreview(definition, form, field.lift);
          const key = inputFieldKey(field.lift);
          const hinted = weightHint !== null && field.kind === 'workingWeight';
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
                  placeholder={hinted ? `e.g. ${roundingText.barWeight}` : undefined}
                  {...fieldA11y(key, hinted ? weightHintId : undefined)}
                  value={form.inputValues[field.lift] ?? ''}
                  onChange={(event) =>
                    change({ inputValues: { ...form.inputValues, [field.lift]: event.target.value } })
                  }
                />
              </label>
              <FieldProblem id={problemId(key)} problem={problemOf(key)} />
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
              <div
                className="stack"
                key={control.key}
                style={{ gap: 6 }}
                tabIndex={-1}
                {...fieldA11y(optionFieldKey(control.key))}
              >
                <span className="field">{control.label}</span>
                <SegmentedChoice
                  label={control.label}
                  options={control.choices}
                  current={form.options[control.key] ?? control.defaultValue}
                  stacked={control.choices.length > 3}
                  onPick={(value) => {
                    setFieldProblems([]);
                    setEditedForm(withOption(definition, form, control.key, value, exercises));
                  }}
                />
                <FieldProblem
                  id={problemId(optionFieldKey(control.key))}
                  problem={problemOf(optionFieldKey(control.key))}
                />
              </div>
            ) : (
              <div className="stack" key={control.key} style={{ gap: 6 }}>
                <label className="field">
                  {control.label}
                  <input
                    type="number"
                    inputMode="decimal"
                    min={control.min}
                    max={control.max}
                    step={0.01}
                    {...fieldA11y(optionFieldKey(control.key))}
                    value={form.optionText?.[control.key] ?? String(control.defaultValue)}
                    onChange={(event) =>
                      change({ optionText: { ...form.optionText, [control.key]: event.target.value } })
                    }
                  />
                </label>
                <FieldProblem
                  id={problemId(optionFieldKey(control.key))}
                  problem={problemOf(optionFieldKey(control.key))}
                />
              </div>
            ),
          )}
        </section>
      )}
      {selectLifts.length > 0 && (
        <section className="panel stack" aria-label="Exercises">
          <details className="disclosure">
            <summary>Change exercises</summary>
            <div className="stack">
              {selectLifts.map((lift) => (
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
            </div>
          </details>
        </section>
      )}
      <section className="panel stack" aria-label="Rounding">
        <h2>Rounding</h2>
        <label className="field">
          {roundingIncrementLabel(form.unit)}
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            {...fieldA11y('increment')}
            value={roundingText.increment}
            onChange={(event) => change({ roundingText: { ...roundingText, increment: event.target.value } })}
          />
        </label>
        <FieldProblem id={problemId('increment')} problem={problemOf('increment')} />
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
            {...fieldA11y('barWeight')}
            value={roundingText.barWeight}
            onChange={(event) => change({ roundingText: { ...roundingText, barWeight: event.target.value } })}
          />
        </label>
        <FieldProblem id={problemId('barWeight')} problem={problemOf('barWeight')} />
      </section>
      {fieldProblems.length > 0 && (
        <p className="problem" role="alert">
          {fieldProblems.length === 1 ? '1 field needs fixing.' : `${fieldProblems.length} fields need fixing.`}
        </p>
      )}
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
