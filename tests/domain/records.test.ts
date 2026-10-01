import { describe, expect, it } from 'vitest';
import {
  applySetToRecords,
  collectionCompletion,
  KindMismatchError,
  NO_RECORDS,
  recordsFromHistory,
  replayHistory,
  type CardioSetInput,
  type SessionInput,
  type SetInput,
} from '@domain/index.ts';
import { aBout, aSet, catalog, DAY_MS, hard, TEST_BALANCE } from './fixtures.ts';

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
      {
        exerciseId: 'bench',
        kind: 'rep_max',
        setId: expect.any(String),
        reps: 5,
        loadKg: 100,
        previousLoadKg: 90,
        previousReps: null,
      },
    ]);
    expect(sessions[2].outputs.prs).toEqual([
      {
        exerciseId: 'bench',
        kind: 'rep_max',
        setId: expect.any(String),
        reps: 3,
        loadKg: 105,
        previousLoadKg: 100,
        previousReps: null,
      },
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
      {
        exerciseId: 'weighted-pull-up',
        kind: 'rep_max',
        setId: expect.any(String),
        reps: 8,
        loadKg: 0,
        previousLoadKg: null,
        previousReps: null,
      },
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
      {
        exerciseId: 'pull-up',
        kind: 'bodyweight_reps',
        setId: expect.any(String),
        reps: 10,
        loadKg: null,
        previousLoadKg: null,
        previousReps: 8,
      },
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

  it('counts a cardio exercise as no slot', () => {
    expect(
      collectionCompletion([
        { modality: 'cardio' },
        { loadType: 'external', exactRepMaxSlotsFilled: 3, hasBodyweightRecord: false },
      ]),
    ).toEqual({ filledSlots: 3, totalSlots: 10, fraction: 0.3 });
  });

  it('is zero with nothing done or pinned', () => {
    expect(collectionCompletion([])).toEqual({ filledSlots: 0, totalSlots: 0, fraction: 0 });
  });
});

describe('recordsFromHistory', () => {
  it('rejects a lift history row on a cardio exercise', () => {
    const row = {
      exerciseId: 'run',
      session: { id: 'session-0', startedAt: '2026-09-01T18:00:00.000Z' },
      setId: 'set-run',
      position: 0,
      weightKg: 0,
      reps: 1,
    };
    expect(() => recordsFromHistory([row], catalog, TEST_BALANCE)).toThrow(KindMismatchError);
  });
});

