import { roundPrescribedLoad } from './load-rounding.ts';
import { roundTo } from './math.ts';
import {
  type DaySet,
  type DaySlot,
  type LastLoggedWeights,
  type Load,
  type NumberExpr,
  type PrescriptionSnapshot,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramReferences,
  type ReferenceState,
  type SlotDecl,
  type SlotRole,
} from './program-types.ts';
import { declaredLoadOf, parseSetRef, setRefOf, prescribeDay, prescribeSlot, RETEST_REPS } from './program-day.ts';
import { evaluateAmount, evaluateNumber, findSlot, isBarbellLift, numberContext } from './program-eval.ts';
import { type Position, positionAt, weekContextOf } from './program-schedule.ts';
import { rpeChartPct } from './rpe-chart.ts';
import { shownWeight, unitToKg } from './units.ts';

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

const RAMP_PCT_DECIMALS = 6;
const MAX_REFERENCE_DEPTH = 8;

interface ResolveContext {
  definition: ProgramDefinition;
  enrollment: ProgramEnrollment;
  state: ReferenceState;
  position: Position;
  lastLogged: LastLoggedWeights;
}

interface ResolvedLoad {
  weight: number | null;
  weightKg: number | null;
  pct: number | null;
}

type LoadResult = { kind: 'load'; load: ResolvedLoad } | { kind: 'unsupported'; primitive: string };

function prescribedLoad(
  context: ResolveContext,
  onBar: boolean,
  unroundedInEnrollmentUnit: number | undefined,
  pct: number,
): LoadResult {
  if (unroundedInEnrollmentUnit === undefined) {
    return { kind: 'load', load: { weight: null, weightKg: null, pct } };
  }
  const weight = roundPrescribedLoad(unroundedInEnrollmentUnit, context.enrollment.rounding, onBar);
  return {
    kind: 'load',
    load: { weight, weightKg: unitToKg(weight, context.enrollment.unit), pct },
  };
}

function relativeLoad(
  context: ResolveContext,
  onBar: boolean,
  primitive: string,
  base: SlotSetsResult,
  index: number,
  pct: number,
): LoadResult {
  if (base.kind === 'unsupported') return base;
  const weight = base.sets[index]?.weight;
  if (weight === undefined) return { kind: 'unsupported', primitive };
  return prescribedLoad(context, onBar, weight === null ? undefined : weight * pct, pct);
}

function referencedSlotSets(
  context: ResolveContext,
  primitive: string,
  slot: SlotDecl | undefined,
  depth: number,
  position = context.position,
): SlotSetsResult {
  if (!slot || depth >= MAX_REFERENCE_DEPTH) return { kind: 'unsupported', primitive };
  const daySlot = prescribeSlot(context.definition, context.enrollment, context.state, position, slot);
  return resolveSlotSets({ ...context, position }, daySlot, depth + 1);
}

