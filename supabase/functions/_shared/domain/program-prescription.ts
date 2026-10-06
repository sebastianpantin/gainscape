import { roundPrescribedLoad } from './load-rounding.ts';
import { roundTo } from './math.ts';
import {
  evaluateAmount,
  evaluateNumber,
  findSlot,
  type Load,
  type NumberContext,
  type NumberExpr,
  optionValue,
  parseSetRef,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramReferences,
  type ReferenceVar,
  type SlotDecl,
  type SlotRole,
  type StageDecl,
  type StageScheme,
  stageRetestOf,
} from './program-definition.ts';
import { dayOf, isCyclePosition, isRotationPosition, type Position, positionAt } from './program-schedule.ts';
import { rpeChartPct } from './rpe-chart.ts';
import { shownWeight, unitToKg } from './units.ts';

export interface PrescriptionSnapshot {
  ref: string;
  weightKg: number;
  reps: number;
  minReps: number | null;
  amrap: boolean;
}

export interface PrescribedSet {
  ref: string;
  weight: number | null;
  weightKg: number | null;
  pct: number | null;
  reps: number | null;
  maxReps: number | null;
  minReps: number | null;
  amrap: boolean;
  optional: boolean;
  suggestedWeightKg?: number | null;
  snapshot: PrescriptionSnapshot | null;
}

export interface PrescribedExercise {
  kind: 'exercise';
  slotId: string;
  lift: string;
  exerciseId: string;
  role: SlotRole;
  sets: PrescribedSet[];
}

export interface UnsupportedPrescription {
  kind: 'unsupported';
  slotId: string;
  lift: string;
  primitive: string;
}

export type ResolvedSlot = PrescribedExercise | UnsupportedPrescription;

export type LastLoggedWeights = Readonly<Record<string, number>>;

export type StageIndices = Readonly<Record<string, number>>;

type PendingRetests = Readonly<Record<string, ReferenceVar>>;

export interface ReferenceState {
  refs: ProgramReferences;
  stages?: StageIndices;
  pendingRetests?: PendingRetests;
}

export const RETEST_REPS = 5;
const RETEST_REF_SUFFIX = ':retest';

export function retestRefOf(slotId: string): string {
  return `${slotId}${RETEST_REF_SUFFIX}`;
}

export function isRetestRef(ref: string): boolean {
  return ref.endsWith(RETEST_REF_SUFFIX);
}

function isRetestDue(
  definition: ProgramDefinition,
  slot: SlotDecl,
  pendingRetests: PendingRetests | undefined,
): boolean {
  const pending = pendingRetests?.[slot.lift];
  if (pending === undefined) return false;
  return definition.progression.some(
    (rule) => rule.lift === slot.lift && rule.judgedSlots.includes(slot.id) && stageRetestOf(rule)?.from === pending,
  );
}

function retestSet(slotId: string, suggestedWeightKg: number | null): PrescribedSet {
  const ref = retestRefOf(slotId);
  return {
    ref,
    weight: null,
    weightKg: null,
    pct: null,
    reps: RETEST_REPS,
    maxReps: null,
    minReps: null,
    amrap: false,
    optional: false,
    suggestedWeightKg,
    snapshot: { ref, weightKg: 0, reps: RETEST_REPS, minReps: null, amrap: false },
  };
}

const RAMP_PCT_DECIMALS = 6;
const MAX_REFERENCE_DEPTH = 8;

interface WeekContext {
  week: number;
  cycle: number;
}

export function weekContextOf(position: Position): WeekContext {
  if (isRotationPosition(position)) return { week: 1, cycle: 1 };
  return { week: position.week, cycle: isCyclePosition(position) ? position.cycle : 1 };
}

export function numberContext(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  position: Position,
): NumberContext {
  return { definition, options: enrollment.options, cycle: weekContextOf(position).cycle };
}

