import { type RoundingSetting } from './load-rounding.ts';
import { type UnitAmount, type WeightUnit } from './units.ts';

export type InputKind = 'oneRm' | 'tm' | 'fiveRm' | 'e1rm' | 'workingWeight';

export type ReferenceVar = 'tm' | 'top' | 'fiveRm' | 'e1rm' | 'workingWeight';

export type LiftCategory = 'upper' | 'lower';

export type SlotRole = 'main' | 'supplemental' | 'assistance';

export type OptionValue = string | number;

export interface LiftDecl {
  key: string;
  name: string;
  category?: LiftCategory;
}

export interface InputDecl {
  lifts: string[];
  kinds: InputKind[];
}

export interface ChoiceOptionDecl {
  key: string;
  kind: 'choice';
  values: OptionValue[];
  default: OptionValue;
  source: string[];
}

export interface NumberOptionDecl {
  key: string;
  kind: 'number';
  min: number;
  max: number;
  default: number;
  source: string[];
}

export type OptionDecl = ChoiceOptionDecl | NumberOptionDecl;

export interface OptionCondition {
  option: string;
  equals: OptionValue;
}

export type NumberExpr = number | { option: string } | { byCycle: number[] };

export type UnitAmountExpr = UnitAmount | { option: string; cases: Readonly<Record<string, UnitAmount>> };

export interface Conversion {
  lb: number;
  kg: number;
  note: string;
}

export interface CopyInitial {
  kind: 'copy';
  var: ReferenceVar;
  from: InputKind;
}

export interface ScaleInitial {
  kind: 'scale';
  var: ReferenceVar;
  from: InputKind;
  factor: NumberExpr;
}

export interface OnRampInitial {
  kind: 'onRamp';
  var: ReferenceVar;
  from: InputKind;
  factor: number;
  peakWeek: number;
}

export type InitialExpression = CopyInitial | ScaleInitial | OnRampInitial;

export interface PctLoad {
  kind: 'pct';
  pct: NumberExpr;
  of: ReferenceVar;
}

export interface RampLoad {
  kind: 'ramp';
  step: NumberExpr;
  count: number;
  of: ReferenceVar;
}

export interface SameAsLoad {
  kind: 'sameAs';
  ref: string;
}

export interface WeekTablePctLoad {
  kind: 'weekTablePct';
  table: string;
  set: number;
  of: ReferenceVar;
}

export interface LastLoggedLoad {
  kind: 'lastLogged';
}

export interface PctOfSetLoad {
  kind: 'pctOfSet';
  ref: string;
  pct: NumberExpr;
}

export interface PctOfSlotLoad {
  kind: 'pctOfSlot';
  day: string;
  slot: string;
  idx: number;
  pct: NumberExpr;
}

export interface RpeLoad {
  kind: 'rpeLoad';
  reps: number;
  rpe: number;
  of: ReferenceVar;
}

export interface CumulativeAddOnLoad {
  kind: 'cumulativeAddOn';
  pct: NumberExpr;
  of: ReferenceVar;
  byWeek: UnitAmount[];
}

export type Load =
  | PctLoad
  | RampLoad
  | SameAsLoad
  | WeekTablePctLoad
  | LastLoggedLoad
  | PctOfSetLoad
  | PctOfSlotLoad
  | RpeLoad
  | CumulativeAddOnLoad;

export interface SetSpec {
  reps: number | null;
  maxReps?: number;
  load: Load;
  amrap?: boolean;
  minReps?: number;
  optional?: boolean;
}

export interface SetListScheme {
  kind: 'sets';
  sets: SetSpec[];
}

export interface RepeatScheme {
  kind: 'repeat';
  count: NumberExpr;
  reps: number | null;
  maxReps?: number;
  load: Load;
  amrapLast?: boolean;
  minReps?: number;
  optional?: boolean;
}

export interface WeekTableScheme {
  kind: 'weekTable';
  table: string;
  of: ReferenceVar;
}

