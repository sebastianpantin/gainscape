import { evaluateNumber } from '@domain/program-eval.ts';
import { z } from 'zod';
import {
  DEFAULT_ROUNDING,
  type InputKind,
  MAX_REFERENCE_VALUE,
  type OptionDecl,
  type OptionValue,
  parseProgramDefinition,
  type ProgramDefinition,
  type ReferenceVar,
  type RoundingSetting,
  roundTo,
  type WeightUnit,
} from '@domain/index.ts';
import { formatCount } from '../format.ts';
import { capitalized } from '../names.ts';

export const UPDATE_APP_TEXT = 'Update the app to use this program';

const UNUSABLE_TEMPLATE_TEXT = "This program can't be used right now";

export const PROGRAM_TEMPLATE_COLUMNS = 'key, version, name, definition, owner_user_id';

export const programTemplateRowSchema = z.object({
  key: z.string(),
  version: z.number(),
  name: z.string(),
  definition: z.unknown(),
  owner_user_id: z.string().nullable().optional(),
});

export type ProgramTemplateRow = z.infer<typeof programTemplateRowSchema>;

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
  roundingText?: Readonly<{ increment: string; barWeight: string }>;
  optionText?: Readonly<Record<string, string>>;
}

export interface InputField {
  lift: string;
  kind: InputKind;
  kinds: readonly InputKind[];
  label: string;
  unit: WeightUnit;
}

interface OptionChoice {
  value: OptionValue;
  label: string;
}

type OptionControl =
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

type EnrollPayloadResult = { kind: 'ok'; payload: EnrollProgramPayload } | { kind: 'invalid'; problems: string[] };

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
  perRep: 'Per-rep increment',
  pressLift: 'Press',
  backoff: 'Back-off sets',
  fixedBackoffPct: 'Fixed back-off weight',
};

const OPTION_VALUE_LABELS: Readonly<Record<string, string>> = {
  none: 'None',
  bbb: 'Boring But Big',
  fsl: 'First Set Last',
  standard: 'Standard',
  beginner: 'Beginner',
  fine: 'Fine',
  bench: 'Bench press',
  ohp: 'Overhead press',
  fatigue: 'Fatigue',
  fixed: 'Fixed',
};

const CATALOG_KEYS_BY_LIFT: Readonly<Record<string, string>> = {
  squat: 'back_squat',
  bench: 'barbell_bench_press',
  row: 'barbell_row',
  press: 'overhead_press',
  ohp: 'overhead_press',
  deadlift: 'deadlift',
  dip: 'weighted_dip',
  curl: 'barbell_curl',
  triceps: 'skull_crusher',
};

function optionLabel(key: string): string {
  return OPTION_LABELS[key] ?? key;
}

export function inputKindLabel(kind: InputKind): string {
  return capitalized(INPUT_KIND_LABELS[kind]);
}

export function shownReference(value: number): number {
  return roundTo(SHOWN_REFERENCE_DECIMALS, value);
}

export function pctLabel(fraction: number): string {
  return `${roundTo(1, fraction * 100)}%`;
}

export function liftName(definition: ProgramDefinition, lift: string): string {
  return definition.lifts.find((candidate) => candidate.key === lift)?.name ?? lift;
}

export function referenceValueProblem(label: string, raw: string | undefined, unit: WeightUnit): string | null {
  const max = MAX_REFERENCE_VALUE[unit];
  const parsed = parsedNumber(
    label,
    raw ?? '',
    (value) => value > 0 && value <= max,
    `must be above 0 and at most ${max}`,
  );
  return parsed.kind === 'problem' ? parsed.problem : null;
}

function entryOf(row: ProgramTemplateRow): TemplateListEntry {
  const { key, version, name } = row;
  const parsed = parseProgramDefinition(row.definition);
  if (parsed.kind === 'ok') return { kind: 'enrollable', key, version, name, definition: parsed.definition };
  if (parsed.kind === 'unsupported') return { kind: 'needs_update', key, version, name, message: UPDATE_APP_TEXT };
  return { kind: 'unusable', key, version, name, message: UNUSABLE_TEMPLATE_TEXT };
}