export function isSlotActive(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  slot: SlotDecl,
  position: Position,
): boolean {
  if (!enrollment.bindings[slot.lift]) return false;
  if (slot.weeks && !slot.weeks.includes(weekContextOf(position).week)) return false;
  return (slot.when ?? []).every(
    (condition) => optionValue(definition, enrollment.options, condition.option) === condition.equals,
  );
}

interface SetShape {
  reps: number | null;
  maxReps: number | null;
  load: Load;
  amrap: boolean;
  minReps: number | null;
  optional: boolean;
}

type ShapesResult = { kind: 'shapes'; shapes: SetShape[] } | { kind: 'unsupported'; primitive: string };

function minRepsFor(amrap: boolean, minReps: number | undefined, reps: number | null): number | null {
  return amrap ? (minReps ?? reps) : null;
}

export function stageIndexOf(scheme: StageScheme, stages: StageIndices | undefined, lift: string): number {
  return Math.min(Math.max(stages?.[lift] ?? 0, 0), scheme.stages.length - 1);
}

function matchesStage(stage: StageDecl, snapshot: PrescriptionSnapshot): boolean {
  const index = parseSetRef(snapshot.ref)?.index ?? -1;
  const amrap = stage.amrapLast && index === stage.sets - 1;
  return (
    index >= 0 &&
    index < stage.sets &&
    snapshot.reps === stage.reps &&
    snapshot.amrap === amrap &&
    snapshot.minReps === (amrap ? stage.reps : null)
  );
}

export function prescribedStageIndex(
  scheme: StageScheme,
  loggedSets: readonly { prescription: PrescriptionSnapshot | null }[],
  dayStages: StageIndices | undefined,
  lift: string,
): number {
  const snapshots = loggedSets.flatMap((set) => (set.prescription ? [set.prescription] : []));
  const matching = scheme.stages.flatMap((stage, index) =>
    snapshots.length > 0 && snapshots.every((snapshot) => matchesStage(stage, snapshot)) ? [index] : [],
  );
  return matching.length === 1 ? matching[0] : stageIndexOf(scheme, dayStages, lift);
}

function setShapes(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  slot: SlotDecl,
  position: Position,
  stages: StageIndices | undefined,
): ShapesResult {
  const scheme = slot.scheme;
  switch (scheme.kind) {
    case 'sets':
      return {
        kind: 'shapes',
        shapes: scheme.sets.map((set) => ({
          reps: set.reps,
          maxReps: set.maxReps ?? null,
          load: set.load,
          amrap: set.amrap ?? false,
          minReps: minRepsFor(set.amrap ?? false, set.minReps, set.reps),
          optional: set.optional ?? false,
        })),
      };
    case 'repeat': {
      const count = evaluateNumber(scheme.count, numberContext(definition, enrollment, position));
      return {
        kind: 'shapes',
        shapes: Array.from({ length: count }, (_, index) => {
          const amrap = (scheme.amrapLast ?? false) && index === count - 1;
          return {
            reps: scheme.reps,
            maxReps: scheme.maxReps ?? null,
            load: scheme.load,
            amrap,
            minReps: minRepsFor(amrap, scheme.minReps, scheme.reps),
            optional: scheme.optional ?? false,
          };
        }),
      };
    }
    case 'weekTable': {
      const row = definition.weekTables?.[scheme.table]?.[weekContextOf(position).week - 1];
      if (!row) return { kind: 'unsupported', primitive: 'weekTable' };
      return {
        kind: 'shapes',
        shapes: row.sets.map((set) => ({
          reps: set.reps,
          maxReps: null,
          load: { kind: 'pct', pct: set.pct, of: scheme.of },
          amrap: set.amrap ?? false,
          minReps: minRepsFor(set.amrap ?? false, set.minReps, set.reps),
          optional: false,
        })),
      };
    }
    case 'stages': {
      const stage = scheme.stages[stageIndexOf(scheme, stages, slot.lift)];
      if (!stage) return { kind: 'unsupported', primitive: scheme.kind };
      return {
        kind: 'shapes',
        shapes: Array.from({ length: stage.sets }, (_, index) => {
          const amrap = stage.amrapLast && index === stage.sets - 1;
          return {
            reps: stage.reps,
            maxReps: null,
            load: scheme.load,
            amrap,
            minReps: minRepsFor(amrap, undefined, stage.reps),
            optional: false,
          };
        }),
      };
    }
  }
}

