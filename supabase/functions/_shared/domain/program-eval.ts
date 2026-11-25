import {
  type NumberExpr,
  type OptionValue,
  type PctOfSlotLoad,
  type ProgramDefinition,
  type ProgramEnrollment,
  type ProgressionRule,
  type RpeLoad,
  type SlotDecl,
  type StageRetest,
  type UnitAmountExpr,
} from './program-types.ts';
import { type Position, weekContextOf } from './program-schedule.ts';
import { rpeChartPct } from './rpe-chart.ts';
import { type UnitAmount, type WeightUnit } from './units.ts';

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

export function smallestNumber(definition: ProgramDefinition, expr: NumberExpr): number | null {
  if (typeof expr === 'number') return expr;
  if (typeof expr !== 'object' || expr === null) return null;
  if ('byCycle' in expr) return expr.byCycle.length > 0 ? Math.min(...expr.byCycle) : null;
  const option = definition.options.find((candidate) => candidate.key === expr.option);
  if (option?.kind === 'number') return option.min;
  const values = option?.values ?? [];
  const numbers = values.filter((value) => typeof value === 'number');
  return numbers.length > 0 && numbers.length === values.length ? Math.min(...numbers) : null;
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

export type PctOfSlotTarget =
  { kind: 'slot'; slot: SlotDecl } | { kind: 'noCurrentWeek' } | { kind: 'unknownDay' } | { kind: 'slotNotOnDay' };

export function pctOfSlotTarget(definition: ProgramDefinition, load: PctOfSlotLoad): PctOfSlotTarget {
  if (definition.schedule.kind === 'rotation') return { kind: 'noCurrentWeek' };
  const day = definition.schedule.days.find((candidate) => candidate.key === load.day);
  if (!day) return { kind: 'unknownDay' };
  const slot = day.slots.find((candidate) => candidate.id === load.slot);
  return slot ? { kind: 'slot', slot } : { kind: 'slotNotOnDay' };
}

export function rpeLoadPct(load: RpeLoad): number | null {
  return rpeChartPct(load.reps, load.rpe);
}

export type AmrapBand = readonly [minReps: number, amount: UnitAmount];

export function areAmrapBandsRising(bands: readonly AmrapBand[]): boolean {
  return bands.every(([minReps], index) => index === 0 || minReps > bands[index - 1][0]);
}

export function amrapBandAmount(bands: readonly AmrapBand[], reps: number | undefined): UnitAmount | undefined {
  return bands.filter(([minReps]) => reps !== undefined && reps >= minReps).at(-1)?.[1];
}
