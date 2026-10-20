import type { BalanceConfig } from './balance.ts';
import { boutPace, countedWorkSeconds, paceSPerKm } from './cardio.ts';
import { cardioExercise, exerciseFor, liftExercise, liftExerciseFor } from './exercise-lookup.ts';
import type { SessionContext, Step } from './pipeline.ts';
import { FLOAT_TOLERANCE, roundTo } from './math.ts';
import { compareSessionKeys } from './ordering.ts';
import {
  CARDIO_RECORD_KINDS,
  type CardioExerciseDef,
  type CardioInterval,
  type CardioRecordGain,
  type CardioRecordKind,
  type CardioRecords,
  type CardioSetInput,
  type Catalog,
  type HoldSetInput,
  isHoldResult,
  isLiftResult,
  type LiftExerciseDef,
  type LiftSetInput,
  type LoadType,
  measuresRepsCapacity,
  NO_RECORDS,
  type PaceUnit,
  type PersonalRecordSummary,
  REP_MAX_SLOT_COUNT,
  type RecordState,
  type RepMaxSlot,
  type SessionKey,
  type SetPersonalRecord,
  type SetResult,
} from './types.ts';

export function emptyRepMaxSlots(): (RepMaxSlot | null)[] {
  return Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
}

function improvesSlot(slot: RepMaxSlot | null, loadKg: number, cfg: BalanceConfig): boolean {
  return slot === null || loadKg >= slot.loadKg + cfg.prMinGainKg - FLOAT_TOLERANCE;
}

interface RepMaxOutcome {
  slots: (RepMaxSlot | null)[];
  improvedReps: number[];
}

function applyRepMaxSet(
  slots: readonly (RepMaxSlot | null)[],
  set: LiftSetInput,
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
  for (let reps = Math.min(set.reps, REP_MAX_SLOT_COUNT) - 1; reps >= 1; reps--) {
    const slot = next[reps - 1];
    const higherRepSlot = next[reps];
    if (slot && higherRepSlot && slot.loadKg < higherRepSlot.loadKg) {
      next[reps - 1] = { ...higherRepSlot, exactSetId: slot.exactSetId };
    }
  }
  return { slots: next, improvedReps };
}

const PACE_DECIMALS = 1;

function isImplausibleDistance(bout: CardioSetInput, exercise: CardioExerciseDef, cfg: BalanceConfig): boolean {
  if (bout.distanceM === null) return false;
  if (exercise.cardio.referencePaceSPerKm !== null) return boutPace(bout, exercise, cfg).paceFlagged;
  return paceSPerKm(bout.durationS, bout.distanceM) < cfg.cardioFastestPlausiblePaceSPerKm;
}

function boutRecordValues(
  bout: CardioSetInput,
  exercise: CardioExerciseDef,
  cfg: BalanceConfig,
): Partial<Record<CardioRecordKind, number>> {
  const values: Partial<Record<CardioRecordKind, number>> = { duration: countedWorkSeconds(bout) };
  if (bout.interval !== null || bout.distanceM === null || isImplausibleDistance(bout, exercise, cfg)) return values;
  values.distance = bout.distanceM;
  const minDistanceM = exercise.cardio.recordMinDistanceM;
  if (exercise.builtIn && minDistanceM !== null && bout.distanceM >= minDistanceM) {
    values.pace = roundTo(PACE_DECIMALS, paceSPerKm(bout.durationS, bout.distanceM));
  }
  return values;
}

const PACE_UNITS_PER_KM: Record<PaceUnit, number> = { per_km: 1, per_100m: 10 };

function beatsCardioRecord(
  kind: CardioRecordKind,
  value: number,
  previous: number,
  exercise: CardioExerciseDef,
  cfg: BalanceConfig,
): boolean {
  if (kind === 'pace') {
    const minGainSPerKm = cfg.cardioPaceRecordMinGainSPerPaceUnit * PACE_UNITS_PER_KM[exercise.cardio.paceUnit];
    return value <= previous - minGainSPerKm + FLOAT_TOLERANCE;
  }
  const minGain = kind === 'distance' ? cfg.cardioRecordMinGainM : cfg.cardioRecordMinGainS;
  return value >= previous + minGain - FLOAT_TOLERANCE;
}

interface CardioRecordUpdate {
  records: RecordState;
  gains: CardioRecordGain[];
}