export function requiredSetIndices(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  slot: SlotDecl,
  position: Position,
  stages?: StageIndices,
): number[] | null {
  const result = setShapes(definition, enrollment, slot, position, stages);
  if (result.kind === 'unsupported') return null;
  return result.shapes.flatMap((shape, index) => (shape.optional ? [] : [index]));
}

interface ResolveContext {
  definition: ProgramDefinition;
  enrollment: ProgramEnrollment;
  refs: ProgramReferences;
  stages: StageIndices | undefined;
  pendingRetests: PendingRetests | undefined;
  position: Position;
  lastLogged: LastLoggedWeights;
}

interface ResolvedLoad {
  weight: number | null;
  weightKg: number | null;
  pct: number | null;
  snapshotted: boolean;
}

type LoadResult = { kind: 'load'; load: ResolvedLoad } | { kind: 'unsupported'; primitive: string };

function prescribedLoad(
  context: ResolveContext,
  unroundedInEnrollmentUnit: number | undefined,
  pct: number,
): LoadResult {
  if (unroundedInEnrollmentUnit === undefined) {
    return { kind: 'load', load: { weight: null, weightKg: null, pct, snapshotted: false } };
  }
  const weight = roundPrescribedLoad(unroundedInEnrollmentUnit, context.enrollment.rounding);
  return {
    kind: 'load',
    load: { weight, weightKg: unitToKg(weight, context.enrollment.unit), pct, snapshotted: true },
  };
}

function relativeLoad(
  context: ResolveContext,
  primitive: string,
  base: SlotSetsResult,
  index: number,
  pct: number,
): LoadResult {
  if (base.kind === 'unsupported') return base;
  const weight = base.sets[index]?.weight;
  if (weight === undefined) return { kind: 'unsupported', primitive };
  return prescribedLoad(context, weight === null ? undefined : weight * pct, pct);
}

function referencedSlotSets(
  context: ResolveContext,
  primitive: string,
  slot: SlotDecl | undefined,
  depth: number,
  position = context.position,
): SlotSetsResult {
  if (!slot || depth >= MAX_REFERENCE_DEPTH) return { kind: 'unsupported', primitive };
  return resolveSlotSets({ ...context, position }, slot, depth + 1);
}