describe('cardio records', () => {
  const run = (durationS: number, distanceM: number | null, overrides: Partial<CardioSetInput> = {}) =>
    aBout('run', durationS, null, { distanceM, ...overrides });

  it('stores distance, pace and duration silently in the first session with the activity', () => {
    const { sessions, finalState } = replay([run(1800, 5000)]);
    expect(sessions[0].outputs.prs).toEqual([]);
    expect(finalState.records!.cardio.run).toEqual({
      distance: expect.objectContaining({ value: 5000 }),
      pace: expect.objectContaining({ value: 360 }),
      duration: expect.objectContaining({ value: 1800 }),
    });
  });

  it('reports each record kind a bout beats, with the previous value, once per bout', () => {
    const longer = run(2160, 6000);
    const { sessions } = replay([run(1800, 5000)], [longer]);
    expect(sessions[1].outputs.prs).toEqual([
      {
        kind: 'cardio',
        exerciseId: 'run',
        setId: longer.id,
        records: [
          { kind: 'distance', value: 6000, previous: 5000 },
          { kind: 'duration', value: 2160, previous: 1800 },
        ],
      },
    ]);
  });

  it('reports a faster pace as a lower seconds-per-kilometre value', () => {
    const faster = run(1500, 5000);
    const { sessions } = replay([run(1800, 5000)], [faster]);
    expect(sessions[1].outputs.prs).toEqual([
      { kind: 'cardio', exerciseId: 'run', setId: faster.id, records: [{ kind: 'pace', value: 300, previous: 360 }] },
    ]);
  });

  it.each([
    ['99 m more distance', 1835, 5099, []],
    ['100 m more distance', 1836, 5100, ['distance']],
    ['59 s more work', 1859, null, []],
    ['60 s more work', 1860, null, ['duration']],
  ])('applies the minimum gain: %s', (_, durationS, distanceM, kinds) => {
    const { sessions } = replay([run(1800, 5000)], [run(durationS, distanceM)]);
    const records = sessions[1].outputs.prs.flatMap((pr) => (pr.kind === 'cardio' ? pr.records : []));
    expect(records.map((record) => record.kind)).toEqual(kinds);
  });

  it('needs a pace at least 1 s/km faster', () => {
    const almost = replay([run(1800, 5000)], [run(1796, 5000)]);
    const enough = replay([run(1800, 5000)], [run(1795, 5000)]);
    expect(almost.sessions[1].outputs.prs).toEqual([]);
    expect(enough.sessions[1].outputs.prs.flatMap((pr) => (pr.kind === 'cardio' ? pr.records : []))).toEqual([
      { kind: 'pace', value: 359, previous: 360 },
    ]);
  });

  it('counts pace only from the activity minimum distance up', () => {
    const { finalState } = replay([run(1800, 5000)], [run(240, 900)]);
    expect(finalState.records!.cardio.run.pace?.value).toBe(360);
  });

  it('sets no distance or pace record for an implausibly fast bout, but still counts its duration', () => {
    const flagged = run(1200, 20_000);
    const { sessions, finalState } = replay([run(600, null)], [flagged]);
    expect(sessions[1].outputs.prs).toEqual([
      {
        kind: 'cardio',
        exerciseId: 'run',
        setId: flagged.id,
        records: [{ kind: 'duration', value: 1200, previous: 600 }],
      },
    ]);
    expect(finalState.records!.cardio.run.distance).toBeUndefined();
  });

  it('gives a custom activity distance and duration records but no pace record', () => {
    const { finalState } = replay([aBout('custom-run', 1800, null, { distanceM: 5000 })]);
    expect(Object.keys(finalState.records!.cardio['custom-run']).sort()).toEqual(['distance', 'duration']);
  });

  it('counts only the work of an interval bout, never its distance or pace', () => {
    const intervals = aBout('row-intervals', 570, null, {
      distanceM: 2000,
      interval: { workS: 30, restS: 30, rounds: 10 },
    });
    const { finalState } = replay([intervals]);
    expect(finalState.records!.cardio['row-intervals']).toEqual({
      duration: expect.objectContaining({ value: 300, setId: intervals.id }),
    });
  });

  it('sets no distance record for an interval bout claiming an absurd distance', () => {
    const claim = aBout('sprints', 450, null, { distanceM: 200_000, interval: { workS: 30, restS: 30, rounds: 8 } });
    const { sessions } = replay(
      [aBout('sprints', 120, null, { interval: { workS: 30, restS: 0, rounds: 4 } })],
      [claim],
    );
    expect(sessions[1].outputs.prs.flatMap((pr) => (pr.kind === 'cardio' ? pr.records : []))).toEqual([
      { kind: 'duration', value: 240, previous: 120 },
    ]);
  });

  it('sets no distance record faster than the plausible pace ceiling on an activity without a reference pace', () => {
    const claim = aBout('walk', 600, null, { distanceM: 200_000 });
    const honest = aBout('walk', 3600, null, { distanceM: 6000 });
    const { finalState } = replay([aBout('walk', 600, null)], [claim], [honest]);
    expect(finalState.records!.cardio.walk.distance).toEqual(
      expect.objectContaining({ value: 6000, setId: honest.id }),
    );
  });

  it('reports a first distance after a duration-only first session, like an empty rep slot', () => {
    const withDistance = run(1800, 5000);
    const { sessions } = replay([run(1800, null)], [withDistance]);
    expect(sessions[1].outputs.prs).toEqual([
      {
        kind: 'cardio',
        exerciseId: 'run',
        setId: withDistance.id,
        records: [
          { kind: 'distance', value: 5000, previous: null },
          { kind: 'pace', value: 360, previous: null },
        ],
      },
    ]);
  });

  it('needs a pool pace at least 1 s per 100 m faster', () => {
    const swim = (durationS: number) => aBout('swim', durationS, null, { distanceM: 400 });
    const paceGains = (durationS: number) =>
      replay([swim(480)], [swim(durationS)]).sessions[1].outputs.prs.flatMap((pr) =>
        pr.kind === 'cardio' ? pr.records.filter((record) => record.kind === 'pace') : [],
      );
    expect(paceGains(478)).toEqual([]);
    expect(paceGains(476)).toEqual([{ kind: 'pace', value: 1190, previous: 1200 }]);
  });

  it('rebuilds the same cardio records from history', () => {
    const first = run(1800, 5000);
    const second = run(2400, 6000, { interval: null });
    const intervals = aBout('row-intervals', 570, null, { interval: { workS: 30, restS: 30, rounds: 10 } });
    const { finalState } = replay([first], [second, intervals]);
    const rows = [first, second, intervals].map((bout, index) => ({
      kind: 'cardio' as const,
      exerciseId: bout.exerciseId,
      session: {
        id: `session-${index === 0 ? 0 : 1}`,
        startedAt: new Date(firstDay + (index === 0 ? 0 : DAY_MS)).toISOString(),
      },
      setId: bout.id,
      position: bout.position,
      durationS: bout.durationS,
      distanceM: bout.distanceM,
      interval: bout.interval,
    }));
    expect(recordsFromHistory(rows, catalog, TEST_BALANCE).cardio).toEqual(finalState.records!.cardio);
  });

  it('names the set behind a lift record in the summary', () => {
    const triple = aSet('bench', 105, 3, hard);
    const { sessions } = replay([aSet('bench', 90, 5, hard)], [triple]);
    expect(sessions[1].outputs.prs).toEqual([expect.objectContaining({ kind: 'rep_max', setId: triple.id })]);
  });
});
