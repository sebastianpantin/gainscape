import { halfIncrementKg, type RoundingSetting } from './load-rounding.ts';
import { FLOAT_TOLERANCE } from './math.ts';
import {
  type DaySet,
  type DaySlot,
  type Load,
  type PrescriptionSnapshot,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgressionRule,
  type ReferenceState,
  type ReferenceVar,
  type SetShape,
  type SlotDecl,
  type StageDecl,
  type StageIndices,
  type StageScheme,
} from './program-types.ts';
import { evaluateNumber, findSlot, numberContext, optionValue, stageRetestOf } from './program-eval.ts';
import { dayOf, isRotationPosition, type Position, weekContextOf } from './program-schedule.ts';
import { type FactSet, type Verdict } from './program-state.ts';
import { type WeightUnit } from './units.ts';

export const RETEST_REPS = 5;
const RETEST_REF_SUFFIX = ':retest';
const MAX_LOAD_REFERENCE_DEPTH = 8;

interface SetRef {
  slotId: string;
  index: number;
}

export function setRefOf(slotId: string, index: number): string {
  return `${slotId}:${index}`;
}

export function parseSetRef(ref: string): SetRef | null {
  const separator = ref.lastIndexOf(':');
  if (separator <= 0) return null;
  const index = Number(ref.slice(separator + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  return { slotId: ref.slice(0, separator), index };
}

function retestRefOf(slotId: string): string {
  return `${slotId}${RETEST_REF_SUFFIX}`;
}

export function isRetestRef(ref: string): boolean {
  return ref.endsWith(RETEST_REF_SUFFIX);
}

type DayState = Pick<ReferenceState, 'stages' | 'pendingRetests'>;

function isSlotActive(
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

function stageIndexOf(scheme: StageScheme, stages: StageIndices | undefined, lift: string): number {
  return Math.min(Math.max(stages?.[lift] ?? 0, 0), scheme.stages.length - 1);
}

export function dayStagesOf(definition: ProgramDefinition, stages: StageIndices, position: Position): StageIndices {
  return Object.fromEntries(
    (dayOf(definition, position)?.slots ?? []).flatMap((slot) =>
      slot.scheme.kind === 'stages' ? [[slot.lift, stageIndexOf(slot.scheme, stages, slot.lift)]] : [],
    ),
  );
}

export function declaredLoadOf(slot: SlotDecl | undefined, index: number): Load | undefined {
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

function isSnapshotLoad(definition: ProgramDefinition, load: Load | undefined, depth = 0): boolean {
  if (depth >= MAX_LOAD_REFERENCE_DEPTH) return true;
  switch (load?.kind) {
    case 'lastLogged':
      return false;
    case 'sameAs':
    case 'pctOfSet': {
      const target = parseSetRef(load.ref);
      const slot = target ? findSlot(definition, target.slotId) : undefined;
      return isSnapshotLoad(definition, declaredLoadOf(slot, target?.index ?? -1), depth + 1);
    }
    case 'pctOfSlot':
      return isSnapshotLoad(definition, declaredLoadOf(findSlot(definition, load.slot), load.idx), depth + 1);
    default:
      return true;
  }
}

function minRepsFor(amrap: boolean, minReps: number | undefined, reps: number | null): number | null {
  return amrap ? (minReps ?? reps) : null;
}

function setShapes(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  slot: SlotDecl,
  position: Position,
  stages: StageIndices | undefined,
): SetShape[] | null {
  const scheme = slot.scheme;
  switch (scheme.kind) {
    case 'sets':
      return scheme.sets.map((set) => ({
        reps: set.reps,
        maxReps: set.maxReps ?? null,
        load: set.load,
        amrap: set.amrap ?? false,
        minReps: minRepsFor(set.amrap ?? false, set.minReps, set.reps),
        optional: set.optional ?? false,
      }));
    case 'repeat': {
      const count = evaluateNumber(scheme.count, numberContext(definition, enrollment, position));
      return Array.from({ length: count }, (_, index) => {
        const amrap = (scheme.amrapLast ?? false) && index === count - 1;
        return {
          reps: scheme.reps,
          maxReps: scheme.maxReps ?? null,
          load: scheme.load,
          amrap,
          minReps: minRepsFor(amrap, scheme.minReps, scheme.reps),
          optional: scheme.optional ?? false,
        };
      });
    }
    case 'weekTable': {
      const row = definition.weekTables?.[scheme.table]?.[weekContextOf(position).week - 1];
      if (!row) return null;
      return row.sets.map((set) => ({
        reps: set.reps,
        maxReps: null,
        load: { kind: 'pct', pct: set.pct, of: scheme.of },
        amrap: set.amrap ?? false,
        minReps: minRepsFor(set.amrap ?? false, set.minReps, set.reps),
        optional: false,
      }));
    }
    case 'stages': {
      const stage = scheme.stages[stageIndexOf(scheme, stages, slot.lift)];
      if (!stage) return null;
      return Array.from({ length: stage.sets }, (_, index) => {
        const amrap = stage.amrapLast && index === stage.sets - 1;
        return {
          reps: stage.reps,
          maxReps: null,
          load: scheme.load,
          amrap,
          minReps: amrap ? stage.reps : null,
          optional: false,
        };
      });
    }
  }
}

function dueRetestOf(definition: ProgramDefinition, slot: SlotDecl, state: DayState): ReferenceVar | null {
  const pending = state.pendingRetests?.[slot.lift];
  if (pending === undefined) return null;
  const due = definition.progression.some(
    (rule) => rule.lift === slot.lift && rule.judgedSlots.includes(slot.id) && stageRetestOf(rule)?.from === pending,
  );
  return due ? pending : null;
}

export function prescribeSlot(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: DayState,
  position: Position,
  slot: SlotDecl,
): DaySlot {
  if (slot.scheme.kind === 'stages') {
    const retest = dueRetestOf(definition, slot, state);
    if (retest !== null)
      return { kind: 'retest', slot, ref: retestRefOf(slot.id), from: retest, load: slot.scheme.load };
  }
  const shapes = setShapes(definition, enrollment, slot, position, state.stages);
  if (shapes === null) return { kind: 'unsupported', slot, primitive: slot.scheme.kind };
  const sets = shapes.map((shape, index): DaySet => ({
    ref: setRefOf(slot.id, index),
    shape,
    judgeable: shape.reps !== null && isSnapshotLoad(definition, shape.load),
  }));
  return { kind: 'sets', slot, sets };
}

export function prescribeDay(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: DayState,
  position: Position,
): DaySlot[] {
  const day = definition.schedule.days.length === 0 ? undefined : dayOf(definition, position);
  return (day?.slots ?? [])
    .filter((slot) => isSlotActive(definition, enrollment, slot, position))
    .map((slot) => prescribeSlot(definition, enrollment, state, position, slot));
}

interface LoggedLoad {
  weightKg: number;
  reps: number;
}

export function isSetMet(
  logged: LoggedLoad,
  snapshot: PrescriptionSnapshot,
  rounding: RoundingSetting,
  unit: WeightUnit,
): boolean {
  const lightestMetKg = snapshot.weightKg - halfIncrementKg(rounding, unit) - FLOAT_TOLERANCE;
  const repsNeeded = snapshot.amrap ? (snapshot.minReps ?? snapshot.reps) : snapshot.reps;
  return logged.weightKg >= lightestMetKg && logged.reps >= repsNeeded;
}

function judgedSlotsOf(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  rule: ProgressionRule,
  position: Position,
): SlotDecl[] {
  const day = dayOf(definition, position);
  if (!day) return [];
  if (rule.judgedWeeks && !isRotationPosition(position) && !rule.judgedWeeks.includes(position.week)) return [];
  return day.slots.filter(
    (slot) =>
      slot.lift === rule.lift &&
      rule.judgedSlots.includes(slot.id) &&
      isSlotActive(definition, enrollment, slot, position),
  );
}

function setsForSlot(sets: readonly FactSet[], slot: SlotDecl, exerciseId: string | null | undefined): FactSet[] {
  return sets.filter(
    (set) =>
      set.prescription !== null &&
      set.exerciseId === exerciseId &&
      parseSetRef(set.prescription.ref)?.slotId === slot.id,
  );
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

function prescribedStageIndex(
  scheme: StageScheme,
  loggedSets: readonly FactSet[],
  dayStages: StageIndices,
  lift: string,
): number {
  const snapshots = loggedSets.flatMap((set) => (set.prescription ? [set.prescription] : []));
  const matching = scheme.stages.flatMap((stage, index) =>
    snapshots.length > 0 && snapshots.every((snapshot) => matchesStage(stage, snapshot)) ? [index] : [],
  );
  return matching.length === 1 ? matching[0] : stageIndexOf(scheme, dayStages, lift);
}

export function combinedVerdict(a: Verdict, b: Verdict): Verdict {
  if (a === 'missed' || b === 'missed') return 'missed';
  return a === 'met' || b === 'met' ? 'met' : 'neutral';
}

export interface Judgement {
  verdict: Verdict;
  sets: readonly FactSet[];
}

export function judgeRule(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  rule: ProgressionRule,
  position: Position,
  sets: readonly FactSet[],
  stages: StageIndices,
): Judgement {
  const exerciseId = enrollment.bindings[rule.lift];
  const slots = judgedSlotsOf(definition, enrollment, rule, position).map((slot) => ({
    slot,
    candidates: setsForSlot(sets, slot, exerciseId),
  }));
  const judged = slots.flatMap(({ slot, candidates }) => {
    const slotStages =
      slot.scheme.kind === 'stages'
        ? { ...stages, [slot.lift]: prescribedStageIndex(slot.scheme, candidates, stages, slot.lift) }
        : stages;
    const prescribed = prescribeSlot(definition, enrollment, { stages: slotStages }, position, slot);
    if (prescribed.kind !== 'sets') return [];
    const { judgedSetIndexes } = rule;
    const required = prescribed.sets.filter(
      (set, index) => set.judgeable && !set.shape.optional && (!judgedSetIndexes || judgedSetIndexes.includes(index)),
    );
    return required.length === 0 ? [] : [{ required, candidates }];
  });
  const judgedSets = slots.flatMap(({ candidates }) => candidates);
  if (judged.every(({ candidates }) => candidates.length === 0)) return { verdict: 'neutral', sets: judgedSets };
  const allMet = judged.every(({ required, candidates }) =>
    required.every((set) =>
      candidates.some(
        (candidate) =>
          candidate.prescription?.ref === set.ref &&
          isSetMet(candidate, candidate.prescription, enrollment.rounding, enrollment.unit),
      ),
    ),
  );
  return { verdict: allMet ? 'met' : 'missed', sets: judgedSets };
}

export interface LoggedDay {
  position: Position;
  sets: readonly FactSet[];
  stages: StageIndices;
}

export function liftVerdicts(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  { position, sets, stages }: LoggedDay,
): Readonly<Record<string, Verdict>> {
  const verdicts: Record<string, Verdict> = {};
  for (const rule of definition.progression) {
    if (judgedSlotsOf(definition, enrollment, rule, position).length === 0) continue;
    const { verdict } = judgeRule(definition, enrollment, rule, position, sets, stages);
    verdicts[rule.lift] = rule.lift in verdicts ? combinedVerdict(verdicts[rule.lift], verdict) : verdict;
  }
  return verdicts;
}

function heaviestSet(sets: readonly FactSet[]): FactSet | undefined {
  return sets.reduce<FactSet | undefined>(
    (best, set) => (best === undefined || set.weightKg > best.weightKg ? set : best),
    undefined,
  );
}

function retestAttemptOf(sets: readonly FactSet[], slot: SlotDecl, exerciseId: string | null | undefined): FactSet[] {
  const ref = retestRefOf(slot.id);
  const exerciseSets = sets.filter((set) => set.exerciseId === exerciseId);
  const retestSet = exerciseSets.find((set) => set.prescription?.ref === ref);
  if (!retestSet) return [];
  const best = heaviestSet(
    exerciseSets.filter((set) => (set === retestSet || set.prescription === null) && set.reps >= RETEST_REPS),
  );
  return best ? [{ ...best, prescription: retestSet.prescription }] : [];
}

export function judgedDaySets(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  position: Position,
  sets: readonly FactSet[],
): FactSet[] {
  const ruleSets = definition.progression.flatMap((rule) =>
    judgedSlotsOf(definition, enrollment, rule, position).flatMap((slot) =>
      setsForSlot(sets, slot, enrollment.bindings[slot.lift]),
    ),
  );
  const retestSets = (dayOf(definition, position)?.slots ?? []).flatMap((slot) =>
    slot.scheme.kind === 'stages' ? retestAttemptOf(sets, slot, enrollment.bindings[slot.lift]) : [],
  );
  return [...ruleSets, ...retestSets];
}

export interface RetestAttempt {
  lift: string;
  from: ReferenceVar;
  weightKg: number;
}

export function retestAttemptsOf(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: DayState,
  position: Position,
  sets: readonly FactSet[],
): RetestAttempt[] {
  if (Object.keys(state.pendingRetests ?? {}).length === 0) return [];
  const attempts = new Map<string, RetestAttempt>();
  for (const daySlot of prescribeDay(definition, enrollment, state, position)) {
    if (daySlot.kind !== 'retest') continue;
    const attempt = heaviestSet(sets.filter((set) => set.prescription?.ref === daySlot.ref));
    const best = attempts.get(daySlot.slot.lift);
    if (attempt && (!best || attempt.weightKg > best.weightKg)) {
      attempts.set(daySlot.slot.lift, { lift: daySlot.slot.lift, from: daySlot.from, weightKg: attempt.weightKg });
    }
  }
  return [...attempts.values()];
}
