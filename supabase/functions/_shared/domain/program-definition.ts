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

export const validateProgramDefinition: (definition: ProgramDefinition) => string[] = () => {
  throw new Error('not implemented');
};

export const parseProgramDefinition: (json: unknown) => ParsedProgramDefinition = () => {
  throw new Error('not implemented');
};
