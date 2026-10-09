import { parsedDecimal, type StepDirection, steppedOnGrid, typedNumberWithin } from './units.ts';

export interface NumberFieldRange {
  lowest: number;
  highest: number;
  wholeNumber: boolean;
}

export interface TypedNumberText {
  text: string;
  value: number;
}

export interface TypedNumberChange {
  commit: number | null;
  typed: TypedNumberText;
}

export interface ShownNumberText {
  text: string;
  matchesValue: boolean;
}

export function typedNumberChange(text: string, value: number, range: NumberFieldRange): TypedNumberChange {
  const next = typedNumberWithin(text, range.lowest, range.highest, range.wholeNumber);
  const commit = next !== null && next !== value ? next : null;
  return { commit, typed: { text, value: commit ?? value } };
}

export function shownNumberText(typed: TypedNumberText | null, value: number): ShownNumberText {
  if (typed === null || typed.value !== value) return { text: String(value), matchesValue: true };
  return { text: typed.text, matchesValue: parsedDecimal(typed.text) === value };
}

const STEP_KEYS: Partial<Record<string, StepDirection>> = { ArrowUp: 1, ArrowDown: -1 };

export function stepDirectionForKey(key: string): StepDirection | null {
  return STEP_KEYS[key] ?? null;
}

export function steppedFieldValue(
  value: number,
  direction: StepDirection,
  step: number,
  range: NumberFieldRange,
): number {
  return steppedOnGrid(value, step, direction, range.lowest, range.highest);
}
