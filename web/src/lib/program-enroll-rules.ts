import { evaluateNumber } from '@domain/program-definition.ts';
import {
  DEFAULT_ROUNDING,
  type InputKind,
  type OptionDecl,
  type OptionValue,
  parseProgramDefinition,
  type ProgramDefinition,
  type ReferenceVar,
  type RoundingSetting,
  roundTo,
  type WeightUnit,
} from '@domain/index.ts';

export const UPDATE_APP_TEXT = 'Update the app to use this program';

export const UNUSABLE_TEMPLATE_TEXT = "This program can't be used right now";

export interface ProgramTemplateRow {
  key: string;
  version: number;
  name: string;
  definition: unknown;
}

export type TemplateListEntry =
  | { kind: 'enrollable'; key: string; version: number; name: string; definition: ProgramDefinition }
  | { kind: 'needs_update'; key: string; version: number; name: string; message: typeof UPDATE_APP_TEXT }
  | { kind: 'unusable'; key: string; version: number; name: string; message: typeof UNUSABLE_TEMPLATE_TEXT };

export interface BindableExercise {
  id: string;
  key: string | null;
  name: string;
  archived: boolean;
}

export interface EnrollForm {
  unit: WeightUnit;
  inputKinds: Readonly<Record<string, InputKind>>;
  inputValues: Readonly<Record<string, string>>;
  options: Readonly<Record<string, OptionValue>>;
  bindings: Readonly<Record<string, string | null>>;
  rounding: RoundingSetting;
}

export interface InputField {
  lift: string;
  kind: InputKind;
  kinds: readonly InputKind[];
  label: string;
  unit: WeightUnit;
}

export interface OptionChoice {
  value: OptionValue;
  label: string;
}

export type OptionControl =
  | { kind: 'choice'; key: string; label: string; choices: OptionChoice[]; defaultValue: OptionValue }
  | { kind: 'number'; key: string; label: string; min: number; max: number; defaultValue: number };

export interface EnrollProgramPayload {
  templateKey: string;
  templateVersion: number;
  unit: WeightUnit;
  options: Record<string, OptionValue>;
  bindings: Record<string, string | null>;
  inputs: Record<string, Partial<Record<InputKind, number>>>;
  rounding: RoundingSetting;
}

export type EnrollPayloadResult =
  { kind: 'ok'; payload: EnrollProgramPayload } | { kind: 'invalid'; problems: string[] };

export const MAX_REFERENCE_VALUE = 1000;

const SHOWN_REFERENCE_DECIMALS = 2;

const INPUT_KIND_LABELS: Readonly<Record<InputKind, string>> = {
  oneRm: '1RM',
  tm: 'training max',
  fiveRm: '5RM',
  e1rm: 'estimated 1RM',
  workingWeight: 'working weight',
};

export const REFERENCE_VAR_LABELS: Readonly<Record<ReferenceVar, string>> = {
  tm: 'training max',
  top: 'top set',
  fiveRm: '5RM',
  e1rm: 'estimated 1RM',
  workingWeight: 'working weight',
};

const OPTION_LABELS: Readonly<Record<string, string>> = {
  rampStep: 'Ramp step',
  supplemental: 'Supplemental work',
  bbbPct: 'BBB weight',
  bbbProgression: 'BBB progression',
  tmPct: 'Training max percentage',
  tmReset: 'Training max reset',
};

const OPTION_VALUE_LABELS: Readonly<Record<string, string>> = {
  none: 'None',
  bbb: 'Boring But Big',
  fsl: 'First Set Last',
  standard: 'Standard',
  beginner: 'Beginner',
};

const CATALOG_KEYS_BY_LIFT: Readonly<Record<string, string>> = {
  squat: 'back_squat',
  bench: 'barbell_bench_press',
  row: 'barbell_row',
  press: 'overhead_press',
  deadlift: 'deadlift',
  dip: 'weighted_dip',
  curl: 'barbell_curl',
  triceps: 'skull_crusher',
};

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function inputKindLabel(kind: InputKind): string {
  return capitalised(INPUT_KIND_LABELS[kind]);
}

export function shownReference(value: number): number {
  return roundTo(SHOWN_REFERENCE_DECIMALS, value);
}

export function pctLabel(fraction: number): string {
  return `${roundTo(4, fraction * 100)}%`;
}

export function liftName(definition: ProgramDefinition, lift: string): string {
  return definition.lifts.find((candidate) => candidate.key === lift)?.name ?? lift;
}

export function referenceValueProblem(label: string, raw: string | undefined): string | null {
  const text = (raw ?? '').trim();
  if (text === '') return `Enter ${label}`;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 && value <= MAX_REFERENCE_VALUE
    ? null
    : `${label} must be above 0 and at most ${MAX_REFERENCE_VALUE}`;
}

function entryOf(row: ProgramTemplateRow): TemplateListEntry {
  const { key, version, name } = row;
  const parsed = parseProgramDefinition(row.definition);
  if (parsed.kind === 'ok') return { kind: 'enrollable', key, version, name, definition: parsed.definition };
  if (parsed.kind === 'unsupported') return { kind: 'needs_update', key, version, name, message: UPDATE_APP_TEXT };
  return { kind: 'unusable', key, version, name, message: UNUSABLE_TEMPLATE_TEXT };
}

