import { describe, expect, it } from 'vitest';
import {
  applySetToRecords,
  collectionCompletion,
  NO_RECORDS,
  replayHistory,
  type SessionInput,
  type SetInput,
} from '@domain/index.ts';
import { aSet, catalog, DAY_MS, hard, TEST_BALANCE } from './fixtures.ts';

const firstDay = Date.parse('2026-09-01T18:00:00.000Z');

function sessionsOf(...setsPerSession: SetInput[][]): SessionInput[] {
  return setsPerSession.map((sets, index) => ({
    id: `session-${index}`,
    startedAt: new Date(firstDay + index * DAY_MS).toISOString(),
    sets,
  }));
}

function replay(...setsPerSession: SetInput[][]) {
  return replayHistory(sessionsOf(...setsPerSession), catalog, TEST_BALANCE, { skillXp: {}, bodyweightKg: 80 });
}

describe('rep-max records', () => {
  it('fills slots silently in the baseline session', () => {
    const { sessions, finalState } = replay([aSet('bench', 90, 5, hard), aSet('bench', 95, 3, hard)]);
    expect(sessions[0].outputs.prs).toEqual([]);
    expect(finalState.records!.repMaxes.bench.map((slot) => slot?.loadKg ?? null)).toEqual([
      95,
      95,
      95,
      90,
      90,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('improves slots 1–3 with a heavier triple and reports one 3RM record', () => {
    const { sessions, finalState } = replay(
      [aSet('bench', 90, 5, hard)],
      [aSet('bench', 100, 5, hard)],
      [aSet('bench', 105, 3, hard)],
    );
    expect(sessions[1].outputs.prs).toEqual([
      { exerciseId: 'bench', kind: 'rep_max', reps: 5, loadKg: 100, previousLoadKg: 90, previousReps: null },
    ]);
    expect(sessions[2].outputs.prs).toEqual([
      { exerciseId: 'bench', kind: 'rep_max', reps: 3, loadKg: 105, previousLoadKg: 100, previousReps: null },
    ]);
    expect(finalState.records!.repMaxes.bench.slice(0, 5).map((slot) => slot?.loadKg)).toEqual([
      105, 105, 105, 100, 100,
    ]);
  });

  it('gives each set at most one record, for its highest improved slot', () => {
    const { sessions } = replay([aSet('bench', 90, 5, hard)], [aSet('bench', 100, 5, hard)]);
    expect(sessions[1].outputs.sets[0].personalRecord).toEqual({
      kind: 'rep_max',
      reps: 5,
      loadKg: 100,
      previousLoadKg: 90,
    });
  });

  it('fills an empty slot after the baseline as a record, even at +0 kg', () => {
    const { sessions } = replay([aSet('weighted-pull-up', 10, 5, hard)], [aSet('weighted-pull-up', 0, 8, hard)]);
    expect(sessions[1].outputs.prs).toEqual([
      { exerciseId: 'weighted-pull-up', kind: 'rep_max', reps: 8, loadKg: 0, previousLoadKg: null, previousReps: null },
    ]);
  });

  it('ignores improvements below the 1 kg minimum gain', () => {
    const { sessions } = replay(
      [aSet('bench', 100, 5, hard)],
      [aSet('bench', 100.5, 5, hard)],
      [aSet('bench', 101, 5, hard)],
    );
    expect(sessions[1].outputs.prs).toEqual([]);
    expect(sessions[2].outputs.prs).toHaveLength(1);
  });

  it('ignores warm-ups', () => {
    const { sessions } = replay([aSet('bench', 90, 5, hard)], [aSet('bench', 120, 5, hard, { isWarmup: true })]);
    expect(sessions[1].outputs.prs).toEqual([]);
  });

  it('treats a warm-up-only first session as not yet the baseline', () => {
    const { sessions } = replay([aSet('bench', 40, 10, null, { isWarmup: true })], [aSet('bench', 90, 5, hard)]);
    expect(sessions[1].outputs.prs).toEqual([]);
  });
});

describe('minimum record gain', () => {
  const achievedAt = '2026-09-01T18:00:00.000Z';
  const at100 = applySetToRecords(
    NO_RECORDS,
    aSet('bench', 100, 1, hard),
    'external',
    achievedAt,
    TEST_BALANCE,
  ).records;

  it('ignores a gain below 1 kg', () => {
    const update = applySetToRecords(at100, aSet('bench', 100.06, 1, hard), 'external', achievedAt, TEST_BALANCE);
    expect(update.personalRecord).toBeNull();
    expect(update.records.repMaxes.bench[0]?.loadKg).toBe(100);
  });

  it('counts a gain of exactly 1 kg', () => {
    const update = applySetToRecords(at100, aSet('bench', 101, 1, hard), 'external', achievedAt, TEST_BALANCE);
    expect(update.personalRecord).toMatchObject({ kind: 'rep_max', reps: 1, loadKg: 101, previousLoadKg: 100 });
  });

  it('adds up small gains against the stored record', () => {
    const afterHalf = applySetToRecords(at100, aSet('bench', 100.5, 1, hard), 'external', achievedAt, TEST_BALANCE);
    expect(afterHalf.personalRecord).toBeNull();
    const afterOne = applySetToRecords(
      afterHalf.records,
      aSet('bench', 101, 1, hard),
      'external',
      achievedAt,
      TEST_BALANCE,
    );
    expect(afterOne.personalRecord).toMatchObject({ loadKg: 101, previousLoadKg: 100 });
  });
});

describe('bodyweight rep records', () => {
  it('reports more reps than before as a record', () => {
    const { sessions } = replay([aSet('pull-up', 0, 8, hard)], [aSet('pull-up', 0, 10, hard)]);
    expect(sessions[1].outputs.prs).toEqual([
      { exerciseId: 'pull-up', kind: 'bodyweight_reps', reps: 10, loadKg: null, previousLoadKg: null, previousReps: 8 },
    ]);
  });

  it('does not report equal reps', () => {
    const { sessions } = replay([aSet('pull-up', 0, 8, hard)], [aSet('pull-up', 0, 8, hard)]);
    expect(sessions[1].outputs.prs).toEqual([]);
  });
});

describe('collection completion', () => {
  it('counts a single 10-rep set as one filled slot out of ten', () => {
    const { finalState } = replay([aSet('bench', 60, 10, hard)]);
    const exactSlots = finalState.records!.repMaxes.bench.filter((slot) => slot?.exactSetId).length;
    expect(
      collectionCompletion([{ loadType: 'external', exactRepMaxSlotsFilled: exactSlots, hasBodyweightRecord: false }]),
    ).toEqual({
      filledSlots: 1,
      totalSlots: 10,
      fraction: 0.1,
    });
  });

  it('counts a bodyweight exercise as one slot', () => {
    expect(
      collectionCompletion([
        { loadType: 'bodyweight', exactRepMaxSlotsFilled: 0, hasBodyweightRecord: true },
        { loadType: 'external', exactRepMaxSlotsFilled: 3, hasBodyweightRecord: false },
      ]),
    ).toEqual({ filledSlots: 4, totalSlots: 11, fraction: 4 / 11 });
  });

  it('is zero with nothing done or pinned', () => {
    expect(collectionCompletion([])).toEqual({ filledSlots: 0, totalSlots: 0, fraction: 0 });
  });
});
