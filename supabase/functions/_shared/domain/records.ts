import type { BalanceConfig } from './balance.ts';
import type { SessionContext, Step } from './pipeline.ts';
import {
  type BodyweightRepRecord,
  NO_RECORDS,
  type PersonalRecordSummary,
  REP_MAX_SLOT_COUNT,
  type RecordState,
  type RepMaxSlot,
  type SetPersonalRecord,
  type SetResult,
} from './types.ts';

function emptySlots(): (RepMaxSlot | null)[] {
  return Array.from({ length: REP_MAX_SLOT_COUNT }, () => null);
}

function improvesSlot(slot: RepMaxSlot | null, loadKg: number, cfg: BalanceConfig): boolean {
  return slot === null || loadKg > slot.loadKg + cfg.prEpsilonKg;
}

interface RepMaxOutcome {
  slots: (RepMaxSlot | null)[];
  improvedReps: number[];
}

function applyRepMaxSet(
  slots: readonly (RepMaxSlot | null)[],
  result: SetResult,
  achievedAt: string,
  cfg: BalanceConfig,
): RepMaxOutcome {
  const loadKg = result.set.weightKg;
  const next = [...slots];
  const improvedReps: number[] = [];
  for (let reps = 1; reps <= Math.min(result.set.reps, REP_MAX_SLOT_COUNT); reps++) {
    const slot = next[reps - 1];
    const exactSetId = result.set.reps === reps ? result.set.id : (slot?.exactSetId ?? null);
    if (improvesSlot(slot, loadKg, cfg)) {
      next[reps - 1] = { loadKg, setId: result.set.id, achievedAt, exactSetId };
      improvedReps.push(reps);
    } else if (slot && slot.exactSetId === null && result.set.reps === reps) {
      next[reps - 1] = { ...slot, exactSetId: result.set.id };
    }
  }
  return { slots: next, improvedReps };
}

export const detectPersonalRecords: Step = (ctx: SessionContext) => {
  const repMaxes: Record<string, readonly (RepMaxSlot | null)[]> = { ...(ctx.state.records ?? NO_RECORDS).repMaxes };
  const bodyweightReps: Record<string, BodyweightRepRecord> = { ...(ctx.state.records ?? NO_RECORDS).bodyweightReps };

  const sets = ctx.sets.map((result): SetResult => {
    if (result.set.isWarmup) return result;
    const exercise = ctx.deps.catalog.exercises.get(result.set.exerciseId)!;
    const isBaselineSession = !(ctx.deps.strength?.[exercise.id]?.hasPriorSession ?? false);

    if (exercise.loadType === 'bodyweight') {
      const previous = bodyweightReps[exercise.id] ?? null;
      if (previous !== null && result.set.reps <= previous.maxReps) return result;
      bodyweightReps[exercise.id] = {
        maxReps: result.set.reps,
        setId: result.set.id,
        achievedAt: ctx.session.startedAt,
      };
      const personalRecord: SetPersonalRecord = {
        kind: 'bodyweight_reps',
        reps: result.set.reps,
        previousReps: previous?.maxReps ?? null,
      };
      return isBaselineSession ? result : { ...result, personalRecord };
    }

    const before = repMaxes[exercise.id] ?? emptySlots();
    const { slots, improvedReps } = applyRepMaxSet(before, result, ctx.session.startedAt, ctx.cfg);
    repMaxes[exercise.id] = slots;
    const highestImproved = improvedReps.at(-1);
    if (isBaselineSession || highestImproved === undefined) return result;
    const personalRecord: SetPersonalRecord = {
      kind: 'rep_max',
      reps: highestImproved,
      loadKg: result.set.weightKg,
      previousLoadKg: before[highestImproved - 1]?.loadKg ?? null,
    };
    return { ...result, personalRecord };
  });

  return { ...ctx, sets, state: { ...ctx.state, records: { repMaxes, bodyweightReps } } };
};

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