export function templateListEntries(rows: readonly ProgramTemplateRow[]): TemplateListEntry[] {
  const latest = new Map<string, ProgramTemplateRow>();
  for (const row of rows) {
    const kept = latest.get(row.key);
    if (!kept || row.version > kept.version) latest.set(row.key, row);
  }
  return [...latest.values()].map(entryOf).sort((a, b) => a.name.localeCompare(b.name));
}

export function defaultBindings(
  definition: ProgramDefinition,
  exercises: readonly BindableExercise[],
): Record<string, string | null> {
  return Object.fromEntries(
    definition.lifts.map((lift) => {
      const catalogKey = CATALOG_KEYS_BY_LIFT[lift.key];
      const match = exercises.find((exercise) => exercise.key === catalogKey && !exercise.archived);
      return [lift.key, catalogKey && match ? match.id : null];
    }),
  );
}

function optionDefaults(definition: ProgramDefinition): Record<string, OptionValue> {
  return Object.fromEntries(definition.options.map((option) => [option.key, option.default]));
}

function inputLifts(definition: ProgramDefinition): { lift: string; kinds: InputKind[] }[] {
  return definition.inputs.flatMap((input) => input.lifts.map((lift) => ({ lift, kinds: input.kinds })));
}

export function initialEnrollForm(
  definition: ProgramDefinition,
  unit: WeightUnit,
  exercises: readonly BindableExercise[],
): EnrollForm {
  const lifts = inputLifts(definition);
  return {
    unit,
    inputKinds: Object.fromEntries(lifts.map(({ lift, kinds }) => [lift, kinds[0]])),
    inputValues: Object.fromEntries(lifts.map(({ lift }) => [lift, ''])),
    options: optionDefaults(definition),
    bindings: defaultBindings(definition, exercises),
    rounding: { ...DEFAULT_ROUNDING[unit] },
  };
}

export function withUnit(form: EnrollForm, unit: WeightUnit): EnrollForm {
  return { ...form, unit, rounding: { ...DEFAULT_ROUNDING[unit] } };
}

export function inputFields(definition: ProgramDefinition, form: EnrollForm): InputField[] {
  return inputLifts(definition).map(({ lift, kinds }) => {
    const kind = form.inputKinds[lift] ?? kinds[0];
    return {
      lift,
      kind,
      kinds,
      label: `${liftName(definition, lift)} ${INPUT_KIND_LABELS[kind]} (${form.unit})`,
      unit: form.unit,
    };
  });
}

function choiceLabel(value: OptionValue): string {
  if (typeof value === 'number') return pctLabel(value);
  return OPTION_VALUE_LABELS[value] ?? value;
}

function optionControl(option: OptionDecl): OptionControl {
  const label = OPTION_LABELS[option.key] ?? option.key;
  if (option.kind === 'number') {
    return { kind: 'number', key: option.key, label, min: option.min, max: option.max, defaultValue: option.default };
  }
  return {
    kind: 'choice',
    key: option.key,
    label,
    choices: option.values.map((value) => ({ value, label: choiceLabel(value) })),
    defaultValue: option.default,
  };
}

export function optionControls(definition: ProgramDefinition): OptionControl[] {
  return definition.options.map(optionControl);
}

function previewedValue(definition: ProgramDefinition, form: EnrollForm, lift: string, value: number) {
  const initial = definition.initial.find((candidate) => candidate.from === form.inputKinds[lift]);
  if (!initial || initial.kind === 'copy') return null;
  const factor =
    initial.kind === 'scale'
      ? evaluateNumber(initial.factor, { definition, options: form.options, cycle: 1 })
      : initial.factor ** (initial.peakWeek - 1);
  return { variable: initial.var, value: value * factor };
}

export function referencePreview(definition: ProgramDefinition, form: EnrollForm, lift: string): string | null {
  const raw = (form.inputValues[lift] ?? '').trim();
  const value = Number(raw);
  if (raw === '' || !Number.isFinite(value) || value <= 0) return null;
  const preview = previewedValue(definition, form, lift, value);
  if (!preview) return null;
  return `${capitalised(REFERENCE_VAR_LABELS[preview.variable])} ${shownReference(preview.value)} ${form.unit}`;
}

export function enrollPayload(definition: ProgramDefinition, form: EnrollForm): EnrollPayloadResult {
  const problems: string[] = [];
  const inputs: Record<string, Partial<Record<InputKind, number>>> = {};
  for (const field of inputFields(definition, form)) {
    const raw = form.inputValues[field.lift];
    const problem = referenceValueProblem(field.label, raw);
    if (problem) problems.push(problem);
    else inputs[field.lift] = { [field.kind]: Number((raw ?? '').trim()) };
  }
  if (problems.length > 0) return { kind: 'invalid', problems };
  return {
    kind: 'ok',
    payload: {
      templateKey: definition.key,
      templateVersion: definition.version,
      unit: form.unit,
      options: { ...form.options },
      bindings: { ...form.bindings },
      inputs,
      rounding: { increment: form.rounding.increment, mode: form.rounding.mode, barWeight: form.rounding.barWeight },
    },
  };
}
