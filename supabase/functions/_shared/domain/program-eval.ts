import {
  type NumberExpr,
  type OptionValue,
  type ProgramDefinition,
  type ProgressionRule,
  type SlotDecl,
  type StageRetest,
  type UnitAmountExpr,
} from './program-types.ts';
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

interface SetRef {
  slotId: string;
  index: number;
}

export function parseSetRef(ref: string): SetRef | null {
  const separator = ref.lastIndexOf(':');
  if (separator <= 0) return null;
  const index = Number(ref.slice(separator + 1));
  if (!Number.isInteger(index) || index < 0) return null;
  return { slotId: ref.slice(0, separator), index };
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
