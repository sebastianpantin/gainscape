import { MAX_RPE } from './effort.ts';
import { roundPrescribedLoad } from './load-rounding.ts';
import { compareStrings } from './ordering.ts';
import {
  type Adjustment,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgressionRule,
  type IncrementByAmount,
  type IncrementByPct,
  type StageIndices,
} from './program-types.ts';
import {
  combinedVerdict,
  dayStagesOf,
  isRetestRef,
  isSetMet,
  type Judgement,
  judgedDaySets,
  judgeRule,
  liftVerdicts,
  parseSetRef,
  type RetestAttempt,
  retestAttemptsOf,
} from './program-day.ts';
import {
  evaluateAmount,
  evaluateNumber,
  isBarbellLift,
  numberContext,
  type NumberContext,
  stageRetestOf,
} from './program-eval.ts';
import {
  compareWeeks,
  dayIndexOf,
  isCyclePosition,
  isPositionInSchedule,
  isRotationPosition,
  nextWeek,
  type Position,
  positionAt,
  weekContextOf,
} from './program-schedule.ts';
import {
  type DayRecord,
  type FactSet,
  type ProgramFact,
  type ProgramState,
  type ReferenceChangeReason,
  ruleKeyOf,
  type SetReferenceFact,
  setReference,
} from './program-state.ts';
import { advanceStage, isRetestPending, retestedStages } from './program-stages.ts';
import { rpeChartPct } from './rpe-chart.ts';
import { kgToUnit, shownWeight } from './units.ts';

function absoluteWeek(definition: ProgramDefinition, position: Position): number {
  const { week, cycle } = weekContextOf(position);
  const schedule = definition.schedule;
  return schedule.kind === 'cycle' ? (cycle - 1) * schedule.weeksPerCycle + week : week;
}

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

type FinalDaySets = Readonly<Record<string, readonly FactSet[]>>;

interface FoldContext {
  definition: ProgramDefinition;
  enrollment: ProgramEnrollment;
  finalSets?: FinalDaySets;
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
  failureCounter: ({ context, state, rule, adjustment, current, numbers, changeTo }) => {
    const key = ruleKeyOf(rule);
    if ((state.consecutiveMisses[key] ?? 0) < adjustment.threshold) return state;
    const { definition, enrollment } = context;
    const deloadedLoad = roundPrescribedLoad(
      current * (1 - evaluateNumber(adjustment.deloadPct, numbers)),
      enrollment.rounding,
      isBarbellLift(definition, rule.lift),
    );
    const deloaded = changeTo(deloadedLoad, 'adjustment');
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

function judgementAt(
  context: FoldContext,
  rule: ProgressionRule,
  position: Position,
  sets: readonly FactSet[],
  stages: StageIndices,
): Judgement {
  return judgeRule(context.definition, context.enrollment, rule, position, sets, stages);
}

function applyOutcome(
  context: FoldContext,
  state: ProgramState,
  rule: ProgressionRule,
  { verdict, sets }: Judgement,
  position: Position,
): ProgramState {
  if (verdict === 'neutral') return state;
  const key = ruleKeyOf(rule);
  const misses = verdict === 'met' ? 0 : (state.consecutiveMisses[key] ?? 0) + 1;
  const adjustments = [...(verdict === 'met' ? rule.onMet : rule.onMiss), ...(rule.always ?? [])];
  const adjusted = adjustments.reduce<ProgramState>(
    (next, adjustment) => applyAdjustment(context, next, rule, adjustment, position, sets),
    { ...state, consecutiveMisses: { ...state.consecutiveMisses, [key]: misses } },
  );
  if (verdict !== 'met') return adjusted;
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
        return { verdict: combinedVerdict(judgement.verdict, day.verdict), sets: [...judgement.sets, ...day.sets] };
      },
      { verdict: 'neutral', sets: [] },
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

function retested(context: FoldContext, state: ProgramState, attempt: RetestAttempt, position: Position): ProgramState {
  const value = shownWeight(attempt.weightKg, context.enrollment.unit);
  if (value <= 0) return state;
  return retestedStages(
    context.definition,
    setReference(state, attempt.lift, attempt.from, value, 'adjustment', position),
    { lift: attempt.lift, var: attempt.from, value },
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
  return [...bestByRef.entries()].sort(([a], [b]) => compareStrings(a, b)).map(([, set]) => set);
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
    mergeBestSets(context, [], judgedDaySets(definition, enrollment, position, sets));
  const stages = dayStagesOf(definition, state.stages, position);
  const outcomes = liftVerdicts(definition, enrollment, { position, sets: judgedSets, stages });
  const record: DayRecord = { epoch: state.epoch, position, status: 'completed', outcomes, judgedSets, stages };
  const retests = retestAttemptsOf(definition, enrollment, state, position, judgedSets);
  const afterRetests = retests.reduce(
    (next, attempt) => retested(context, next, attempt, position),
    withRecords(state, [record]),
  );
  return definition.progression
    .filter((rule) => rule.trigger === 'afterSession')
    .reduce((next, rule) => {
      const retest = stageRetestOf(rule);
      if (retest && isRetestPending(next, rule.lift, retest.from)) return next;
      return applyOutcome(context, next, rule, judgementAt(context, rule, position, judgedSets, stages), position);
    }, afterRetests);
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
    finalSets[key] = mergeBestSets(
      context,
      finalSets[key] ?? [],
      judgedDaySets(definition, enrollment, fact.position, fact.sets),
    );
  }
  return finalSets;
}
