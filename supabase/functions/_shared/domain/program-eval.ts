import {
  type NumberExpr,
  type OptionValue,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgressionRule,
  type SlotDecl,
  type StageRetest,
  type UnitAmountExpr,
} from './program-types.ts';
import { type Position, weekContextOf } from './program-schedule.ts';
import { type WeightUnit } from './units.ts';

export function stageRetestOf(rule: ProgressionRule): StageRetest | null {
  for (const adjustment of [...rule.onMet, ...rule.onMiss, ...(rule.always ?? [])]) {
    if (adjustment.kind === 'stageMachine' && adjustment.onLastFail.kind === 'retest') return adjustment.onLastFail;
  }
  return null;
}

export interface NumberContext {
  definition: ProgramDefinition;
  options: Readonly<Record<string, OptionValue>>;
  cycle: number;
}

export function numberContext(
  definition: ProgramDefinition,
  enrollment: ProgramEnrollment,
  position: Position,
): NumberContext {
  return { definition, options: enrollment.options, cycle: weekContextOf(position).cycle };
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

export function isBarbellLift(definition: ProgramDefinition, lift: string): boolean {
  return definition.lifts.find((candidate) => candidate.key === lift)?.barbell !== false;
}

export function findSlot(definition: ProgramDefinition, slotId: string): SlotDecl | undefined {
  for (const day of definition.schedule.days) {
    const slot = day.slots.find((candidate) => candidate.id === slotId);
    if (slot) return slot;
  }
  return undefined;
}