function resolveLoad(context: ResolveContext, slot: SlotDecl, load: Load, index: number, depth: number): LoadResult {
  const { definition, enrollment, position } = context;
  const referenceInEnrollmentUnit = (variable: string, lift = slot.lift) =>
    context.refs[lift]?.[variable as keyof ProgramReferences[string]];
  const numbers = numberContext(definition, enrollment, position);
  switch (load.kind) {
    case 'pct': {
      const pct = evaluateNumber(load.pct, numbers);
      const raw = referenceInEnrollmentUnit(load.of, load.lift);
      const add = load.add ? evaluateAmount(load.add, enrollment.unit, numbers) : 0;
      return prescribedLoad(context, raw === undefined ? undefined : raw * pct + add, pct);
    }
    case 'cumulativeAddOn': {
      const pct = evaluateNumber(load.pct, numbers);
      const raw = referenceInEnrollmentUnit(load.of);
      const week = Math.min(weekContextOf(position).week, load.byWeek.length);
      const add = week > 0 ? load.byWeek[week - 1][enrollment.unit] : 0;
      return prescribedLoad(context, raw === undefined ? undefined : raw * pct + add, pct);
    }
    case 'rpeLoad': {
      const pct = rpeChartPct(load.reps, load.rpe);
      if (pct === null) return { kind: 'unsupported', primitive: load.kind };
      const raw = referenceInEnrollmentUnit(load.of);
      return prescribedLoad(context, raw === undefined ? undefined : raw * pct, pct);
    }
    case 'ramp': {
      const top = referenceInEnrollmentUnit(load.of);
      const pct = roundTo(RAMP_PCT_DECIMALS, 1 - evaluateNumber(load.step, numbers) * (load.count - 1 - index));
      if (top === undefined) return prescribedLoad(context, undefined, pct);
      return prescribedLoad(context, roundPrescribedLoad(top, enrollment.rounding) * pct, pct);
    }
    case 'weekTablePct': {
      const pct = definition.weekTables?.[load.table]?.[weekContextOf(position).week - 1]?.sets[load.set]?.pct;
      if (pct === undefined) return { kind: 'unsupported', primitive: load.kind };
      const raw = referenceInEnrollmentUnit(load.of);
      return prescribedLoad(context, raw === undefined ? undefined : raw * pct, pct);
    }
    case 'sameAs': {
      const target = parseSetRef(load.ref);
      const targetSlot = target ? findSlot(definition, target.slotId) : undefined;
      const sets = referencedSlotSets(context, load.kind, targetSlot, depth);
      if (sets.kind === 'unsupported') return sets;
      const set = target ? sets.sets[target.index] : undefined;
      if (!set) return { kind: 'unsupported', primitive: load.kind };
      return {
        kind: 'load',
        load: { weight: set.weight, weightKg: set.weightKg, pct: set.pct, snapshotted: set.weightKg !== null },
      };
    }
    case 'pctOfSet': {
      const target = parseSetRef(load.ref);
      const targetSlot = target ? findSlot(definition, target.slotId) : undefined;
      const sets = referencedSlotSets(context, load.kind, targetSlot, depth);
      return relativeLoad(context, load.kind, sets, target?.index ?? -1, evaluateNumber(load.pct, numbers));
    }
    case 'pctOfSlot': {
      const targetSlot = definition.schedule.days
        .find((day) => day.key === load.day)
        ?.slots.find((candidate) => candidate.id === load.slot);
      const sets = referencedSlotSets(context, load.kind, targetSlot, depth, positionAt(position, load.day));
      return relativeLoad(context, load.kind, sets, load.idx, evaluateNumber(load.pct, numbers));
    }
    case 'lastLogged': {
      const exerciseId = enrollment.bindings[slot.lift];
      const kg = exerciseId ? context.lastLogged[exerciseId] : undefined;
      if (kg === undefined)
        return { kind: 'load', load: { weight: null, weightKg: null, pct: null, snapshotted: false } };
      return {
        kind: 'load',
        load: { weight: shownWeight(kg, enrollment.unit), weightKg: kg, pct: null, snapshotted: false },
      };
    }
  }
}

type SlotSetsResult = { kind: 'sets'; sets: PrescribedSet[] } | { kind: 'unsupported'; primitive: string };

function resolveSlotSets(context: ResolveContext, slot: SlotDecl, depth: number): SlotSetsResult {
  if (slot.scheme.kind === 'stages' && isRetestDue(context.definition, slot, context.pendingRetests)) {
    const stageLoad = resolveLoad(context, slot, slot.scheme.load, 0, depth);
    return { kind: 'sets', sets: [retestSet(slot.id, stageLoad.kind === 'load' ? stageLoad.load.weightKg : null)] };
  }
  const shapes = setShapes(context.definition, context.enrollment, slot, context.position, context.stages);
  if (shapes.kind === 'unsupported') return shapes;
  const sets: PrescribedSet[] = [];
  for (const [index, shape] of shapes.shapes.entries()) {
    const result = resolveLoad(context, slot, shape.load, index, depth);
    if (result.kind === 'unsupported') return result;
    sets.push(prescribedSet(`${slot.id}:${index}`, shape, result.load));
  }
  return { kind: 'sets', sets };
}