export interface StageDecl {
  sets: number;
  reps: number;
  amrapLast: boolean;
}

export interface StageScheme {
  kind: 'stages';
  stages: StageDecl[];
  load: Load;
}

export type SetScheme = SetListScheme | RepeatScheme | WeekTableScheme | StageScheme;

export interface WeekTableSet {
  pct: number;
  reps: number;
  amrap?: boolean;
  minReps?: number;
}

export interface WeekTableRow {
  sets: WeekTableSet[];
}

export interface SlotDecl {
  id: string;
  lift: string;
  role: SlotRole;
  scheme: SetScheme;
  when?: OptionCondition[];
  weeks?: number[];
}

export interface DayDecl {
  key: string;
  name: string;
  optional?: boolean;
  slots: SlotDecl[];
}

export interface CycleSchedule {
  kind: 'cycle';
  weeksPerCycle: number;
  waveWeeks?: number;
  days: DayDecl[];
}

export interface WeeklySchedule {
  kind: 'weekly';
  days: DayDecl[];
}

export interface RotationSchedule {
  kind: 'rotation';
  days: DayDecl[];
}

export type Schedule = CycleSchedule | WeeklySchedule | RotationSchedule;

export type ProgressionTrigger = 'afterSession' | 'endOfWeek' | 'endOfCycle' | 'endOfWave';

export interface IncrementByAmount {
  kind: 'increment';
  by: UnitAmountExpr;
}

export interface IncrementByPct {
  kind: 'increment';
  byPct: NumberExpr;
}

export interface HoldAdjustment {
  kind: 'hold';
}

export interface TmResetAdjustment {
  kind: 'tmReset';
  pct: NumberExpr;
}

export interface FailureCounterAdjustment {
  kind: 'failureCounter';
  threshold: number;
  deloadPct: NumberExpr;
}

export type StageLastFail = { kind: 'retest'; pct: number } | { kind: 'resetToFirstStage'; add: UnitAmount };

export interface StageMachineAdjustment {
  kind: 'stageMachine';
  onLastFail: StageLastFail;
}

export interface AmrapThresholdAdjustment {
  kind: 'amrapThreshold';
  setIndex: number;
  reps: number;
}

export interface AmrapTableAdjustment {
  kind: 'amrapTable';
  setIndex: number;
  bands: [number, UnitAmount][];
}

export interface RepsOverStandardAdjustment {
  kind: 'repsOverStandard';
  setIndex: number;
  standardByWave: number[];
  perRep: UnitAmountExpr;
  cap: number;
}

export interface E1rmFromSetAdjustment {
  kind: 'e1rmFromSet';
  setIndex: number;
}

export interface CustomRuleAdjustment {
  kind: 'customRule';
  name: string;
}

export type Adjustment =
  | IncrementByAmount
  | IncrementByPct
  | HoldAdjustment
  | TmResetAdjustment
  | FailureCounterAdjustment
  | StageMachineAdjustment
  | AmrapThresholdAdjustment
  | AmrapTableAdjustment
  | RepsOverStandardAdjustment
  | E1rmFromSetAdjustment
  | CustomRuleAdjustment;

export interface ProgressionRule {
  lift: string;
  var: ReferenceVar;
  trigger: ProgressionTrigger;
  judgedSlots: string[];
  judgedWeeks?: number[];
  onMet: Adjustment[];
  onMiss: Adjustment[];
  always?: Adjustment[];
}

export interface ProgramDefinition {
  key: string;
  version: number;
  name: string;
  source: string[];
  lifts: LiftDecl[];
  inputs: InputDecl[];
  referenceVars: ReferenceVar[];
  initial: InitialExpression[];
  options: OptionDecl[];
  conversions?: Conversion[];
  weekTables?: Readonly<Record<string, WeekTableRow[]>>;
  schedule: Schedule;
  progression: ProgressionRule[];
}

export type ProgramReferences = Readonly<Record<string, Readonly<Partial<Record<ReferenceVar, number>>>>>;

