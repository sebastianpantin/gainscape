import { countedWorkSeconds } from './cardio.ts';
import { roundTo } from './math.ts';
import { type CardioInterval, type EffortInputType, type SetInput } from './types.ts';

const STORED_WEIGHT_DECIMALS = 2;

interface StoredSetBase {
  id: string;
  exerciseId: string;
  position: number;
  effortInputType: EffortInputType | null;
  effortValue: number | null;
}

export interface StoredLiftSet extends StoredSetBase {
  kind: 'lift';
  weightKg: number;
  effectiveLoadKg: number;
  reps: number;
  isWarmup: boolean;
}

export interface StoredCardioSet extends StoredSetBase {
  kind: 'cardio';
  durationS: number;
  distanceM: number | null;
  interval: CardioInterval | null;
}

export interface StoredHoldSet extends StoredSetBase {
  kind: 'hold';
  weightKg: number;
  effectiveLoadKg: number;
  durationS: number | null;
  distanceM: number | null;
}

export type StoredSet = StoredLiftSet | StoredCardioSet | StoredHoldSet;

export interface StoredSetColumns {
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number | null;
  effectiveLoadKg: number | null;
  reps: number | null;
  isWarmup: boolean;
  effortInputType: EffortInputType | null;
  effortValue: number | null;
  durationS: number | null;
  distanceM: number | null;
  intervalWorkS: number | null;
  intervalRestS: number | null;
  intervalRounds: number | null;
  countedWorkS: number | null;
}

const COLUMN_OF = {
  id: 'id',
  exerciseId: 'exercise_id',
  position: 'position',
  weightKg: 'weight_kg',
  effectiveLoadKg: 'effective_load_kg',
  reps: 'reps',
  isWarmup: 'is_warmup',
  effortInputType: 'effort_input_type',
  effortValue: 'effort_value',
  durationS: 'duration_s',
  distanceM: 'distance_m',
  intervalWorkS: 'interval_work_s',
  intervalRestS: 'interval_rest_s',
  intervalRounds: 'interval_rounds',
  countedWorkS: 'counted_work_s',
} as const satisfies Record<keyof StoredSetColumns, string>;

type StoredSetField = keyof typeof COLUMN_OF;

const NUMERIC_FIELDS = ['weightKg', 'effectiveLoadKg', 'effortValue', 'distanceM'] as const;

type NumericField = (typeof NUMERIC_FIELDS)[number];

export type StoredSetColumnRow = {
  [Field in StoredSetField as (typeof COLUMN_OF)[Field]]: Field extends NumericField
    ? number | string | null
    : StoredSetColumns[Field];
};

const FIELD_COLUMNS = Object.entries(COLUMN_OF) as [StoredSetField, string][];

const NUMERIC_COLUMNS: ReadonlySet<string> = new Set(NUMERIC_FIELDS.map((field) => COLUMN_OF[field]));

export const STORED_SET_COLUMNS: readonly string[] = Object.freeze(FIELD_COLUMNS.map(([, column]) => column));

export class UnknownSetKindError extends Error {
  constructor(setId: string) {
    super(`Stored set ${setId} matches no set kind`);
    this.name = 'UnknownSetKindError';
  }
}

export function storedSetColumnsOf(row: StoredSetColumnRow): StoredSetColumns {
  const record = row as Record<string, unknown>;
  return Object.fromEntries(
    FIELD_COLUMNS.map(([field, column]) => {
      const value = record[column];
      return [field, NUMERIC_COLUMNS.has(column) && value !== null ? Number(value) : value];
    }),
  ) as unknown as StoredSetColumns;
}

export function storedSetColumnRow(columns: StoredSetColumns): StoredSetColumnRow {
  return Object.fromEntries(FIELD_COLUMNS.map(([field, column]) => [column, columns[field]])) as StoredSetColumnRow;
}

function storedInterval({ intervalWorkS, intervalRestS, intervalRounds }: StoredSetColumns): CardioInterval | null {
  return intervalWorkS === null || intervalRestS === null || intervalRounds === null
    ? null
    : { workS: intervalWorkS, restS: intervalRestS, rounds: intervalRounds };
}

export function decodeStoredSet(columns: StoredSetColumns): StoredSet {
  const { id, exerciseId, position, effortInputType, effortValue } = columns;
  const base = { id, exerciseId, position, effortInputType, effortValue };
  const { reps, weightKg, effectiveLoadKg, durationS, distanceM } = columns;
  if (reps !== null && weightKg !== null && effectiveLoadKg !== null) {
    return { ...base, kind: 'lift', weightKg, effectiveLoadKg, reps, isWarmup: columns.isWarmup };
  }
  if (reps === null && weightKg === null && durationS !== null) {
    return { ...base, kind: 'cardio', durationS, distanceM, interval: storedInterval(columns) };
  }
  const measuredOnce = (durationS === null) !== (distanceM === null);
  if (reps === null && weightKg !== null && effectiveLoadKg !== null && columns.countedWorkS === null && measuredOnce) {
    return { ...base, kind: 'hold', weightKg, effectiveLoadKg, durationS, distanceM };
  }
  throw new UnknownSetKindError(id);
}

type StoredEffort = Pick<StoredSetColumns, 'effortInputType' | 'effortValue'>;

const NO_INTERVAL = { intervalWorkS: null, intervalRestS: null, intervalRounds: null, countedWorkS: null };

export function encodeStoredSet(set: SetInput, effectiveLoadKg: number | null, effort: StoredEffort): StoredSetColumns {
  const base = {
    id: set.id,
    exerciseId: set.exerciseId,
    position: set.position,
    effortInputType: effort.effortInputType,
    effortValue: effort.effortValue,
  };
  if (set.kind === 'cardio') {
    return {
      ...base,
      weightKg: null,
      effectiveLoadKg: null,
      reps: null,
      isWarmup: false,
      durationS: set.durationS,
      distanceM: set.distanceM,
      intervalWorkS: set.interval?.workS ?? null,
      intervalRestS: set.interval?.restS ?? null,
      intervalRounds: set.interval?.rounds ?? null,
      countedWorkS: countedWorkSeconds(set),
    };
  }
  if (set.kind === 'hold') {
    return {
      ...base,
      ...NO_INTERVAL,
      weightKg: set.weightKg,
      effectiveLoadKg,
      reps: null,
      isWarmup: false,
      durationS: set.durationS,
      distanceM: set.distanceM,
    };
  }
  return {
    ...base,
    ...NO_INTERVAL,
    weightKg: set.weightKg,
    effectiveLoadKg,
    reps: set.reps,
    isWarmup: set.isWarmup,
    durationS: null,
    distanceM: null,
  };
}

export function storedWeightKg(weightKg: number): number {
  return roundTo(STORED_WEIGHT_DECIMALS, weightKg);
}
