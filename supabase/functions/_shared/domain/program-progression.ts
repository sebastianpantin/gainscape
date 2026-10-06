import { halfIncrementKg, type RoundingSetting } from './load-rounding.ts';
import { FLOAT_TOLERANCE } from './math.ts';
import {
  type Adjustment,
  evaluateAmount,
  evaluateNumber,
  parseSetRef,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgressionRule,
  type IncrementByAmount,
  type IncrementByPct,
  type NumberContext,
  type ReferenceVar,
  type SlotDecl,
  type StageRetest,
  stageRetestOf,
} from './program-definition.ts';
import {
  isRetestRef,
  isSlotActive,
  numberContext,
  type PrescriptionSnapshot,
  prescribedStageIndex,
  requiredSetIndices,
  RETEST_REPS,
  retestRefOf,
  type StageIndices,
  stageIndexOf,
  weekContextOf,
} from './program-prescription.ts';
import {
  compareWeeks,
  dayIndexOf,
  dayOf,
  isCyclePosition,
  isPositionInSchedule,
  isRotationPosition,
  nextWeek,
  type Position,
  positionAt,
} from './program-schedule.ts';
import {
  type DayRecord,
  type FactSet,
  type LiftOutcome,
  type ProgramFact,
  type ProgramState,
  type ReferenceChange,
  type ReferenceChangeReason,
  type RuleKey,
  type SetReferenceFact,
} from './program-state.ts';
import { advanceStage, isRetestPending, retestedStages } from './program-stages.ts';
import { rpeChartPct } from './rpe-chart.ts';
import { kgToUnit, shownWeight, type WeightUnit } from './units.ts';

export interface LoggedLoad {
  weightKg: number;
  reps: number;
}

const WEEKS_BACK_FACTOR = 0.975;

export function ruleKeyOf(rule: ProgressionRule): RuleKey {
  return `${rule.lift}:${rule.var}:${rule.trigger}`;
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
  stages: StageIndices,
): LiftOutcome {
  const exerciseId = enrollment.bindings[rule.lift];
  const judged = judgedSlotsOf(definition, enrollment, rule, position).flatMap((slot) => {
    const candidates = setsForSlot(sets, slot, exerciseId);
    const prescribedStages =
      slot.scheme.kind === 'stages'
        ? { ...stages, [slot.lift]: prescribedStageIndex(slot.scheme, candidates, stages, slot.lift) }
        : stages;
    const required = requiredSetIndices(definition, enrollment, slot, position, prescribedStages);
    return required === null ? [] : [{ slot, required, candidates }];
  });
  if (judged.length === 0) return 'neutral';
  if (judged.every(({ candidates }) => candidates.length === 0)) return 'neutral';
  const allMet = judged.every(({ slot, required, candidates }) =>
    required.every((index) =>
      candidates.some(
        (set) =>
          set.prescription?.ref === `${slot.id}:${index}` &&
          isSetMet(set, set.prescription, enrollment.rounding, enrollment.unit),
      ),
    ),
  );
  return allMet ? 'met' : 'missed';
}

export interface LoggedDay {
  position: Position;
  sets: readonly FactSet[];
  stages: StageIndices;
}