export type EnrollmentInputs = Readonly<Record<string, Readonly<Partial<Record<InputKind, number>>>>>;

export interface ProgramEnrollment {
  id: string;
  unit: WeightUnit;
  options: Readonly<Record<string, OptionValue>>;
  bindings: Readonly<Record<string, string | null>>;
  inputs: EnrollmentInputs;
  rounding: RoundingSetting;
}

export type ParsedProgramDefinition =
  | { kind: 'ok'; definition: ProgramDefinition }
  | { kind: 'unsupported'; unknownKinds: string[] }
  | { kind: 'invalid'; errors: string[] };

export interface NumberContext {
  definition: ProgramDefinition;
  options: Readonly<Record<string, OptionValue>>;
  cycle: number;
}

export function optionValue(
  definition: ProgramDefinition,
  options: Readonly<Record<string, OptionValue>>,
  key: string,
): OptionValue | undefined {
  return options[key] ?? definition.options.find((option) => option.key === key)?.default;
}

export function evaluateNumber(expr: NumberExpr, context: NumberContext): number {
  if (typeof expr === 'number') return expr;
  if ('option' in expr) return Number(optionValue(context.definition, context.options, expr.option));
  const values = expr.byCycle;
  return values[Math.min(Math.max(context.cycle, 1), values.length) - 1];
}

export function evaluateAmount(expr: UnitAmountExpr, unit: WeightUnit, context: NumberContext): number {
  if ('kg' in expr) return expr[unit];
  const chosen = optionValue(context.definition, context.options, expr.option);
  return expr.cases[String(chosen)][unit];
}

export interface SetRef {
  slotId: string;
  index: number;
}