const CUSTOM_TEMPLATE_PREFIX = 'custom_';
const CUSTOM_LIFT_PATTERN = /^x_([0-9a-f]{8})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{4})([0-9a-f]{12})$/;

export function customTemplateKey(programId: string): string {
  return `${CUSTOM_TEMPLATE_PREFIX}${programId.replaceAll('-', '')}`;
}

export function customLiftKey(exerciseId: string): string {
  return `x_${exerciseId.replaceAll('-', '')}`;
}

export function isCustomTemplate(row: ProgramTemplateRow): boolean {
  return row.key.startsWith(CUSTOM_TEMPLATE_PREFIX) || (row.owner_user_id ?? null) !== null;
}

function latestRows(rows: readonly ProgramTemplateRow[]): ProgramTemplateRow[] {
  const latest = new Map<string, ProgramTemplateRow>();
  for (const row of rows) {
    const kept = latest.get(row.key);
    if (!kept || row.version > kept.version) latest.set(row.key, row);
  }
  return [...latest.values()];
}

export function templateListEntries(rows: readonly ProgramTemplateRow[]): TemplateListEntry[] {
  return latestRows(rows.filter((row) => !isCustomTemplate(row)))
    .map(entryOf)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function templateScheduleText({ schedule }: ProgramDefinition): string {
  const total = schedule.days.length;
  if (schedule.kind === 'rotation') return `Rotates through ${formatCount(total, 'workout')}`;
  const required = Math.max(1, schedule.days.filter((day) => day.optional !== true).length);
  const days = required === total ? `${formatCount(total, 'day')} a week` : `${required}–${total} days a week`;
  return schedule.kind === 'cycle' ? `${days} · ${schedule.weeksPerCycle}-week cycle` : days;
}

export function templateEntry(rows: readonly ProgramTemplateRow[], key: string): TemplateListEntry | undefined {
  const row = latestRows(rows.filter((candidate) => candidate.key === key))[0];
  return row ? entryOf(row) : undefined;
}

function customLiftExerciseId(lift: string): string | null {
  const parts = CUSTOM_LIFT_PATTERN.exec(lift);
  return parts ? parts.slice(1).join('-') : null;
}

export function bindingSelectLifts(definition: ProgramDefinition): ProgramDefinition['lifts'] {
  return definition.lifts.filter((lift) => customLiftExerciseId(lift.key) === null);
}

interface EnrolledTemplateRef {
  template_key: string;
  template_version: number;
}

export function enrolledTemplate(
  templates: readonly ProgramTemplateRow[],
  enrolled: EnrolledTemplateRef,
): ProgramTemplateRow | undefined {
  return templates.find(
    (candidate) => candidate.key === enrolled.template_key && candidate.version === enrolled.template_version,
  );
}

export function replacedProgramName(
  templates: readonly ProgramTemplateRow[],
  enrolled: EnrolledTemplateRef | null,
): string | null {
  if (enrolled === null) return null;
  return enrolledTemplate(templates, enrolled)?.name ?? 'your current program';
}

function liftOptionKey(lift: string): string {
  return `${lift}Lift`;
}

function catalogKeyOf(lift: string, options: Readonly<Record<string, OptionValue>>): string | undefined {
  const picked = options[liftOptionKey(lift)];
  return CATALOG_KEYS_BY_LIFT[typeof picked === 'string' ? picked : lift];
}

export function defaultBindings(
  definition: ProgramDefinition,
  exercises: readonly BindableExercise[],
  options: Readonly<Record<string, OptionValue>> = optionDefaults(definition),
): Record<string, string | null> {
  return Object.fromEntries(
    definition.lifts.map((lift) => {
      const customExerciseId = customLiftExerciseId(lift.key);
      if (customExerciseId !== null) return [lift.key, customExerciseId];
      const catalogKey = catalogKeyOf(lift.key, options);
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
    roundingText: defaultRoundingText(unit),
    optionText: Object.fromEntries(
      definition.options.flatMap((option) => (option.kind === 'number' ? [[option.key, String(option.default)]] : [])),
    ),
  };
}

function defaultRoundingText(unit: WeightUnit): { increment: string; barWeight: string } {
  const { increment, barWeight } = DEFAULT_ROUNDING[unit];
  return { increment: String(increment), barWeight: String(barWeight) };
}

export function withOption(
  definition: ProgramDefinition,
  form: EnrollForm,
  key: string,
  value: OptionValue,
  exercises: readonly BindableExercise[],
): EnrollForm {
  const options = { ...form.options, [key]: value };
  const before = defaultBindings(definition, exercises, form.options);
  const after = defaultBindings(definition, exercises, options);
  const bindings = { ...form.bindings };
  for (const lift of definition.lifts) {
    if (liftOptionKey(lift.key) === key && form.bindings[lift.key] === before[lift.key]) {
      bindings[lift.key] = after[lift.key];
    }
  }
  return { ...form, options, bindings };
}

function unitOnlyFor(option: OptionDecl, value: OptionValue | undefined): WeightUnit | undefined {
  return option.kind === 'choice' && value !== undefined ? option.onlyForUnit?.[String(value)] : undefined;
}

function isOfferedFor(option: OptionDecl, value: OptionValue | undefined, unit: WeightUnit): boolean {
  const onlyFor = unitOnlyFor(option, value);
  return onlyFor === undefined || onlyFor === unit;
}

export function withUnit(form: EnrollForm, unit: WeightUnit, definition: ProgramDefinition): EnrollForm {
  const options = { ...form.options };
  for (const option of definition.options) {
    if (!isOfferedFor(option, options[option.key], unit)) options[option.key] = option.default;
  }
  return { ...form, unit, options, rounding: { ...DEFAULT_ROUNDING[unit] }, roundingText: defaultRoundingText(unit) };
}

const ROUNDING_INCREMENTS: Readonly<Record<WeightUnit, readonly number[]>> = {
  kg: [0.5, 1, 1.25, 2.5, 5],
  lb: [1, 2.5, 5, 10],
};

export function roundingIncrementLabel(unit: WeightUnit): string {
  return `Round to (${unit})`;
}

export function barWeightLabel(unit: WeightUnit): string {
  return `Bar weight (${unit})`;
}

function listedChoices(values: readonly number[]): string {
  return `${values.slice(0, -1).join(', ')} or ${values[values.length - 1]}`;
}

type ParsedNumber = { kind: 'ok'; value: number } | { kind: 'problem'; problem: string };

function parsedNumber(label: string, raw: string, isAllowed: (value: number) => boolean, rule: string): ParsedNumber {
  const text = raw.trim();
  if (text === '') return { kind: 'problem', problem: `Enter ${label}` };
  const value = Number(text);
  return Number.isFinite(value) && isAllowed(value)
    ? { kind: 'ok', value }
    : { kind: 'problem', problem: `${label} ${rule}` };
}

export function roundingTextOf(form: EnrollForm): { increment: string; barWeight: string } {
  return (
    form.roundingText ?? { increment: String(form.rounding.increment), barWeight: String(form.rounding.barWeight) }
  );
}

function roundingOf(form: EnrollForm): { increment: ParsedNumber; barWeight: ParsedNumber } {
  const text = roundingTextOf(form);
  const increments = ROUNDING_INCREMENTS[form.unit];
  return {
    increment: parsedNumber(
      roundingIncrementLabel(form.unit),
      text.increment,
      (value) => increments.includes(value),
      `must be one of ${listedChoices(increments)}`,
    ),
    barWeight: parsedNumber(barWeightLabel(form.unit), text.barWeight, (value) => value > 0, 'must be above 0'),
  };
}

function numberOptionsOf(definition: ProgramDefinition, form: EnrollForm): Record<string, ParsedNumber> {
  return Object.fromEntries(
    definition.options.flatMap((option) => {
      if (option.kind !== 'number') return [];
      const raw = form.optionText?.[option.key] ?? String(form.options[option.key] ?? option.default);
      const label = optionLabel(option.key);
      const rule = `must be between ${option.min} and ${option.max}`;
      return [[option.key, parsedNumber(label, raw, (value) => value >= option.min && value <= option.max, rule)]];
    }),
  );
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

function optionControl(option: OptionDecl, unit: WeightUnit): OptionControl {
  const label = optionLabel(option.key);
  if (option.kind === 'number') {
    return { kind: 'number', key: option.key, label, min: option.min, max: option.max, defaultValue: option.default };
  }
  return {
    kind: 'choice',
    key: option.key,
    label,
    choices: option.values
      .filter((value) => isOfferedFor(option, value, unit))
      .map((value) => ({ value, label: choiceLabel(value) })),
    defaultValue: option.default,
  };
}

export function optionControls(definition: ProgramDefinition, unit: WeightUnit): OptionControl[] {
  return definition.options.map((option) => optionControl(option, unit));
}

export interface EnrollFieldProblem {
  field: string;
  text: string;
}

export function inputFieldKey(lift: string): string {
  return `input:${lift}`;
}

export function optionFieldKey(optionKey: string): string {
  return `option:${optionKey}`;
}

function unitOptionProblems(definition: ProgramDefinition, form: EnrollForm): EnrollFieldProblem[] {
  return definition.options.flatMap((option) => {
    const value = form.options[option.key];
    const onlyFor = unitOnlyFor(option, value);
    if (value === undefined || onlyFor === undefined || onlyFor === form.unit) return [];
    const label = optionLabel(option.key);
    return [
      {
        field: optionFieldKey(option.key),
        text: `${label}: ${choiceLabel(value).toLowerCase()} is only offered for ${onlyFor} enrollments`,
      },
    ];
  });
}

export function enrollFieldProblems(definition: ProgramDefinition, form: EnrollForm): EnrollFieldProblem[] {
  const problems: EnrollFieldProblem[] = [];
  for (const field of inputFields(definition, form)) {
    const text = referenceValueProblem(field.label, form.inputValues[field.lift], form.unit);
    if (text) problems.push({ field: inputFieldKey(field.lift), text });
  }
  const { increment, barWeight } = roundingOf(form);
  if (increment.kind === 'problem') problems.push({ field: 'increment', text: increment.problem });
  if (barWeight.kind === 'problem') problems.push({ field: 'barWeight', text: barWeight.problem });
  problems.push(...unitOptionProblems(definition, form));
  for (const [key, parsed] of Object.entries(numberOptionsOf(definition, form)))
    if (parsed.kind === 'problem') problems.push({ field: optionFieldKey(key), text: parsed.problem });
  return problems;
}

export function startingWeightHint(fields: readonly InputField[], form: EnrollForm): string | null {
  if (!fields.some((field) => field.kind === 'workingWeight')) return null;
  return `New to a lift? Start with the empty bar: ${roundingTextOf(form).barWeight} ${form.unit}.`;
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
  return `${capitalized(REFERENCE_VAR_LABELS[preview.variable])} ${shownReference(preview.value)} ${form.unit}`;
}

export function enrollPayload(definition: ProgramDefinition, form: EnrollForm): EnrollPayloadResult {
  const problems = enrollFieldProblems(definition, form).map((problem) => problem.text);
  const { increment, barWeight } = roundingOf(form);
  if (problems.length > 0 || increment.kind === 'problem' || barWeight.kind === 'problem') {
    return { kind: 'invalid', problems };
  }
  const inputs: Record<string, Partial<Record<InputKind, number>>> = {};
  for (const field of inputFields(definition, form))
    inputs[field.lift] = { [field.kind]: Number((form.inputValues[field.lift] ?? '').trim()) };
  const options: Record<string, OptionValue> = { ...form.options };
  for (const [key, parsed] of Object.entries(numberOptionsOf(definition, form)))
    if (parsed.kind === 'ok') options[key] = parsed.value;
  return {
    kind: 'ok',
    payload: {
      templateKey: definition.key,
      templateVersion: definition.version,
      unit: form.unit,
      options,
      bindings: { ...form.bindings },
      inputs,
      rounding: { increment: increment.value, mode: form.rounding.mode, barWeight: barWeight.value },
    },
  };
}
