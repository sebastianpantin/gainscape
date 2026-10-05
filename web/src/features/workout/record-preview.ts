import {
  applySetToRecords,
  type BalanceConfig,
  DEFAULT_BALANCE,
  type LiftSetInput,
  NO_RECORDS,
  type RecordState,
  type SetPersonalRecord,
  type StrengthState,
} from '@domain/index.ts';
import type { RecordBaseline } from '../../lib/session-baseline-rules.ts';
import type { DraftExercise, DraftSet } from '../../offline/draft-format.ts';

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
  return { ...NO_RECORDS, repMaxes, bodyweightReps };
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

export function previewRecords(
  exercises: readonly DraftExercise[],
  strength: StrengthState | null,
  baseline: RecordBaseline | null,
  cfg: BalanceConfig = DEFAULT_BALANCE,
): (SetPersonalRecord | null)[][] {
  let records = baseline === null ? NO_RECORDS : recordStateFrom(baseline);
  let position = 0;
  return exercises.map((exercise) => {
    const firstPosition = position;
    position += exercise.sets.length;
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
  records: readonly (readonly (SetPersonalRecord | null)[])[],
  exercises: readonly DraftExercise[],
  setId: string,
): SetPersonalRecord | null {
  for (const [exerciseIndex, exercise] of exercises.entries()) {
    const setIndex = exercise.sets.findIndex((set) => set.id === setId);
    if (setIndex >= 0) return records[exerciseIndex]?.[setIndex] ?? null;
  }
  return null;
}

export function becomesRecord(
  recordsBefore: readonly (readonly (SetPersonalRecord | null)[])[],
  before: readonly DraftExercise[],
  after: readonly DraftExercise[],
  setId: string,
  strength: StrengthState | null,
  baseline: RecordBaseline | null,
): boolean {
  const wasRecord = recordForSet(recordsBefore, before, setId) !== null;
  return !wasRecord && recordForSet(previewRecords(after, strength, baseline), after, setId) !== null;
}

export function recordChipText(record: SetPersonalRecord): string {
  return record.kind === 'rep_max' ? `New ${record.reps}RM!` : 'Most reps!';
}

export function recordChipLabel(record: SetPersonalRecord): string {
  return record.kind === 'rep_max' ? `Predicted new ${record.reps} rep max` : `Predicted most reps: ${record.reps}`;
}
