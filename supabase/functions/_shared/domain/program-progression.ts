import { halfIncrementKg, type RoundingSetting } from './load-rounding.ts';
import { FLOAT_TOLERANCE } from './math.ts';
import {
  type Adjustment,
  evaluateAmount,
  evaluateNumber,
  type NumberContext,
  parseSetRef,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgressionRule,
  type ReferenceVar,
  type SlotDecl,
} from './program-definition.ts';
import { isSlotActive, type PrescriptionSnapshot, requiredSetIndices, weekContextOf } from './program-prescription.ts';
import {
  compareWeeks,
  dayIndexOf,
  dayKeyOf,
  isCyclePosition,
  isPositionInSchedule,
  isRotationPosition,
  nextWeek,
  type Position,
  positionAt,
} from './program-schedule.ts';
import {
  type AfterSessionEffect,
  type DayRecord,
  type FactSet,
  type LiftOutcome,
  type ProgramFact,
  type ProgramState,
  type ReferenceChange,
  type ReferenceChangeReason,
  type SetReferenceFact,
} from './program-state.ts';
import { type WeightUnit } from './units.ts';

export interface LoggedLoad {
  weightKg: number;
  reps: number;
}

export const WEEKS_BACK_FACTOR = 0.975;

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

function dayOf(definition: ProgramDefinition, position: Position) {
  const dayKey = dayKeyOf(definition, position);
  return definition.schedule.days.find((day) => day.key === dayKey);
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

function combinedOutcome(a: LiftOutcome, b: LiftOutcome): LiftOutcome {
  if (a === 'missed' || b === 'missed') return 'missed';
  return a === 'met' || b === 'met' ? 'met' : 'neutral';
}

function ruleOutcomeAt(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  rule: ProgressionRule,
  position: Position,
  sets: readonly FactSet[],
): LiftOutcome {
  const slots = judgedSlotsOf(definition, enrollment, rule, position).filter(
    (slot) => requiredSetIndices(definition, enrollment, slot, position) !== null,
  );
  if (slots.length === 0) return 'neutral';
  const exerciseId = enrollment.bindings[rule.lift];
  const candidatesBySlot = slots.map((slot) => setsForSlot(sets, slot, exerciseId));
  if (candidatesBySlot.every((candidates) => candidates.length === 0)) return 'neutral';
  const allMet = slots.every((slot, slotIndex) => {
    const required = requiredSetIndices(definition, enrollment, slot, position) ?? [];
    return required.every((index) =>
      candidatesBySlot[slotIndex].some(
        (set) =>
          set.prescription?.ref === `${slot.id}:${index}` &&
          isSetMet(set, set.prescription, enrollment.rounding, enrollment.unit),
      ),
    );
  });
  return allMet ? 'met' : 'missed';
}

export interface LoggedDay {
  position: Position;
  sets: readonly FactSet[];
}

export function liftOutcomes(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  { position, sets }: LoggedDay,
): Readonly<Record<string, LiftOutcome>> {
  const outcomes: Record<string, LiftOutcome> = {};
  for (const rule of definition.progression) {
    if (judgedSlotsOf(definition, enrollment, rule, position).length === 0) continue;
    const outcome = ruleOutcomeAt(definition, enrollment, rule, position, sets);
    outcomes[rule.lift] = rule.lift in outcomes ? combinedOutcome(outcomes[rule.lift], outcome) : outcome;
  }
  return outcomes;
}

export function weeksBack(top: number, weeks: number): number {
  return top * WEEKS_BACK_FACTOR ** weeks;
}

function absoluteWeek(definition: ProgramDefinition, position: Position): number {
  const { week, cycle } = weekContextOf(position);
  const schedule = definition.schedule;
  return schedule.kind === 'cycle' ? (cycle - 1) * schedule.weeksPerCycle + week : week;
}

interface FoldContext {
  definition: ProgramDefinition;
  enrollment: ProgramEnrollment;
}

function setReference(
  state: ProgramState,
  lift: string,
  variable: ReferenceVar,
  to: number,
  reason: ReferenceChangeReason,
  position: Position,
): ProgramState {
  const from = state.refs[lift]?.[variable] ?? to;
  const change: ReferenceChange = { lift, var: variable, from, to, reason, position };
  return {
    ...state,
    refs: { ...state.refs, [lift]: { ...state.refs[lift], [variable]: to } },
    history: [...state.history, change],
  };
}

function adjustedValue(
  context: FoldContext,
  rule: ProgressionRule,
  adjustment: Adjustment,
  valueInEnrollmentUnit: number,
  position: Position,
): { value: number; reason: ReferenceChangeReason } | null {
  const { definition, enrollment } = context;
  const numbers: NumberContext = { definition, options: enrollment.options, cycle: weekContextOf(position).cycle };
  switch (adjustment.kind) {
    case 'increment': {
      if (!('byPct' in adjustment)) {
        return {
          value: valueInEnrollmentUnit + evaluateAmount(adjustment.by, enrollment.unit, numbers),
          reason: 'increment',
        };
      }
      const onRamp = definition.initial.find((initial) => initial.kind === 'onRamp' && initial.var === rule.var);
      if (onRamp?.kind === 'onRamp' && absoluteWeek(definition, position) < onRamp.peakWeek) {
        return { value: valueInEnrollmentUnit / onRamp.factor, reason: 'increment' };
      }
      return { value: valueInEnrollmentUnit * (1 + evaluateNumber(adjustment.byPct, numbers)), reason: 'increment' };
    }
    case 'tmReset':
      return { value: valueInEnrollmentUnit * (1 - evaluateNumber(adjustment.pct, numbers)), reason: 'tmReset' };
    default:
      return null;
  }
}

function applyOutcome(
  context: FoldContext,
  state: ProgramState,
  rule: ProgressionRule,
  outcome: LiftOutcome,
  position: Position,
): ProgramState {
  if (outcome === 'neutral') return state;
  const misses = outcome === 'met' ? 0 : (state.consecutiveMisses[rule.lift] ?? 0) + 1;
  let next: ProgramState = { ...state, consecutiveMisses: { ...state.consecutiveMisses, [rule.lift]: misses } };
  const adjustments = [...(outcome === 'met' ? rule.onMet : rule.onMiss), ...(rule.always ?? [])];
  for (const adjustment of adjustments) {
    const current = next.refs[rule.lift]?.[rule.var];
    if (current === undefined) continue;
    const adjusted = adjustedValue(context, rule, adjustment, current, position);
    if (adjusted) next = setReference(next, rule.lift, rule.var, adjusted.value, adjusted.reason, position);
  }
  return next;
}

function scopeOutcome(
  context: FoldContext,
  state: ProgramState,
  rule: ProgressionRule,
  inScope: (position: Position) => boolean,
): LiftOutcome {
  return state.days
    .filter((record) => record.epoch === state.epoch && record.status === 'completed' && inScope(record.position))
    .reduce<LiftOutcome>(
      (outcome, record) =>
        combinedOutcome(
          outcome,
          ruleOutcomeAt(context.definition, context.enrollment, rule, record.position, record.judgedSets),
        ),
      'neutral',
    );
}

function fireScopeTriggers(
  context: FoldContext,
  state: ProgramState,
  trigger: ProgressionRule['trigger'],
  inScope: (position: Position) => boolean,
): ProgramState {
  return context.definition.progression
    .filter((rule) => rule.trigger === trigger)
    .reduce(
      (next, rule) => applyOutcome(context, next, rule, scopeOutcome(context, next, rule, inScope), state.position),
      state,
    );
}

function rollOver(context: FoldContext, state: ProgramState): ProgramState {
  const ending = state.position;
  let next = fireScopeTriggers(context, state, 'endOfWeek', (position) => compareWeeks(position, ending) === 0);
  const schedule = context.definition.schedule;
  if (schedule.kind === 'cycle' && isCyclePosition(ending) && ending.week >= schedule.weeksPerCycle) {
    next = fireScopeTriggers(
      context,
      next,
      'endOfCycle',
      (position) => isCyclePosition(position) && position.cycle === ending.cycle,
    );
  }
  return { ...next, position: nextWeek(context.definition, ending), completedDays: [] };
}

function requiredDayKeys(definition: ProgramDefinition): string[] {
  return definition.schedule.days.filter((day) => !day.optional).map((day) => day.key);
}

function settleWeek(context: FoldContext, state: ProgramState): ProgramState {
  if (isRotationPosition(state.position)) return state;
  const required = requiredDayKeys(context.definition);
  if (required.every((key) => state.completedDays.includes(key))) return rollOver(context, state);
  const nextDay = required.find((key) => !state.completedDays.includes(key)) as string;
  return { ...state, position: positionAt(state.position, nextDay) };
}

function withCompletedDay(definition: ProgramDefinition, completedDays: readonly string[], dayKey: string): string[] {
  if (completedDays.includes(dayKey)) return [...completedDays];
  return [...completedDays, dayKey].sort((a, b) => dayIndexOf(definition, a) - dayIndexOf(definition, b));
}

function recordKey(epoch: number, position: Position): string {
  if (isRotationPosition(position)) return `${epoch}:${position.index}`;
  const week = isCyclePosition(position) ? `${position.cycle}.${position.week}` : `${position.week}`;
  return `${epoch}:${week}:${position.day}`;
}

function findRecord(state: ProgramState, position: Position): DayRecord | undefined {
  const index = state.dayIndex[recordKey(state.epoch, position)];
  return index === undefined ? undefined : state.days[index];
}

function withRecords(state: ProgramState, records: readonly DayRecord[]): ProgramState {
  const days = [...state.days];
  const dayIndex = { ...state.dayIndex };
  for (const record of records) {
    const key = recordKey(record.epoch, record.position);
    const index = dayIndex[key];
    if (index === undefined) {
      dayIndex[key] = days.length;
      days.push(record);
    } else {
      days[index] = record;
    }
  }
  return { ...state, days, dayIndex };
}

function hasRecord(state: ProgramState, position: Position): boolean {
  return findRecord(state, position) !== undefined;
}

function skippedRecord(epoch: number, position: Position): DayRecord {
  return { epoch, position, status: 'skipped', outcomes: {}, judgedSets: [], afterSession: null };
}

function skipUnfinishedDays(context: FoldContext, state: ProgramState): ProgramState {
  const pending = requiredDayKeys(context.definition)
    .filter((key) => !state.completedDays.includes(key))
    .map((key) => positionAt(state.position, key))
    .filter((position) => !hasRecord(state, position));
  return withRecords(
    state,
    pending.map((position) => skippedRecord(state.epoch, position)),
  );
}

function advanceToWeekOf(context: FoldContext, state: ProgramState, target: Position): ProgramState {
  let next = state;
  if (isRotationPosition(next.position) && isRotationPosition(target)) {
    const skipped: DayRecord[] = [];
    for (let index = next.position.index; index < target.index; index += 1) {
      if (!hasRecord(next, { index })) skipped.push(skippedRecord(next.epoch, { index }));
    }
    return { ...withRecords(next, skipped), position: { index: target.index } };
  }
  while (compareWeeks(next.position, target) < 0) {
    next = rollOver(context, skipUnfinishedDays(context, next));
  }
  return next;
}

function isBetterSet(context: FoldContext, candidate: FactSet, current: FactSet): boolean {
  const met = (set: FactSet) =>
    set.prescription !== null && isSetMet(set, set.prescription, context.enrollment.rounding, context.enrollment.unit);
  if (met(candidate) !== met(current)) return met(candidate);
  if (candidate.reps !== current.reps) return candidate.reps > current.reps;
  return candidate.weightKg > current.weightKg;
}

function judgedSetsOf(context: FoldContext, position: Position, sets: readonly FactSet[]): FactSet[] {
  const { definition, enrollment } = context;
  return definition.progression.flatMap((rule) =>
    judgedSlotsOf(definition, enrollment, rule, position).flatMap((slot) =>
      setsForSlot(sets, slot, enrollment.bindings[slot.lift]),
    ),
  );
}

function mergeBestSets(context: FoldContext, existing: readonly FactSet[], incoming: readonly FactSet[]): FactSet[] {
  const bestByRef = new Map<string, FactSet>();
  for (const set of [...existing, ...incoming]) {
    const ref = set.prescription?.ref as string;
    const current = bestByRef.get(ref);
    if (!current || isBetterSet(context, set, current)) bestByRef.set(ref, set);
  }
  return [...bestByRef.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, set]) => set);
}

