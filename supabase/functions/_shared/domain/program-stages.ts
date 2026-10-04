import {
  type ProgramDefinition,
  type ProgressionRule,
  type ReferenceVar,
  type StageLastFail,
} from './program-definition.ts';
import { setReference } from './program-progression.ts';
import { type Position } from './program-schedule.ts';
import { type ProgramState, type SetReferenceFact } from './program-state.ts';
import { type WeightUnit } from './units.ts';

function stageCountOf(definition: ProgramDefinition, rule: ProgressionRule): number {
  const counts = definition.schedule.days
    .flatMap((day) => day.slots)
    .flatMap((slot) =>
      rule.judgedSlots.includes(slot.id) && slot.scheme.kind === 'stages' ? [slot.scheme.stages.length] : [],
    );
  return Math.max(0, ...counts);
}

function withStage(state: ProgramState, lift: string, stage: number): ProgramState {
  return { ...state, stages: { ...state.stages, [lift]: stage } };
}

export function advanceStage(
  definition: ProgramDefinition,
  unit: WeightUnit,
  state: ProgramState,
  rule: ProgressionRule,
  onLastFail: StageLastFail,
  current: number,
  position: Position,
): ProgramState {
  const stage = state.stages[rule.lift] ?? 0;
  if (stage < stageCountOf(definition, rule) - 1) {
    const base = stage === 0 ? { stageResetBases: { ...state.stageResetBases, [rule.lift]: current } } : {};
    return { ...withStage(state, rule.lift, stage + 1), ...base };
  }
  if (onLastFail.kind === 'retest')
    return { ...state, pendingRetests: { ...state.pendingRetests, [rule.lift]: onLastFail.from } };
  const base = state.stageResetBases[rule.lift] ?? current;
  const add = onLastFail.add[unit];
  return withStage(setReference(state, rule.lift, rule.var, base + add, 'adjustment', position), rule.lift, 0);
}

function retestOf(rule: ProgressionRule): { pct: number; from: ReferenceVar } | null {
  for (const adjustment of [...rule.onMet, ...rule.onMiss, ...(rule.always ?? [])]) {
    if (adjustment.kind === 'stageMachine' && adjustment.onLastFail.kind === 'retest') return adjustment.onLastFail;
  }
  return null;
}

export function isRetestPending(
  state: Pick<ProgramState, 'pendingRetests'>,
  lift: string,
  variable: ReferenceVar,
): boolean {
  return state.pendingRetests[lift] === variable;
}

function withoutPendingRetest(state: ProgramState, lift: string): ProgramState {
  const pendingRetests = Object.fromEntries(Object.entries(state.pendingRetests).filter(([key]) => key !== lift));
  return { ...state, pendingRetests };
}

export function retestedStages(
  definition: ProgramDefinition,
  state: ProgramState,
  fact: SetReferenceFact,
): ProgramState {
  return definition.progression
    .filter((rule) => rule.lift === fact.lift && rule.var !== fact.var)
    .reduce((next, rule) => {
      const retest = retestOf(rule);
      if (retest?.from !== fact.var || !isRetestPending(next, rule.lift, fact.var)) return next;
      const restarted = setReference(next, rule.lift, rule.var, fact.value * retest.pct, 'adjustment', next.position);
      return withStage(withoutPendingRetest(restarted, rule.lift), rule.lift, 0);
    }, state);
}
