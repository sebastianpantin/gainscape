import { roundPrescribedLoad } from './load-rounding.ts';
import { roundTo } from './math.ts';
import {
  evaluateNumber,
  findSlot,
  type Load,
  type NumberContext,
  optionValue,
  parseSetRef,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgramReferences,
  type SetScheme,
  type SlotDecl,
  type SlotRole,
} from './program-definition.ts';
import { dayOf, isCyclePosition, isRotationPosition, type Position } from './program-schedule.ts';
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

export interface ReferenceState {
  refs: ProgramReferences;
  stages?: Readonly<Record<string, number>>;
}

const RAMP_PCT_DECIMALS = 6;
const MAX_SAME_AS_DEPTH = 8;

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

function setShapes(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  scheme: SetScheme,
  position: Position,
): ShapesResult {
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
    default:
      return { kind: 'unsupported', primitive: scheme.kind };
  }
}

export function requiredSetIndices(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  slot: SlotDecl,
  position: Position,
): number[] | null {
  const result = setShapes(definition, enrollment, slot.scheme, position);
  if (result.kind === 'unsupported') return null;
  return result.shapes.flatMap((shape, index) => (shape.optional ? [] : [index]));
}

interface ResolveContext {
  definition: ProgramDefinition;
  enrollment: ProgramEnrollment;
  refs: ProgramReferences;
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

function resolveLoad(context: ResolveContext, slot: SlotDecl, load: Load, index: number, depth: number): LoadResult {
  const { definition, enrollment, position } = context;
  const referenceInEnrollmentUnit = (variable: string) =>
    context.refs[slot.lift]?.[variable as keyof ProgramReferences[string]];
  const numbers = numberContext(definition, enrollment, position);
  switch (load.kind) {
    case 'pct': {
      const pct = evaluateNumber(load.pct, numbers);
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
      if (!target || !targetSlot || depth >= MAX_SAME_AS_DEPTH) return { kind: 'unsupported', primitive: load.kind };
      const sets = resolveSlotSets(context, targetSlot, depth + 1);
      if (sets.kind === 'unsupported') return sets;
      const set = sets.sets[target.index];
      if (!set) return { kind: 'unsupported', primitive: load.kind };
      return {
        kind: 'load',
        load: { weight: set.weight, weightKg: set.weightKg, pct: set.pct, snapshotted: set.weightKg !== null },
      };
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
    default:
      return { kind: 'unsupported', primitive: load.kind };
  }
}

type SlotSetsResult = { kind: 'sets'; sets: PrescribedSet[] } | { kind: 'unsupported'; primitive: string };

function resolveSlotSets(context: ResolveContext, slot: SlotDecl, depth: number): SlotSetsResult {
  const shapes = setShapes(context.definition, context.enrollment, slot.scheme, context.position);
  if (shapes.kind === 'unsupported') return shapes;
  const sets: PrescribedSet[] = [];
  for (const [index, shape] of shapes.shapes.entries()) {
    const result = resolveLoad(context, slot, shape.load, index, depth);
    if (result.kind === 'unsupported') return result;
    const { weight, weightKg, pct, snapshotted } = result.load;
    const ref = `${slot.id}:${index}`;
    sets.push({
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
    });
  }
  return { kind: 'sets', sets };
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
  const context: ResolveContext = { definition, enrollment, refs: state.refs, position, lastLogged };
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

export function recomputeRelativeSets(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  position: Position,
  slots: readonly ResolvedSlot[],
  editedWeights: Readonly<Record<string, number>>,
): ResolvedSlot[] {
  const edits = Object.keys(editedWeights).length;
  const where = `${definition.key} ${enrollment.unit} ${JSON.stringify(position)}`;
  throw new Error(`recomputeRelativeSets is not implemented: ${where}, ${slots.length} slots, ${edits} edited sets`);
}
