import type { BalanceConfig } from './balance.ts';
import { UnknownExerciseError } from './errors.ts';
import type { SessionContext, Step } from './pipeline.ts';
import {
  type Catalog,
  type LoadType,
  NO_RECORDS,
  type PersonalRecordSummary,
  REP_MAX_SLOT_COUNT,
  type RecordState,
  type RepMaxSlot,
  type SessionKey,
  type SetInput,
  type SetPersonalRecord,
  type SetResult,
} from './types.ts';

function emptySlots(): (RepMaxSlot | null)[] {
  return Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
}

const GAIN_FLOAT_TOLERANCE_KG = 1e-9;

function improvesSlot(slot: RepMaxSlot | null, loadKg: number, cfg: BalanceConfig): boolean {
  return slot === null || loadKg >= slot.loadKg + cfg.prMinGainKg - GAIN_FLOAT_TOLERANCE_KG;
}

interface RepMaxOutcome {
  slots: (RepMaxSlot | null)[];
  improvedReps: number[];
}

function applyRepMaxSet(
  slots: readonly (RepMaxSlot | null)[],
  set: SetInput,
  achievedAt: string,
  cfg: BalanceConfig,
): RepMaxOutcome {
  const loadKg = set.weightKg;
  const next = [...slots];
  const improvedReps: number[] = [];
  for (let reps = 1; reps <= Math.min(set.reps, REP_MAX_SLOT_COUNT); reps++) {
    const slot = next[reps - 1];
    const exactSetId = set.reps === reps ? set.id : (slot?.exactSetId ?? null);
    if (improvesSlot(slot, loadKg, cfg)) {
      next[reps - 1] = { loadKg, setId: set.id, achievedAt, exactSetId };
      improvedReps.push(reps);
    } else if (slot && slot.exactSetId === null && set.reps === reps) {
      next[reps - 1] = { ...slot, exactSetId: set.id };
    }
  }
  return { slots: next, improvedReps };
}

export interface RecordUpdate {
  records: RecordState;
  personalRecord: SetPersonalRecord | null;
}

export function applySetToRecords(
  records: RecordState,
  set: SetInput,
  loadType: LoadType,
  achievedAt: string,
  cfg: BalanceConfig,
): RecordUpdate {
  if (loadType === 'bodyweight') {
    const previous = records.bodyweightReps[set.exerciseId] ?? null;
    if (previous !== null && set.reps <= previous.maxReps) return { records, personalRecord: null };
    return {
      records: {
        ...records,
        bodyweightReps: {
          ...records.bodyweightReps,
          [set.exerciseId]: { maxReps: set.reps, setId: set.id, achievedAt },
        },
      },
      personalRecord: { kind: 'bodyweight_reps', reps: set.reps, previousReps: previous?.maxReps ?? null },
    };
  }

  const before = records.repMaxes[set.exerciseId] ?? emptySlots();
  const { slots, improvedReps } = applyRepMaxSet(before, set, achievedAt, cfg);
  const highestImproved = improvedReps.at(-1);
  return {
    records: { ...records, repMaxes: { ...records.repMaxes, [set.exerciseId]: slots } },
    personalRecord:
      highestImproved === undefined
        ? null
        : {
            kind: 'rep_max',
            reps: highestImproved,
            loadKg: set.weightKg,
            previousLoadKg: before[highestImproved - 1]?.loadKg ?? null,
          },
  };
}

export const detectPersonalRecords: Step = (ctx: SessionContext) => {
  let records = ctx.state.records ?? NO_RECORDS;

  const sets = ctx.sets.map((result): SetResult => {
    if (result.set.isWarmup) return result;
    const exercise = ctx.deps.catalog.exercises.get(result.set.exerciseId)!;
    const isBaselineSession = !(ctx.deps.strength?.[exercise.id]?.hasPriorSession ?? false);
    const update = applySetToRecords(records, result.set, exercise.loadType, ctx.session.startedAt, ctx.cfg);
    records = update.records;
    if (isBaselineSession || update.personalRecord === null) return result;
    return { ...result, personalRecord: update.personalRecord };
  });

  return {
    ...ctx,
    sets,
    state: {
      ...ctx.state,
      records: { repMaxes: { ...records.repMaxes }, bodyweightReps: { ...records.bodyweightReps } },
    },
  };
};

export interface RecordHistoryRow {
  exerciseId: string;
  session: SessionKey;
  setId: string;
  position: number;
  weightKg: number;
  reps: number;
}

export function recordsFromHistory(
  rows: readonly RecordHistoryRow[],
  catalog: Catalog,
  cfg: BalanceConfig,
): RecordState {
  const ordered = rows
    .map((row) => ({ row, startedAtMs: Date.parse(row.session.startedAt) }))
    .sort(
      (a, b) =>
        a.startedAtMs - b.startedAtMs ||
        (a.row.session.id < b.row.session.id ? -1 : a.row.session.id > b.row.session.id ? 1 : 0) ||
        a.row.position - b.row.position,
    );
  let records: RecordState = { repMaxes: {}, bodyweightReps: {} };
  for (const { row } of ordered) {
    const exercise = catalog.exercises.get(row.exerciseId);
    if (!exercise) throw new UnknownExerciseError(row.exerciseId);
    const set: SetInput = {
      id: row.setId,
      exerciseId: row.exerciseId,
      position: row.position,
      weightKg: row.weightKg,
      reps: row.reps,
      isWarmup: false,
      effort: null,
    };
    records = applySetToRecords(records, set, exercise.loadType, row.session.startedAt, cfg).records;
  }
  return records;
}

export function summarizePersonalRecords(
  sets: readonly SetResult[],
  recordsBefore: RecordState,
  recordsAfter: RecordState,
): PersonalRecordSummary[] {
  const summaries: PersonalRecordSummary[] = [];
  const exercisesWithRecords = [
    ...new Set(sets.filter((result) => result.personalRecord).map((result) => result.set.exerciseId)),
  ];

  for (const exerciseId of exercisesWithRecords) {
    const records = sets
      .filter((result) => result.set.exerciseId === exerciseId)
      .map((result) => result.personalRecord)
      .filter((record): record is SetPersonalRecord => record !== null);
    if (records[0].kind === 'bodyweight_reps') {
      summaries.push({
        exerciseId,
        kind: 'bodyweight_reps',
        reps: recordsAfter.bodyweightReps[exerciseId].maxReps,
        loadKg: null,
        previousLoadKg: null,
        previousReps: recordsBefore.bodyweightReps[exerciseId]?.maxReps ?? null,
      });
      continue;
    }
    const highestReps = Math.max(...records.map((record) => record.reps));
    summaries.push({
      exerciseId,
      kind: 'rep_max',
      reps: highestReps,
      loadKg: recordsAfter.repMaxes[exerciseId][highestReps - 1]?.loadKg ?? null,
      previousLoadKg: recordsBefore.repMaxes[exerciseId]?.[highestReps - 1]?.loadKg ?? null,
      previousReps: null,
    });
  }
  return summaries;
}
