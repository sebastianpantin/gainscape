import { type ExerciseStrength, REP_MAX_SLOT_COUNT, type StrengthState } from '@domain/index.ts';
import { isRecord } from '@domain/types.ts';
import { parsedJson } from './json-rules.ts';

export interface RecordBaseline {
  repMaxKg: Readonly<Record<string, readonly (number | null)[]>>;
  maxReps: Readonly<Record<string, number>>;
}

export interface SessionBaseline {
  asOf: string;
  strength: StrengthState;
  records: RecordBaseline | null;
}

export function sessionBaselineAsOf(
  asOf: string | null,
  loaded: SessionBaseline | null,
  saved: SessionBaseline | null,
): SessionBaseline | null {
  return [loaded, saved].find((baseline) => baseline !== null && baseline.asOf === asOf) ?? null;
}

export const RECORD_BASELINE_COLUMNS = {
  repMaxes: 'exercise_id, reps, load_kg',
  bodyweightRecords: 'exercise_id, max_reps',
} as const;

export interface RecordBaselineRows {
  repMaxes: readonly { exercise_id: string; reps: number; load_kg: number | string }[];
  bodyweightRecords: readonly { exercise_id: string; max_reps: number }[];
}

export function recordBaselineFrom(rows: RecordBaselineRows): RecordBaseline {
  const repMaxKg: Record<string, (number | null)[]> = {};
  for (const row of rows.repMaxes) {
    const slots = (repMaxKg[row.exercise_id] ??= Array.from({ length: REP_MAX_SLOT_COUNT }, () => null));
    slots[row.reps - 1] = Number(row.load_kg);
  }
  return {
    repMaxKg,
    maxReps: Object.fromEntries(rows.bodyweightRecords.map((row) => [row.exercise_id, row.max_reps])),
  };
}

function isNullableNumber(value: unknown): value is number | null {
  return value === null || typeof value === 'number';
}

function isRecordOf<Value>(
  value: unknown,
  isValue: (entry: unknown) => entry is Value,
): value is Record<string, Value> {
  return isRecord(value) && Object.values(value).every(isValue);
}

function isStrength(value: unknown): value is ExerciseStrength {
  return (
    isRecord(value) &&
    isNullableNumber(value.windowMax) &&
    isNullableNumber(value.fallbackMax) &&
    typeof value.hasPriorSession === 'boolean'
  );
}

function isSlots(value: unknown): value is (number | null)[] {
  return Array.isArray(value) && value.length === REP_MAX_SLOT_COUNT && value.every(isNullableNumber);
}

function isRecordBaseline(value: unknown): value is RecordBaseline {
  return (
    isRecord(value) &&
    isRecordOf(value.repMaxKg, isSlots) &&
    isRecordOf(value.maxReps, (entry): entry is number => typeof entry === 'number')
  );
}

export function parseSessionBaseline(raw: string | null): SessionBaseline | null {
  const parsed = parsedJson(raw);
  if (!isRecord(parsed) || typeof parsed.asOf !== 'string') return null;
  if (!isRecordOf(parsed.strength, isStrength) || !(parsed.records === null || isRecordBaseline(parsed.records)))
    return null;
  return { asOf: parsed.asOf, strength: parsed.strength, records: parsed.records };
}