function resolveLoad(context: ResolveContext, slot: SlotDecl, load: Load, index: number, depth: number): LoadResult {
  const { definition, enrollment, position } = context;
  const referenceInEnrollmentUnit = (variable: string, lift = slot.lift) =>
    context.state.refs[lift]?.[variable as keyof ProgramReferences[string]];
  const numbers = numberContext(definition, enrollment, position);
  const onBar = isBarbellLift(definition, slot.lift);
  switch (load.kind) {
    case 'pct': {
      const pct = evaluateNumber(load.pct, numbers);
      const raw = referenceInEnrollmentUnit(load.of, load.lift);
      const add = load.add ? evaluateAmount(load.add, enrollment.unit, numbers) : 0;
      return prescribedLoad(context, onBar, raw === undefined ? undefined : raw * pct + add, pct);
    }
    case 'cumulativeAddOn': {
      const pct = evaluateNumber(load.pct, numbers);
      const raw = referenceInEnrollmentUnit(load.of);
      const week = Math.min(weekContextOf(position).week, load.byWeek.length);
      const add = week > 0 ? load.byWeek[week - 1][enrollment.unit] : 0;
      return prescribedLoad(context, onBar, raw === undefined ? undefined : raw * pct + add, pct);
    }
    case 'rpeLoad': {
      const pct = rpeChartPct(load.reps, load.rpe);
      if (pct === null) return { kind: 'unsupported', primitive: load.kind };
      const raw = referenceInEnrollmentUnit(load.of);
      return prescribedLoad(context, onBar, raw === undefined ? undefined : raw * pct, pct);
    }
    case 'ramp': {
      const top = referenceInEnrollmentUnit(load.of);
      const pct = roundTo(RAMP_PCT_DECIMALS, 1 - evaluateNumber(load.step, numbers) * (load.count - 1 - index));
      if (top === undefined) return prescribedLoad(context, onBar, undefined, pct);
      return prescribedLoad(context, onBar, roundPrescribedLoad(top, enrollment.rounding, onBar) * pct, pct);
    }
    case 'weekTablePct': {
      const pct = definition.weekTables?.[load.table]?.[weekContextOf(position).week - 1]?.sets[load.set]?.pct;
      if (pct === undefined) return { kind: 'unsupported', primitive: load.kind };
      const raw = referenceInEnrollmentUnit(load.of);
      return prescribedLoad(context, onBar, raw === undefined ? undefined : raw * pct, pct);
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
        load: { weight: set.weight, weightKg: set.weightKg, pct: set.pct },
      };
    }
    case 'pctOfSet': {
      const target = parseSetRef(load.ref);
      const targetSlot = target ? findSlot(definition, target.slotId) : undefined;
      const sets = referencedSlotSets(context, load.kind, targetSlot, depth);
      return relativeLoad(context, onBar, load.kind, sets, target?.index ?? -1, evaluateNumber(load.pct, numbers));
    }
    case 'pctOfSlot': {
      const targetSlot = definition.schedule.days
        .find((day) => day.key === load.day)
        ?.slots.find((candidate) => candidate.id === load.slot);
      const sets = referencedSlotSets(context, load.kind, targetSlot, depth, positionAt(position, load.day));
      return relativeLoad(context, onBar, load.kind, sets, load.idx, evaluateNumber(load.pct, numbers));
    }
    case 'lastLogged': {
      const exerciseId = enrollment.bindings[slot.lift];
      const kg = exerciseId ? context.lastLogged[exerciseId] : undefined;
      if (kg === undefined) return { kind: 'load', load: { weight: null, weightKg: null, pct: null } };
      return {
        kind: 'load',
        load: { weight: shownWeight(kg, enrollment.unit), weightKg: kg, pct: null },
      };
    }
  }
}

type SlotSetsResult = { kind: 'sets'; sets: PrescribedSet[] } | { kind: 'unsupported'; primitive: string };

function retestSet(ref: string, suggestedWeightKg: number | null): PrescribedSet {
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

function resolveSlotSets(context: ResolveContext, daySlot: DaySlot, depth: number): SlotSetsResult {
  switch (daySlot.kind) {
    case 'unsupported':
      return { kind: 'unsupported', primitive: daySlot.primitive };
    case 'retest': {
      const stageLoad = resolveLoad(context, daySlot.slot, daySlot.load, 0, depth);
      return {
        kind: 'sets',
        sets: [retestSet(daySlot.ref, stageLoad.kind === 'load' ? stageLoad.load.weightKg : null)],
      };
    }
    case 'sets': {
      const sets: PrescribedSet[] = [];
      for (const [index, set] of daySlot.sets.entries()) {
        const result = resolveLoad(context, daySlot.slot, set.shape.load, index, depth);
        if (result.kind === 'unsupported') return result;
        sets.push(prescribedSet(set, result.load));
      }
      return { kind: 'sets', sets };
    }
  }
}

function prescribedSet({ ref, shape, judgeable }: DaySet, { weight, weightKg, pct }: ResolvedLoad): PrescribedSet {
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
      judgeable && weightKg !== null && shape.reps !== null
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
  const context: ResolveContext = {
    definition,
    enrollment,
    state,
    position,
    lastLogged,
  };
  return prescribeDay(definition, enrollment, state, position).map((daySlot): ResolvedSlot => {
    const { slot } = daySlot;
    const result = resolveSlotSets(context, daySlot, 0);
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

function relativeBaseOf(load: Load | undefined): { ref: string; pct: NumberExpr } | null {
  if (load?.kind === 'sameAs') return { ref: load.ref, pct: 1 };
  if (load?.kind === 'pctOfSet') return { ref: load.ref, pct: load.pct };
  if (load?.kind === 'pctOfSlot') return { ref: setRefOf(load.slot, load.idx), pct: load.pct };
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
      const onBar = isBarbellLift(definition, slot.lift);
      const weight = roundPrescribedLoad(baseWeight * evaluateNumber(base.pct, numbers), enrollment.rounding, onBar);
      movedWeights.set(set.ref, weight);
      const weightKg = unitToKg(weight, enrollment.unit);
      return { ...set, weight, weightKg, snapshot: set.snapshot && { ...set.snapshot, weightKg } };
    });
    return { ...slot, sets };
  });
}
