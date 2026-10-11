import { type ExerciseStrength, REP_MAX_SLOT_COUNT, type StrengthState } from '@domain/index.ts';
import { CARDIO_RECORD_KINDS, type CardioRecordKind, isRecord } from '@domain/types.ts';
import { parsedJson } from './json-rules.ts';

export interface RecordBaseline {
  repMaxKg: Readonly<Record<string, readonly (number | null)[]>>;
  maxReps: Readonly<Record<string, number>>;
  cardioBest?: Readonly<Record<string, Partial<Record<CardioRecordKind, number>>>>;
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
  cardioRecords: 'exercise_id, kind, value',
} as const;

export interface RecordBaselineRows {
  repMaxes: readonly { exercise_id: string; reps: number; load_kg: number | string }[];
  bodyweightRecords: readonly { exercise_id: string; max_reps: number }[];
  cardioRecords: readonly { exercise_id: string; kind: CardioRecordKind; value: number | string }[];
}

export function recordBaselineFrom(rows: RecordBaselineRows): RecordBaseline {
  const repMaxKg: Record<string, (number | null)[]> = {};
  for (const row of rows.repMaxes) {
    const slots = (repMaxKg[row.exercise_id] ??= Array.from({ length: REP_MAX_SLOT_COUNT }, () => null));
    slots[row.reps - 1] = Number(row.load_kg);
  }
  const cardioBest: Record<string, Partial<Record<CardioRecordKind, number>>> = {};
  for (const row of rows.cardioRecords) {
    cardioBest[row.exercise_id] = { ...cardioBest[row.exercise_id], [row.kind]: Number(row.value) };
  }
  return {
    repMaxKg,
    maxReps: Object.fromEntries(rows.bodyweightRecords.map((row) => [row.exercise_id, row.max_reps])),
    cardioBest,
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

function isNumber(value: unknown): value is number {
  return typeof value === 'number';
}

function isBestByKind(value: unknown): value is Partial<Record<CardioRecordKind, number>> {
  return (
    isRecordOf(value, isNumber) &&
    Object.keys(value).every((kind) => CARDIO_RECORD_KINDS.some((known) => known === kind))
  );
}

function isRecordBaseline(value: unknown): value is RecordBaseline {
  return (
    isRecord(value) &&
    isRecordOf(value.repMaxKg, isSlots) &&
    isRecordOf(value.maxReps, isNumber) &&
    (value.cardioBest === undefined || isRecordOf(value.cardioBest, isBestByKind))
  );
}

export function parseSessionBaseline(raw: string | null): SessionBaseline | null {
  const parsed = parsedJson(raw);
  if (!isRecord(parsed) || typeof parsed.asOf !== 'string') return null;
  if (!isRecordOf(parsed.strength, isStrength) || !(parsed.records === null || isRecordBaseline(parsed.records)))
    return null;
  return { asOf: parsed.asOf, strength: parsed.strength, records: parsed.records };
}