function prescribedSet(
  ref: string,
  shape: SetShape,
  { weight, weightKg, pct, snapshotted }: ResolvedLoad,
): PrescribedSet {
  return {
    ref,
    weight,
    weightKg,
    pct,
    reps: shape.reps,
    maxReps: shape.maxReps,
    minReps: shape.minReps,
    amrap: shape.amrap,
    optional: shape.optional,
    snapshot:
      snapshotted && weightKg !== null && shape.reps !== null
        ? { ref, weightKg, reps: shape.reps, minReps: shape.minReps, amrap: shape.amrap }
        : null,
  };
}

export function resolvePrescription(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: ReferenceState,
  position: Position,
  lastLogged: LastLoggedWeights,
): ResolvedSlot[] {
  if (definition.schedule.days.length === 0) return [];
  const day = dayOf(definition, position);
  if (!day) return [];
  const context: ResolveContext = {
    definition,
    enrollment,
    refs: state.refs,
    stages: state.stages,
    pendingRetests: state.pendingRetests,
    position,
    lastLogged,
  };
  return day.slots
    .filter((slot) => isSlotActive(definition, enrollment, slot, position))
    .map((slot): ResolvedSlot => {
      const result = resolveSlotSets(context, slot, 0);
      if (result.kind === 'unsupported') {
        return { kind: 'unsupported', slotId: slot.id, lift: slot.lift, primitive: result.primitive };
      }
      return {
        kind: 'exercise',
        slotId: slot.id,
        lift: slot.lift,
        exerciseId: enrollment.bindings[slot.lift] as string,
        role: slot.role,
        sets: result.sets,
      };
    });
}

function declaredLoadOf(slot: SlotDecl | undefined, index: number): Load | undefined {
  const scheme = slot?.scheme;
  switch (scheme?.kind) {
    case 'sets':
      return scheme.sets[index]?.load;
    case 'repeat':
    case 'stages':
      return scheme.load;
    default:
      return undefined;
  }
}

function relativeBaseOf(load: Load | undefined): { ref: string; pct: NumberExpr } | null {
  if (load?.kind === 'sameAs') return { ref: load.ref, pct: 1 };
  if (load?.kind === 'pctOfSet') return { ref: load.ref, pct: load.pct };
  if (load?.kind === 'pctOfSlot') return { ref: `${load.slot}:${load.idx}`, pct: load.pct };
  return null;
}

export function recomputeRelativeSets(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  position: Position,
  slots: readonly ResolvedSlot[],
  editedWeights: Readonly<Record<string, number>>,
): ResolvedSlot[] {
  const numbers = numberContext(definition, enrollment, position);
  const movedWeights = new Map(Object.entries(editedWeights));
  return slots.map((slot): ResolvedSlot => {
    if (slot.kind !== 'exercise') return slot;
    const declared = findSlot(definition, slot.slotId);
    const sets = slot.sets.map((set, index) => {
      const edited = editedWeights[set.ref];
      if (edited !== undefined) return { ...set, weight: edited, weightKg: unitToKg(edited, enrollment.unit) };
      const base = relativeBaseOf(declaredLoadOf(declared, index));
      const baseWeight = base ? movedWeights.get(base.ref) : undefined;
      if (!base || baseWeight === undefined) return set;
      const weight = roundPrescribedLoad(baseWeight * evaluateNumber(base.pct, numbers), enrollment.rounding);
      movedWeights.set(set.ref, weight);
      const weightKg = unitToKg(weight, enrollment.unit);
      return { ...set, weight, weightKg, snapshot: set.snapshot && { ...set.snapshot, weightKg } };
    });
    return { ...slot, sets };
  });
}
