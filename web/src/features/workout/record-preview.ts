import {
  type CardioRecordGain,
  type CardioRecords,
  NO_RECORDS,
  type RecordState,
  type SetPersonalRecord,
  type SetResult,
} from '@domain/index.ts';
import type { RecordBaseline } from '../../lib/workout/session-baseline-rules.ts';
import { formatCardioRecord } from '../../lib/workout/cardio-rules.ts';
import { capitalized } from '../../lib/names.ts';
import { HOLD_DISTANCE_UNIT } from '../../lib/units.ts';
import type { DraftExercise } from '../../offline/draft-format.ts';

export type HoldRecordPreview = { kind: 'hold'; gain: CardioRecordGain };
export type PreviewRecord = SetPersonalRecord | HoldRecordPreview;

const PREVIEW_ACHIEVED_AT = '1970-01-01T00:00:00.000Z';
const BASELINE_SET_ID = 'baseline';

export function recordStateFrom(baseline: RecordBaseline): RecordState {
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

export function recordOfResult(result: SetResult | undefined): PreviewRecord | null {
  if (result === undefined || result.cardio !== null) return null;
  const [gain] = result.holdRecords ?? [];
  return gain === undefined ? result.personalRecord : { kind: 'hold', gain };
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
  recordsAfter: readonly (readonly (PreviewRecord | null)[])[],
  after: readonly DraftExercise[],
  setId: string,
): boolean {
  const wasRecord = recordForSet(recordsBefore, before, setId) !== null;
  return !wasRecord && recordForSet(recordsAfter, after, setId) !== null;
}

function holdRecordName(record: HoldRecordPreview): string {
  return record.gain.kind === 'distance' ? 'farthest carry' : 'longest hold';
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