export function parseSetRef(ref: string): SetRef | null {
  const separator = ref.lastIndexOf(':');
  if (separator <= 0) return null;
  const index = Number(ref.slice(separator + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  return { slotId: ref.slice(0, separator), index };
}

export function findSlot(definition: ProgramDefinition, slotId: string): SlotDecl | undefined {
  for (const day of definition.schedule.days) {
    const slot = day.slots.find((candidate) => candidate.id === slotId);
    if (slot) return slot;
  }
  return undefined;
}

export const SCHEDULE_KINDS: readonly string[] = ['cycle', 'weekly', 'rotation'];
export const SCHEME_KINDS: readonly string[] = ['sets', 'repeat', 'weekTable', 'stages'];
export const LOAD_KINDS: readonly string[] = [
  'pct',
  'ramp',
  'sameAs',
  'weekTablePct',
  'lastLogged',
  'pctOfSet',
  'pctOfSlot',
  'rpeLoad',
  'cumulativeAddOn',
];
export const ADJUSTMENT_KINDS: readonly string[] = [
  'increment',
  'hold',
  'tmReset',
  'failureCounter',
  'stageMachine',
  'amrapThreshold',
  'amrapTable',
  'repsOverStandard',
  'e1rmFromSet',
  'customRule',
];
const INITIAL_KINDS: readonly string[] = ['copy', 'scale', 'onRamp'];
const OPTION_KINDS: readonly string[] = ['choice', 'number'];

function knownSetCount(definition: ProgramDefinition, scheme: SetScheme): number | null {
  switch (scheme.kind) {
    case 'sets':
      return scheme.sets.length;
    case 'repeat':
      return typeof scheme.count === 'number' ? scheme.count : null;
    case 'weekTable': {
      const rows = definition.weekTables?.[scheme.table];
      return rows && rows.length > 0 ? Math.min(...rows.map((row) => row.sets.length)) : null;
    }
    case 'stages':
      return scheme.stages.length > 0 ? Math.max(...scheme.stages.map((stage) => stage.sets)) : null;
    default:
      return null;
  }
}

function schemeLoads(scheme: SetScheme): Load[] {
  switch (scheme.kind) {
    case 'sets':
      return scheme.sets.map((set) => set.load);
    case 'repeat':
    case 'stages':
      return [scheme.load];
    default:
      return [];
  }
}

class DefinitionChecker {
  readonly errors: string[] = [];
  private readonly lifts: Set<string>;
  private readonly vars: Set<string>;
  private readonly options: Set<string>;
  private readonly slots = new Map<string, SlotDecl>();
  private readonly dayKeys = new Set<string>();

  constructor(private readonly definition: ProgramDefinition) {
    this.lifts = new Set(definition.lifts.map((lift) => lift.key));
    this.vars = new Set(definition.referenceVars);
    this.options = new Set(definition.options.map((option) => option.key));
  }

  run(): string[] {
    this.checkOptions();
    this.checkInputs();
    this.checkInitial();
    this.collectDaysAndSlots();
    this.checkWeekTables();
    for (const slot of this.slots.values()) this.checkSlot(slot);
    this.definition.progression.forEach((rule, index) => this.checkRule(rule, index));
    return this.errors;
  }

  private checkOptions() {
    const seen = new Set<string>();
    for (const option of this.definition.options) {
      if (seen.has(option.key)) this.errors.push(`duplicate option '${option.key}'`);
      seen.add(option.key);
      if (option.kind === 'choice' && !option.values.includes(option.default)) {
        this.errors.push(`option '${option.key}' default ${String(option.default)} is not one of its values`);
      }
      if (option.kind === 'number' && (option.default < option.min || option.default > option.max)) {
        this.errors.push(`option '${option.key}' default ${option.default} is outside ${option.min}–${option.max}`);
      }
    }
  }

  private checkInputs() {
    for (const input of this.definition.inputs) {
      for (const lift of input.lifts) this.checkLift(lift, 'input');
    }
  }

  private checkInitial() {
    for (const initial of this.definition.initial) {
      this.checkVar(initial.var, `initial ${initial.kind} expression`);
      if (initial.kind === 'scale') this.checkNumber(initial.factor, `initial ${initial.var} factor`);
    }
  }

  private collectDaysAndSlots() {
    for (const day of this.definition.schedule.days) {
      if (this.dayKeys.has(day.key)) this.errors.push(`duplicate day key '${day.key}'`);
      this.dayKeys.add(day.key);
      for (const slot of day.slots) {
        if (this.slots.has(slot.id)) this.errors.push(`duplicate slot id '${slot.id}'`);
        else this.slots.set(slot.id, slot);
      }
    }
  }

  private checkWeekTables() {
    const schedule = this.definition.schedule;
    if (schedule.kind !== 'cycle') return;
    for (const [name, rows] of Object.entries(this.definition.weekTables ?? {})) {
      if (rows.length < schedule.weeksPerCycle) {
        this.errors.push(
          `week table '${name}' has ${rows.length} rows but the cycle has ${schedule.weeksPerCycle} weeks`,
        );
      }
    }
  }

  private checkSlot(slot: SlotDecl) {
    const where = `slot '${slot.id}'`;
    this.checkLift(slot.lift, where);
    for (const condition of slot.when ?? []) this.checkOption(condition.option, `${where} condition`);
    const scheme = slot.scheme;
    if (scheme.kind === 'weekTable') {
      this.checkTable(scheme.table, where);
      this.checkVar(scheme.of, where);
    }
    if (scheme.kind === 'repeat') this.checkNumber(scheme.count, `${where} count`);
    for (const load of schemeLoads(scheme)) this.checkLoad(load, where);
  }

  private checkLoad(load: Load, where: string) {
    switch (load.kind) {
      case 'pct':
        this.checkNumber(load.pct, where);
        this.checkVar(load.of, where);
        return;
      case 'ramp':
        this.checkNumber(load.step, where);
        this.checkVar(load.of, where);
        return;
      case 'sameAs':
        this.checkSetRef(load.ref, where);
        return;
      case 'weekTablePct':
        this.checkTable(load.table, where);
        this.checkVar(load.of, where);
        return;
      case 'pctOfSet':
        this.checkSetRef(load.ref, where);
        this.checkNumber(load.pct, where);
        return;
      case 'pctOfSlot':
        this.checkPctOfSlot(load, where);
        return;
      case 'rpeLoad':
        this.checkVar(load.of, where);
        return;
      case 'cumulativeAddOn':
        this.checkNumber(load.pct, where);
        this.checkVar(load.of, where);
        return;
      default:
        return;
    }
  }

  private checkPctOfSlot(load: PctOfSlotLoad, where: string) {
    this.checkNumber(load.pct, where);
    const day = this.definition.schedule.days.find((candidate) => candidate.key === load.day);
    if (!day) {
      this.errors.push(`${where} refers to unknown day '${load.day}'`);
      return;
    }
    const slot = day.slots.find((candidate) => candidate.id === load.slot);
    if (!slot) {
      this.errors.push(`${where} refers to slot '${load.slot}', which is not on day '${load.day}'`);
      return;
    }
    this.checkSetIndex(slot, load.idx, `${load.slot}:${load.idx}`, where);
  }

  private checkSetRef(ref: string, where: string) {
    const parsed = parseSetRef(ref);
    const slot = parsed ? this.slots.get(parsed.slotId) : undefined;
    if (!parsed || !slot) {
      this.errors.push(`${where} refers to unknown set '${ref}'`);
      return;
    }
    this.checkSetIndex(slot, parsed.index, ref, where);
  }

  private checkSetIndex(slot: SlotDecl, index: number, ref: string, where: string) {
    const count = knownSetCount(this.definition, slot.scheme);
    if (count !== null && index >= count) {
      this.errors.push(`${where} refers to set '${ref}', but slot '${slot.id}' has ${count} sets`);
    }
  }

  private checkRule(rule: ProgressionRule, index: number) {
    const where = `progression rule ${index + 1} (${rule.lift})`;
    this.checkLift(rule.lift, where);
    this.checkVar(rule.var, where);
    for (const slotId of rule.judgedSlots) {
      if (!this.slots.has(slotId)) this.errors.push(`${where} judges unknown slot '${slotId}'`);
    }
    for (const adjustment of [...rule.onMet, ...rule.onMiss, ...(rule.always ?? [])]) {
      this.checkAdjustment(adjustment, where);
    }
  }

  private checkAdjustment(adjustment: Adjustment, where: string) {
    switch (adjustment.kind) {
      case 'increment':
        if ('byPct' in adjustment) this.checkNumber(adjustment.byPct, where);
        else this.checkAmount(adjustment.by, where);
        return;
      case 'tmReset':
        this.checkNumber(adjustment.pct, where);
        return;
      case 'failureCounter':
        this.checkNumber(adjustment.deloadPct, where);
        return;
      case 'repsOverStandard':
        this.checkAmount(adjustment.perRep, where);
        return;
      default:
        return;
    }
  }

  private checkLift(lift: string, where: string) {
    if (!this.lifts.has(lift)) this.errors.push(`${where} uses undeclared lift '${lift}'`);
  }

  private checkVar(variable: string, where: string) {
    if (!this.vars.has(variable)) this.errors.push(`${where} uses undeclared reference var '${variable}'`);
  }

  private checkTable(table: string, where: string) {
    if (!this.definition.weekTables?.[table]) this.errors.push(`${where} uses unknown week table '${table}'`);
  }

  private checkOption(option: string, where: string) {
    if (!this.options.has(option)) this.errors.push(`${where} uses unknown option '${option}'`);
  }

  private checkNumber(expr: NumberExpr, where: string) {
    if (typeof expr === 'object' && expr !== null && 'option' in expr) this.checkOption(expr.option, where);
  }

  private checkAmount(expr: UnitAmountExpr, where: string) {
    if ('option' in expr) this.checkOption(expr.option, where);
  }
}

export function validateProgramDefinition(definition: ProgramDefinition): string[] {
  return new DefinitionChecker(definition).run();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function kindOf(value: unknown): string | null {
  return isRecord(value) && typeof value.kind === 'string' ? value.kind : null;
}

function arrayOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function shapeErrors(json: unknown): string[] {
  if (!isRecord(json)) return ['a program definition must be an object'];
  const errors: string[] = [];
  for (const field of ['key', 'name']) {
    if (typeof json[field] !== 'string') errors.push(`'${field}' must be a string`);
  }
  if (typeof json.version !== 'number') errors.push(`'version' must be a number`);
  for (const field of ['source', 'lifts', 'inputs', 'referenceVars', 'initial', 'options', 'progression']) {
    if (!Array.isArray(json[field])) errors.push(`'${field}' must be an array`);
  }
  const schedule = json.schedule;
  if (!isRecord(schedule) || !Array.isArray(schedule.days)) {
    errors.push(`'schedule' must be an object with a 'days' array`);
    return errors;
  }
  for (const day of schedule.days) {
    if (!isRecord(day) || typeof day.key !== 'string' || !Array.isArray(day.slots)) {
      errors.push('every day needs a string key and a slots array');
      continue;
    }
    for (const slot of day.slots) {
      if (!isRecord(slot) || typeof slot.id !== 'string' || !isRecord(slot.scheme)) {
        errors.push(`every slot on day '${day.key}' needs a string id and a scheme object`);
      }
    }
  }
  for (const rule of arrayOf(json.progression)) {
    if (
      !isRecord(rule) ||
      !Array.isArray(rule.judgedSlots) ||
      !Array.isArray(rule.onMet) ||
      !Array.isArray(rule.onMiss)
    ) {
      errors.push('every progression rule needs judgedSlots, onMet and onMiss arrays');
    }
  }
  return errors;
}

function unknownKindsIn(json: Record<string, unknown>): string[] {
  const unknown = new Set<string>();
  const note = (kind: string | null, known: readonly string[]) => {
    if (kind !== null && !known.includes(kind)) unknown.add(kind);
    return kind !== null && known.includes(kind);
  };
  const schedule = json.schedule as Record<string, unknown>;
  note(kindOf(schedule), SCHEDULE_KINDS);
  for (const initial of arrayOf(json.initial)) note(kindOf(initial), INITIAL_KINDS);
  for (const option of arrayOf(json.options)) note(kindOf(option), OPTION_KINDS);
  for (const day of arrayOf(schedule.days)) {
    for (const slot of arrayOf((day as Record<string, unknown>).slots)) {
      const scheme = (slot as Record<string, unknown>).scheme as Record<string, unknown>;
      if (!note(kindOf(scheme), SCHEME_KINDS)) continue;
      const loads =
        scheme.kind === 'sets' ? arrayOf(scheme.sets).map((set) => isRecord(set) && set.load) : [scheme.load];
      for (const load of loads) {
        if (scheme.kind !== 'weekTable') note(kindOf(load) ?? 'missing load', LOAD_KINDS);
      }
    }
  }
  for (const rule of arrayOf(json.progression)) {
    const record = rule as Record<string, unknown>;
    for (const adjustment of [...arrayOf(record.onMet), ...arrayOf(record.onMiss), ...arrayOf(record.always)]) {
      note(kindOf(adjustment), ADJUSTMENT_KINDS);
    }
  }
  return [...unknown];
}

export function parseProgramDefinition(json: unknown): ParsedProgramDefinition {
  const errors = shapeErrors(json);
  if (errors.length > 0 || !isRecord(json)) return { kind: 'invalid', errors };
  const unknownKinds = unknownKindsIn(json);
  if (unknownKinds.length > 0) return { kind: 'unsupported', unknownKinds };
  const definition = json as unknown as ProgramDefinition;
  const semanticErrors = validateProgramDefinition(definition);
  if (semanticErrors.length > 0) return { kind: 'invalid', errors: semanticErrors };
  return { kind: 'ok', definition };
}

export const validateEnrollment: (definition: ProgramDefinition, enrollment: ProgramEnrollment) => string[] = () => {
  throw new Error('not implemented');
};