function applyBoutToRecords(
  records: RecordState,
  bout: CardioSetInput,
  exercise: CardioExerciseDef,
  achievedAt: string,
  cfg: BalanceConfig,
): CardioRecordUpdate {
  const before: CardioRecords = records.cardio[bout.exerciseId] ?? {};
  const values = boutRecordValues(bout, exercise, cfg);
  const next: Partial<Record<CardioRecordKind, CardioRecords[CardioRecordKind]>> = { ...before };
  const gains: CardioRecordGain[] = [];
  for (const kind of CARDIO_RECORD_KINDS) {
    const value = values[kind];
    if (value === undefined) continue;
    const previous = before[kind]?.value ?? null;
    if (previous !== null && !beatsCardioRecord(kind, value, previous, exercise, cfg)) continue;
    next[kind] = { value, setId: bout.id, achievedAt };
    gains.push({ kind, value, previous });
  }
  if (gains.length === 0) return { records, gains };
  return { records: { ...records, cardio: { ...records.cardio, [bout.exerciseId]: next } }, gains };
}

function holdLoadCountsForRecords(
  exercise: Pick<LiftExerciseDef, 'loadType'>,
  effectiveLoadKg: number,
  cfg: BalanceConfig,
): boolean {
  if (exercise.loadType !== 'external') return true;
  return effectiveLoadKg >= cfg.holdRecordMinExternalLoadKg - FLOAT_TOLERANCE;
}

export function applyHoldToRecords(
  records: RecordState,
  hold: Pick<HoldSetInput, 'id' | 'exerciseId' | 'durationS' | 'distanceM'>,
  effectiveLoadKg: number,
  exercise: Pick<LiftExerciseDef, 'loadType'>,
  achievedAt: string,
  cfg: BalanceConfig,
): CardioRecordUpdate {
  if (!holdLoadCountsForRecords(exercise, effectiveLoadKg, cfg)) return { records, gains: [] };
  const kind: CardioRecordKind = hold.durationS !== null ? 'duration' : 'distance';
  const value = hold.durationS ?? hold.distanceM ?? 0;
  const before: CardioRecords = records.cardio[hold.exerciseId] ?? {};
  const previous = before[kind]?.value ?? null;
  const minGain = kind === 'duration' ? cfg.holdRecordMinGainS : cfg.carryRecordMinGainM;
  if (previous !== null && value < previous + minGain - FLOAT_TOLERANCE) return { records, gains: [] };
  const next = { ...before, [kind]: { value, setId: hold.id, achievedAt } };
  return {
    records: { ...records, cardio: { ...records.cardio, [hold.exerciseId]: next } },
    gains: [{ kind, value, previous }],
  };
}

interface RecordUpdate {
  records: RecordState;
  personalRecord: SetPersonalRecord | null;
}

