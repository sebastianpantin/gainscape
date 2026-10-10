import {
  applyHoldToRecords,
  applySetToRecords,
  type BalanceConfig,
  type CardioRecordGain,
  type CardioRecords,
  DEFAULT_BALANCE,
  type LiftSetInput,
  NO_RECORDS,
  type RecordState,
  type SetPersonalRecord,
  type StrengthState,
} from '@domain/index.ts';
import type { RecordBaseline } from '../../lib/session-baseline-rules.ts';
import { formatCardioRecord } from '../../lib/cardio-rules.ts';
import { capitalized } from '../../lib/names.ts';
import { HOLD_DISTANCE_UNIT } from '../../lib/units.ts';
import type { DraftExercise, DraftSet, HoldDraftExercise, HoldDraftSet } from '../../offline/draft-format.ts';

export type HoldRecordPreview = { kind: 'hold'; gain: CardioRecordGain };
export type PreviewRecord = SetPersonalRecord | HoldRecordPreview;

const PREVIEW_ACHIEVED_AT = '1970-01-01T00:00:00.000Z';
const BASELINE_SET_ID = 'baseline';

function recordStateFrom(baseline: RecordBaseline): RecordState {
  const repMaxes = Object.fromEntries(
    Object.entries(baseline.repMaxKg).map(([exerciseId, loads]) => [
      exerciseId,
      loads.map((loadKg) =>
        loadKg === null ? null : { loadKg, setId: BASELINE_SET_ID, achievedAt: PREVIEW_ACHIEVED_AT, exactSetId: null },
      ),
    ]),
  );
  const bodyweightReps = Object.fromEntries(
    Object.entries(baseline.maxReps).map(([exerciseId, maxReps]) => [
      exerciseId,
      { maxReps, setId: BASELINE_SET_ID, achievedAt: PREVIEW_ACHIEVED_AT },
    ]),
  );
  const cardio = Object.fromEntries(
    Object.entries(baseline.cardioBest ?? {}).map(([exerciseId, best]): [string, CardioRecords] => [
      exerciseId,
      Object.fromEntries(
        Object.entries(best).map(([kind, value]) => [
          kind,
          { value, setId: BASELINE_SET_ID, achievedAt: PREVIEW_ACHIEVED_AT },
        ]),
      ),
    ]),
  );
  return { ...NO_RECORDS, repMaxes, bodyweightReps, cardio };
}

function countsForRecords(set: DraftSet): boolean {
  return (
    set.done &&
    !set.isWarmup &&
    Number.isInteger(set.reps) &&
    set.reps >= 1 &&
    Number.isFinite(set.weightKg) &&
    set.weightKg >= 0
  );
}

function measuredHold(set: HoldDraftSet, exercise: HoldDraftExercise): Pick<HoldDraftSet, 'durationS' | 'distanceM'> {
  return exercise.measure === 'time'
    ? { durationS: set.durationS, distanceM: null }
    : { durationS: null, distanceM: set.distanceM };
}

function holdCountsForRecords(set: HoldDraftSet, measured: Pick<HoldDraftSet, 'durationS' | 'distanceM'>): boolean {
  const value = measured.durationS ?? measured.distanceM;
  return set.done && value !== null && Number.isFinite(value) && value > 0 && Number.isFinite(set.weightKg);
}

export function previewRecords(
  exercises: readonly DraftExercise[],
  strength: StrengthState | null,
  baseline: RecordBaseline | null,
  cfg: BalanceConfig = DEFAULT_BALANCE,
): (PreviewRecord | null)[][] {
  let records = baseline === null ? NO_RECORDS : recordStateFrom(baseline);
  let position = 0;
  return exercises.map((exercise): (PreviewRecord | null)[] => {
    const firstPosition = position;
    position += exercise.sets.length;
    if (exercise.modality === 'hold') {
      const hasPriorRecord = baseline?.cardioBest?.[exercise.exerciseId] !== undefined;
      return exercise.sets.map((set) => {
        const measured = measuredHold(set, exercise);
        if (!hasPriorRecord || !holdCountsForRecords(set, measured)) return null;
        const hold = { id: set.id, exerciseId: exercise.exerciseId, ...measured };
        const update = applyHoldToRecords(records, hold, set.weightKg, exercise, PREVIEW_ACHIEVED_AT, cfg);
        records = update.records;
        const [gain] = update.gains;
        return gain === undefined ? null : { kind: 'hold', gain };
      });
    }
    if (exercise.modality !== 'lift') return exercise.sets.map(() => null);
    const hasPriorSession = strength?.[exercise.exerciseId]?.hasPriorSession ?? false;
    return exercise.sets.map((set, index) => {
      if (baseline === null || !hasPriorSession || !countsForRecords(set)) return null;
      const input: LiftSetInput = {
        id: set.id,
        exerciseId: exercise.exerciseId,
        position: firstPosition + index,
        weightKg: set.weightKg,
        reps: set.reps,
        isWarmup: false,
        effort: null,
      };
      const update = applySetToRecords(records, input, exercise.loadType, PREVIEW_ACHIEVED_AT, cfg);
      records = update.records;
      return update.personalRecord;
    });
  });
}

export function recordForSet(
  records: readonly (readonly (PreviewRecord | null)[])[],
  exercises: readonly DraftExercise[],
  setId: string,
): PreviewRecord | null {
  for (const [exerciseIndex, exercise] of exercises.entries()) {
    const setIndex = exercise.sets.findIndex((set) => set.id === setId);
    if (setIndex >= 0) return records[exerciseIndex]?.[setIndex] ?? null;
  }
  return null;
}

export function becomesRecord(
  recordsBefore: readonly (readonly (PreviewRecord | null)[])[],
  before: readonly DraftExercise[],
  after: readonly DraftExercise[],
  setId: string,
  strength: StrengthState | null,
  baseline: RecordBaseline | null,
): boolean {
  const wasRecord = recordForSet(recordsBefore, before, setId) !== null;
  return !wasRecord && recordForSet(previewRecords(after, strength, baseline), after, setId) !== null;
}

const HOLD_RECORD_NAMES = { duration: 'longest hold', distance: 'farthest carry', pace: 'fastest pace' } as const;

function holdRecordName(record: HoldRecordPreview): string {
  return HOLD_RECORD_NAMES[record.gain.kind];
}

export function recordChipText(record: PreviewRecord): string {
  if (record.kind === 'hold') return `${capitalized(holdRecordName(record))}!`;
  return record.kind === 'rep_max' ? `New ${record.reps}RM!` : 'Most reps!';
}

export function recordChipLabel(record: PreviewRecord): string {
  if (record.kind === 'hold') {
    return `Predicted ${holdRecordName(record)}: ${formatCardioRecord(record.gain.kind, record.gain.value, HOLD_DISTANCE_UNIT)}`;
  }
  return record.kind === 'rep_max' ? `Predicted new ${record.reps} rep max` : `Predicted most reps: ${record.reps}`;
}