function captureAfterSessionBaseline(
  state: ProgramState,
  rules: readonly ProgressionRule[],
): Pick<AfterSessionEffect, 'refsBefore' | 'missesBefore'> {
  const refsBefore: Record<string, Partial<Record<ReferenceVar, number>>> = {};
  const missesBefore: Record<string, number> = {};
  for (const rule of rules) {
    const value = state.refs[rule.lift]?.[rule.var];
    if (value !== undefined) refsBefore[rule.lift] = { ...refsBefore[rule.lift], [rule.var]: value };
    missesBefore[rule.lift] = state.consecutiveMisses[rule.lift] ?? 0;
  }
  return { refsBefore, missesBefore };
}

function withoutChanges(history: readonly ReferenceChange[], changes: readonly ReferenceChange[]): ReferenceChange[] {
  const remaining = [...history];
  for (const change of changes) {
    const key = JSON.stringify(change);
    const index = remaining.map((candidate) => JSON.stringify(candidate)).lastIndexOf(key);
    if (index >= 0) remaining.splice(index, 1);
  }
  return remaining;
}

function undoAfterSessionEffect(state: ProgramState, effect: AfterSessionEffect): ProgramState {
  const refs: Record<string, Partial<Record<ReferenceVar, number>>> = { ...state.refs };
  for (const [lift, values] of Object.entries(effect.refsBefore)) refs[lift] = { ...refs[lift], ...values };
  return {
    ...state,
    refs,
    consecutiveMisses: { ...state.consecutiveMisses, ...effect.missesBefore },
    history: withoutChanges(state.history, effect.changes),
  };
}