export function applySetToRecords(
  records: RecordState,
  set: LiftSetInput,
  loadType: LoadType,
  achievedAt: string,
  cfg: BalanceConfig,
): RecordUpdate {
  if (measuresRepsCapacity(loadType)) {
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

  const before = records.repMaxes[set.exerciseId] ?? emptyRepMaxSlots();
  const { slots, improvedReps } = applyRepMaxSet(before, set, achievedAt, cfg);
  const slotsUnchanged =
    records.repMaxes[set.exerciseId] === before && slots.every((slot, index) => slot === before[index]);
  if (slotsUnchanged) return { records, personalRecord: null };
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
  const recordsAtStart = ctx.state.records ?? NO_RECORDS;
  let records = recordsAtStart;

  const sets = ctx.sets.map((result): SetResult => {
    if (result.set.kind === 'cardio') {
      const exercise = cardioExercise(exerciseFor(result.set, ctx.deps.catalog));
      const update = applyBoutToRecords(records, result.set, exercise, ctx.session.startedAt, ctx.cfg);
      records = update.records;
      const isBaselineSession = recordsAtStart.cardio[exercise.id] === undefined;
      if (isBaselineSession || update.gains.length === 0) return result;
      return { ...result, cardio: { ...result.cardio!, records: update.gains } };
    }
    if (isHoldResult(result)) {
      const exercise = liftExerciseFor(result.set, ctx.deps.catalog);
      const update = applyHoldToRecords(
        records,
        result.set,
        result.effectiveLoadKg,
        exercise,
        ctx.session.startedAt,
        ctx.cfg,
      );
      records = update.records;
      const isBaselineSession = recordsAtStart.cardio[exercise.id] === undefined;
      if (isBaselineSession || update.gains.length === 0) return result;
      return { ...result, holdRecords: update.gains };
    }
    if (!isLiftResult(result) || result.set.isWarmup) return result;
    const exercise = liftExerciseFor(result.set, ctx.deps.catalog);
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
      records: {
        repMaxes: { ...records.repMaxes },
        bodyweightReps: { ...records.bodyweightReps },
        cardio: { ...records.cardio },
      },
    },
  };
};

export interface LiftRecordHistoryRow {
  kind?: 'lift';
  exerciseId: string;
  session: SessionKey;
  setId: string;
  position: number;
  weightKg: number;
  reps: number;
}

export interface CardioRecordHistoryRow {
  kind: 'cardio';
  exerciseId: string;
  session: SessionKey;
  setId: string;
  position: number;
  durationS: number;
  distanceM: number | null;
  interval: CardioInterval | null;
}

export interface HoldRecordHistoryRow {
  kind: 'hold';
  exerciseId: string;
  session: SessionKey;
  setId: string;
  position: number;
  effectiveLoadKg: number;
  durationS: number | null;
  distanceM: number | null;
}

export type RecordHistoryRow = LiftRecordHistoryRow | CardioRecordHistoryRow | HoldRecordHistoryRow;

export function recordsFromHistory(
  rows: readonly RecordHistoryRow[],
  catalog: Catalog,
  cfg: BalanceConfig,
): RecordState {
  const ordered = [...rows].sort((a, b) => compareSessionKeys(a.session, b.session) || a.position - b.position);
  let records: RecordState = NO_RECORDS;
  for (const row of ordered) {
    const exercise = exerciseFor(row, catalog);
    if (row.kind === 'cardio') {
      const bout: CardioSetInput = {
        kind: 'cardio',
        id: row.setId,
        exerciseId: row.exerciseId,
        position: row.position,
        durationS: row.durationS,
        distanceM: row.distanceM,
        interval: row.interval,
        effort: null,
      };
      records = applyBoutToRecords(records, bout, cardioExercise(exercise), row.session.startedAt, cfg).records;
      continue;
    }
    if (row.kind === 'hold') {
      const hold = { id: row.setId, exerciseId: row.exerciseId, durationS: row.durationS, distanceM: row.distanceM };
      const lift = liftExercise(exercise);
      records = applyHoldToRecords(records, hold, row.effectiveLoadKg, lift, row.session.startedAt, cfg).records;
      continue;
    }
    const set: LiftSetInput = {
      id: row.setId,
      exerciseId: row.exerciseId,
      position: row.position,
      weightKg: row.weightKg,
      reps: row.reps,
      isWarmup: false,
      effort: null,
    };
    records = applySetToRecords(records, set, liftExercise(exercise).loadType, row.session.startedAt, cfg).records;
  }
  return records;
}

function liftRecordSummaries(
  sets: readonly SetResult[],
  recordsBefore: RecordState,
  recordsAfter: RecordState,
): PersonalRecordSummary[] {
  const summaries: PersonalRecordSummary[] = [];
  const exercisesWithRecords = [
    ...new Set(sets.filter((result) => result.personalRecord).map((result) => result.set.exerciseId)),
  ];

  for (const exerciseId of exercisesWithRecords) {
    const recordSets = sets.filter((result) => result.set.exerciseId === exerciseId && result.personalRecord !== null);
    const records = recordSets.map((result) => result.personalRecord as SetPersonalRecord);
    const lastRecordSetId = recordSets[recordSets.length - 1].set.id;
    if (records[0].kind === 'bodyweight_reps') {
      const after = recordsAfter.bodyweightReps[exerciseId];
      summaries.push({
        exerciseId,
        kind: 'bodyweight_reps',
        setId: after.setId,
        reps: after.maxReps,
        loadKg: null,
        previousLoadKg: null,
        previousReps: recordsBefore.bodyweightReps[exerciseId]?.maxReps ?? null,
      });
      continue;
    }
    const highestReps = Math.max(...records.map((record) => record.reps));
    const slot = recordsAfter.repMaxes[exerciseId][highestReps - 1];
    summaries.push({
      exerciseId,
      kind: 'rep_max',
      setId: slot?.setId ?? lastRecordSetId,
      reps: highestReps,
      loadKg: slot?.loadKg ?? null,
      previousLoadKg: recordsBefore.repMaxes[exerciseId]?.[highestReps - 1]?.loadKg ?? null,
      previousReps: null,
    });
  }
  return summaries;
}

function cardioRecordSummaries(sets: readonly SetResult[]): PersonalRecordSummary[] {
  return [...sets]
    .sort((a, b) => a.set.position - b.set.position)
    .flatMap((result): PersonalRecordSummary[] => {
      const gains = result.cardio?.records ?? result.holdRecords ?? [];
      return gains.length === 0
        ? []
        : [{ kind: 'cardio', exerciseId: result.set.exerciseId, setId: result.set.id, records: gains }];
    });
}

export function summarizePersonalRecords(
  sets: readonly SetResult[],
  recordsBefore: RecordState,
  recordsAfter: RecordState,
): PersonalRecordSummary[] {
  return [...liftRecordSummaries(sets, recordsBefore, recordsAfter), ...cardioRecordSummaries(sets)];
}