export function liftOutcomes(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  { position, sets, stages }: LoggedDay,
): Readonly<Record<string, LiftOutcome>> {
  const outcomes: Record<string, LiftOutcome> = {};
  for (const rule of definition.progression) {
    if (judgedSlotsOf(definition, enrollment, rule, position).length === 0) continue;
    const outcome = ruleOutcomeAt(definition, enrollment, rule, position, sets, stages);
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

const MAX_RPE = 10;

function loggedRpeOf(set: FactSet): number | null {
  if (set.effortValue === null) return null;
  if (set.effortInputType === 'rpe') return set.effortValue;
  return set.effortInputType === 'rir' ? MAX_RPE - set.effortValue : null;
}

function waveIndexOf(definition: ProgramDefinition, position: Position): number {
  const schedule = definition.schedule;
  if (schedule.kind !== 'cycle' || !schedule.waveWeeks) return 0;
  return Math.floor((weekContextOf(position).week - 1) / schedule.waveWeeks);
}

export type FinalDaySets = Readonly<Record<string, readonly FactSet[]>>;

interface FoldContext {
  definition: ProgramDefinition;
  enrollment: ProgramEnrollment;
  finalSets?: FinalDaySets;
}

export function setReference(
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

function loggedSetAt(sets: readonly FactSet[], setIndex: number): FactSet | undefined {
  return sets
    .filter((set) => set.prescription !== null && parseSetRef(set.prescription.ref)?.index === setIndex)
    .reduce<FactSet | undefined>((best, set) => (best === undefined || set.reps > best.reps ? set : best), undefined);
}

interface AdjustmentInput<A extends Adjustment> {
  context: FoldContext;
  state: ProgramState;
  rule: ProgressionRule;
  adjustment: A;
  position: Position;
  sets: readonly FactSet[];
  current: number;
  numbers: NumberContext;
  changeTo: (value: number, reason: ReferenceChangeReason) => ProgramState;
}

type AdjustmentHandlers = {
  [K in Adjustment['kind']]: (input: AdjustmentInput<Extract<Adjustment, { kind: K }>>) => ProgramState;
};

function incremented({
  context,
  state,
  rule,
  adjustment,
  position,
  current,
  numbers,
  changeTo,
}: AdjustmentInput<IncrementByAmount | IncrementByPct>): ProgramState {
  const { definition, enrollment } = context;
  if (!('byPct' in adjustment)) {
    const opening = adjustment.opening;
    const opens = opening !== undefined && (state.successes[ruleKeyOf(rule)] ?? 0) < opening.times;
    const amount = opens ? opening.by : adjustment.by;
    return changeTo(current + evaluateAmount(amount, enrollment.unit, numbers), 'increment');
  }
  const onRamp = definition.initial.find((initial) => initial.kind === 'onRamp' && initial.var === rule.var);
  if (onRamp?.kind === 'onRamp' && absoluteWeek(definition, position) < onRamp.peakWeek) {
    return changeTo(current / onRamp.factor, 'increment');
  }
  return changeTo(current * (1 + evaluateNumber(adjustment.byPct, numbers)), 'increment');
}

const ADJUSTMENT_HANDLERS: AdjustmentHandlers = {
  increment: incremented,
  hold: ({ state }) => state,
  customRule: ({ state }) => state,
  tmReset: ({ adjustment, current, numbers, changeTo }) =>
    changeTo(current * (1 - evaluateNumber(adjustment.pct, numbers)), 'tmReset'),
  failureCounter: ({ state, rule, adjustment, current, numbers, changeTo }) => {
    const key = ruleKeyOf(rule);
    if ((state.consecutiveMisses[key] ?? 0) < adjustment.threshold) return state;
    const deloaded = changeTo(current * (1 - evaluateNumber(adjustment.deloadPct, numbers)), 'adjustment');
    return { ...deloaded, consecutiveMisses: { ...deloaded.consecutiveMisses, [key]: 0 } };
  },
  stageMachine: ({ context, state, rule, adjustment, current, position }) =>
    advanceStage(context.definition, context.enrollment.unit, state, rule, adjustment.onLastFail, current, position),
  amrapThreshold: ({ context, state, adjustment, sets, current, changeTo }) => {
    const reps = loggedSetAt(sets, adjustment.setIndex)?.reps;
    if (reps === undefined || reps < adjustment.reps) return state;
    return changeTo(current + context.enrollment.rounding.increment, 'increment');
  },
  amrapTable: ({ context, state, adjustment, sets, current, changeTo }) => {
    const reps = loggedSetAt(sets, adjustment.setIndex)?.reps;
    const band = adjustment.bands.filter(([minReps]) => reps !== undefined && reps >= minReps).at(-1);
    const amount = band?.[1][context.enrollment.unit] ?? 0;
    return amount === 0 ? state : changeTo(current + amount, 'increment');
  },
  repsOverStandard: ({ context, state, adjustment, position, sets, current, numbers, changeTo }) => {
    const reps = loggedSetAt(sets, adjustment.setIndex)?.reps;
    const standard = adjustment.standardByWave[waveIndexOf(context.definition, position)];
    if (reps === undefined || standard === undefined || reps <= standard) return state;
    const perRep = evaluateAmount(adjustment.perRep, context.enrollment.unit, numbers);
    return changeTo(current + Math.min(reps - standard, adjustment.cap) * perRep, 'increment');
  },
  e1rmFromSet: ({ context, state, adjustment, sets, changeTo }) => {
    const set = loggedSetAt(sets, adjustment.setIndex);
    const rpe = set ? loggedRpeOf(set) : null;
    const pct = set && rpe !== null ? rpeChartPct(set.reps, rpe) : null;
    if (!set || pct === null) return state;
    return changeTo(kgToUnit(set.weightKg, context.enrollment.unit) / pct, 'adjustment');
  },
};

function applyAdjustment(
  context: FoldContext,
  state: ProgramState,
  rule: ProgressionRule,
  adjustment: Adjustment,
  position: Position,
  sets: readonly FactSet[],
): ProgramState {
  const current = state.refs[rule.lift]?.[rule.var];
  if (current === undefined) return state;
  const handler = ADJUSTMENT_HANDLERS[adjustment.kind] as (input: AdjustmentInput<Adjustment>) => ProgramState;
  return handler({
    context,
    state,
    rule,
    adjustment,
    position,
    sets,
    current,
    numbers: numberContext(context.definition, context.enrollment, position),
    changeTo: (value, reason) => setReference(state, rule.lift, rule.var, value, reason, position),
  });
}

interface Judgement {
  outcome: LiftOutcome;
  sets: readonly FactSet[];
}

function judgementAt(
  context: FoldContext,
  rule: ProgressionRule,
  position: Position,
  sets: readonly FactSet[],
  stages: StageIndices,
): Judgement {
  const { definition, enrollment } = context;
  return {
    outcome: ruleOutcomeAt(definition, enrollment, rule, position, sets, stages),
    sets: judgedSlotsOf(definition, enrollment, rule, position).flatMap((slot) =>
      setsForSlot(sets, slot, enrollment.bindings[rule.lift]),
    ),
  };
}

function applyOutcome(
  context: FoldContext,
  state: ProgramState,
  rule: ProgressionRule,
  { outcome, sets }: Judgement,
  position: Position,
): ProgramState {
  if (outcome === 'neutral') return state;
  const key = ruleKeyOf(rule);
  const misses = outcome === 'met' ? 0 : (state.consecutiveMisses[key] ?? 0) + 1;
  const adjustments = [...(outcome === 'met' ? rule.onMet : rule.onMiss), ...(rule.always ?? [])];
  const adjusted = adjustments.reduce<ProgramState>(
    (next, adjustment) => applyAdjustment(context, next, rule, adjustment, position, sets),
    { ...state, consecutiveMisses: { ...state.consecutiveMisses, [key]: misses } },
  );
  if (outcome !== 'met') return adjusted;
  return { ...adjusted, successes: { ...adjusted.successes, [key]: (adjusted.successes[key] ?? 0) + 1 } };
}

function scopeJudgement(
  context: FoldContext,
  state: ProgramState,
  rule: ProgressionRule,
  scope: readonly Position[],
): Judgement {
  return scope
    .map((position) => findRecord(state, position))
    .filter((record): record is DayRecord => record?.status === 'completed')
    .reduce<Judgement>(
      (judgement, record) => {
        const day = judgementAt(context, rule, record.position, record.judgedSets, record.stages ?? state.stages);
        return { outcome: combinedOutcome(judgement.outcome, day.outcome), sets: [...judgement.sets, ...day.sets] };
      },
      { outcome: 'neutral', sets: [] },
    );
}

function fireScopeTriggers(
  context: FoldContext,
  state: ProgramState,
  trigger: ProgressionRule['trigger'],
  scope: readonly Position[],
): ProgramState {
  return context.definition.progression
    .filter((rule) => rule.trigger === trigger)
    .reduce(
      (next, rule) => applyOutcome(context, next, rule, scopeJudgement(context, next, rule, scope), state.position),
      state,
    );
}

function weekPositions(definition: ProgramDefinition, week: Position): Position[] {
  return definition.schedule.days.map((day) => positionAt(week, day.key));
}

function rollOver(context: FoldContext, state: ProgramState): ProgramState {
  const { definition } = context;
  const ending = state.position;
  let next = fireScopeTriggers(context, state, 'endOfWeek', weekPositions(definition, ending));
  const schedule = definition.schedule;
  if (
    schedule.kind === 'cycle' &&
    schedule.waveWeeks &&
    isCyclePosition(ending) &&
    ending.week % schedule.waveWeeks === 0
  ) {
    const waveWeeks = Array.from({ length: schedule.waveWeeks }, (_, index) =>
      weekPositions(definition, { ...ending, week: ending.week - index }),
    );
    next = fireScopeTriggers(context, next, 'endOfWave', waveWeeks.flat());
  }
  if (schedule.kind === 'cycle' && isCyclePosition(ending) && ending.week >= schedule.weeksPerCycle) {
    const cycleWeeks = Array.from({ length: schedule.weeksPerCycle }, (_, index) =>
      weekPositions(definition, { cycle: ending.cycle, week: index + 1, day: ending.day }),
    );
    next = fireScopeTriggers(context, next, 'endOfCycle', cycleWeeks.flat());
  }
  return { ...next, position: nextWeek(definition, ending), completedDays: [] };
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
  return { epoch, position, status: 'skipped', outcomes: {}, judgedSets: [] };
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
  if (candidate.prescription !== null && isRetestRef(candidate.prescription.ref))
    return candidate.weightKg > current.weightKg;
  if (candidate.reps !== current.reps) return candidate.reps > current.reps;
  return candidate.weightKg > current.weightKg;
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

function judgedSetsOf(context: FoldContext, position: Position, sets: readonly FactSet[]): FactSet[] {
  const { definition, enrollment } = context;
  return definition.progression.flatMap((rule) =>
    judgedSlotsOf(definition, enrollment, rule, position).flatMap((slot) => {
      const exerciseId = enrollment.bindings[slot.lift];
      const judged = setsForSlot(sets, slot, exerciseId);
      return stageRetestOf(rule) ? [...judged, ...retestAttemptOf(sets, slot, exerciseId)] : judged;
    }),
  );
}

function retestedFromSession(
  context: FoldContext,
  state: ProgramState,
  rule: ProgressionRule,
  retest: StageRetest,
  position: Position,
  judgedSets: readonly FactSet[],
): ProgramState {
  const { definition, enrollment } = context;
  const refs = judgedSlotsOf(definition, enrollment, rule, position).map((slot) => retestRefOf(slot.id));
  const attempt = heaviestSet(judgedSets.filter((set) => set.prescription && refs.includes(set.prescription.ref)));
  if (!attempt) return state;
  const value = shownWeight(attempt.weightKg, enrollment.unit);
  if (value <= 0) return state;
  return retestedStages(
    definition,
    setReference(state, rule.lift, retest.from, value, 'adjustment', position),
    { lift: rule.lift, var: retest.from, value },
    position,
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

function dayStagesOf(definition: ProgramDefinition, state: ProgramState, position: Position): StageIndices {
  return Object.fromEntries(
    (dayOf(definition, position)?.slots ?? []).flatMap((slot) =>
      slot.scheme.kind === 'stages' ? [[slot.lift, stageIndexOf(slot.scheme, state.stages, slot.lift)]] : [],
    ),
  );
}

function recordDay(
  context: FoldContext,
  state: ProgramState,
  position: Position,
  sets: readonly FactSet[] | null,
): ProgramState {
  const existing = findRecord(state, position);
  if (sets === null) return existing ? state : withRecords(state, [skippedRecord(state.epoch, position)]);
  if (existing?.status === 'completed') return state;
  const { definition, enrollment } = context;
  const judgedSets =
    context.finalSets?.[recordKey(state.epoch, position)] ??
    mergeBestSets(context, [], judgedSetsOf(context, position, sets));
  const stages = dayStagesOf(definition, state, position);
  const outcomes = liftOutcomes(definition, enrollment, { position, sets: judgedSets, stages });
  const record: DayRecord = { epoch: state.epoch, position, status: 'completed', outcomes, judgedSets, stages };
  return definition.progression
    .filter((rule) => rule.trigger === 'afterSession')
    .reduce(
      (next, rule) => {
        const retest = stageRetestOf(rule);
        return retest && isRetestPending(next, rule.lift, retest.from)
          ? retestedFromSession(context, next, rule, retest, position, judgedSets)
          : applyOutcome(context, next, rule, judgementAt(context, rule, position, judgedSets, stages), position);
      },
      withRecords(state, [record]),
    );
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
    definition.inputs.some((input) => input.lifts.includes(fact.lift)) &&
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
  finalSets?: FinalDaySets,
): ProgramState {
  if (!isApplicable(definition, fact)) return state;
  const context: FoldContext = { definition, enrollment, finalSets };
  switch (fact.kind) {
    case 'set_reference':
      return retestedStages(
        definition,
        setReference(state, fact.lift, fact.var, fact.value, 'set_reference', state.position),
        fact,
        state.position,
      );
    case 'jump_to':
      return jumpTo(definition, state, fact.position);
    case 'skip_day':
      return applyDayFact(context, state, fact.position, null);
    case 'session':
      return applyDayFact(context, state, fact.position, fact.sets);
  }
}

export function finalDaySets(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  orderedFacts: readonly ProgramFact[],
): FinalDaySets {
  const context: FoldContext = { definition, enrollment };
  const finalSets: Record<string, FactSet[]> = {};
  let epoch = 0;
  for (const fact of orderedFacts) {
    if (!isApplicable(definition, fact)) continue;
    if (fact.kind === 'jump_to') epoch += 1;
    if (fact.kind !== 'session') continue;
    const key = recordKey(epoch, fact.position);
    finalSets[key] = mergeBestSets(context, finalSets[key] ?? [], judgedSetsOf(context, fact.position, fact.sets));
  }
  return finalSets;
}