function recordDay(
  context: FoldContext,
  state: ProgramState,
  position: Position,
  sets: readonly FactSet[] | null,
): ProgramState {
  const existing = findRecord(state, position);
  if (sets === null) return existing ? state : withRecords(state, [skippedRecord(state.epoch, position)]);
  const { definition, enrollment } = context;
  const judgedSets = mergeBestSets(context, existing?.judgedSets ?? [], judgedSetsOf(context, position, sets));
  const outcomes = liftOutcomes(definition, enrollment, { position, sets: judgedSets });
  const previousSets = existing?.status === 'completed' ? existing.judgedSets : [];
  const rules = definition.progression.filter(
    (rule) => rule.trigger === 'afterSession' && judgedSlotsOf(definition, enrollment, rule, position).length > 0,
  );
  const rejudged = rules.some(
    (rule) =>
      ruleOutcomeAt(definition, enrollment, rule, position, judgedSets) !==
      ruleOutcomeAt(definition, enrollment, rule, position, previousSets),
  );
  const priorEffect = existing?.afterSession ?? null;
  const record: DayRecord = {
    epoch: state.epoch,
    position,
    status: 'completed',
    outcomes,
    judgedSets,
    afterSession: priorEffect,
  };
  if (!rejudged) return withRecords(state, [record]);
  const baselineState = priorEffect ? undoAfterSessionEffect(state, priorEffect) : state;
  const baseline = priorEffect ?? captureAfterSessionBaseline(baselineState, rules);
  const judged = rules.reduce(
    (next, rule) =>
      applyOutcome(context, next, rule, ruleOutcomeAt(definition, enrollment, rule, position, judgedSets), position),
    baselineState,
  );
  const changes = judged.history.slice(baselineState.history.length);
  return withRecords(judged, [
    { ...record, afterSession: { refsBefore: baseline.refsBefore, missesBefore: baseline.missesBefore, changes } },
  ]);
}

function applyDayFact(
  context: FoldContext,
  state: ProgramState,
  position: Position,
  sets: readonly FactSet[] | null,
): ProgramState {
  let next = compareWeeks(position, state.position) > 0 ? advanceToWeekOf(context, state, position) : state;
  const isCurrent = compareWeeks(position, next.position) === 0;
  next = recordDay(context, next, position, sets);
  if (!isCurrent) return next;
  if (isRotationPosition(position)) return { ...next, position: { index: position.index + 1 } };
  return settleWeek(context, {
    ...next,
    completedDays: withCompletedDay(context.definition, next.completedDays, position.day),
  });
}

function jumpTo(definition: ProgramDefinition, state: ProgramState, position: Position): ProgramState {
  const epoch = state.epoch + 1;
  if (isRotationPosition(position)) return { ...state, epoch, position, completedDays: [] };
  const targetIndex = dayIndexOf(definition, position.day);
  const skippedBefore = definition.schedule.days.slice(0, Math.max(targetIndex, 0)).map((day) => day.key);
  return { ...state, epoch, position, completedDays: skippedBefore };
}

function isValidReference(definition: ProgramDefinition, fact: SetReferenceFact): boolean {
  return (
    definition.lifts.some((lift) => lift.key === fact.lift) &&
    definition.referenceVars.includes(fact.var) &&
    Number.isFinite(fact.value) &&
    fact.value > 0
  );
}

function isApplicable(definition: ProgramDefinition, fact: ProgramFact): boolean {
  return fact.kind === 'set_reference'
    ? isValidReference(definition, fact)
    : isPositionInSchedule(definition, fact.position);
}

export function advanceProgram(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  state: ProgramState,
  fact: ProgramFact,
): ProgramState {
  if (!isApplicable(definition, fact)) return state;
  const context: FoldContext = { definition, enrollment };
  switch (fact.kind) {
    case 'set_reference':
      return setReference(state, fact.lift, fact.var, fact.value, 'set_reference', state.position);
    case 'jump_to':
      return jumpTo(definition, state, fact.position);
    case 'skip_day':
      return applyDayFact(context, state, fact.position, null);
    case 'session':
      return applyDayFact(context, state, fact.position, fact.sets);
  }
}
