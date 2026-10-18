import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  chartDateText,
  maxRepsRecord,
  plateauSessions,
  progressChartSeries,
  progressValueText,
  type ProgressSetRow,
  queryProgressSets,
  repMaxTable,
  sessionProgress,
} from '../../web/src/lib/progress/exercise-progress-rules.ts';

function setRow(changes: Partial<ProgressSetRow> & { session_id: string }): ProgressSetRow {
  const day = changes.session_id.replace('day-', '');
  return {
    weight_kg: '100',
    effective_load_kg: '100',
    reps: 5,
    rir: null,
    rir_source: 'estimated',
    prescription_ref: null,
    sessions: { started_at: `2026-10-0${day}T08:00:00Z` },
    ...changes,
  };
}

describe('session progress', () => {
  it('takes the best e1RM and the heaviest set of each session, oldest first', () => {
    const sessions = sessionProgress(
      [
        setRow({ session_id: 'day-3', weight_kg: '105', effective_load_kg: '105', reps: 3 }),
        setRow({ session_id: 'day-1', weight_kg: '90', effective_load_kg: '90', reps: 8 }),
        setRow({ session_id: 'day-1', weight_kg: '100', effective_load_kg: '100', reps: 3 }),
      ],
      'external',
    );
    expect(sessions).toEqual([
      {
        sessionId: 'day-1',
        startedAt: '2026-10-01T08:00:00Z',
        e1rmKg: 111,
        topSetKg: 100,
        topSetReps: 3,
        mostReps: 8,
        programDriven: false,
      },
      {
        sessionId: 'day-3',
        startedAt: '2026-10-03T08:00:00Z',
        e1rmKg: 112,
        topSetKg: 105,
        topSetReps: 3,
        mostReps: 3,
        programDriven: false,
      },
    ]);
  });

  it('keeps the reps of the heaviest set, the most reps when several sets tie for heaviest', () => {
    const [session] = sessionProgress(
      [
        setRow({ session_id: 'day-1', weight_kg: '100', reps: 3 }),
        setRow({ session_id: 'day-1', weight_kg: '80', reps: 10 }),
        setRow({ session_id: 'day-1', weight_kg: '100', reps: 5 }),
      ],
      'external',
    );
    expect(session).toMatchObject({ topSetKg: 100, topSetReps: 5, mostReps: 10 });
  });

  it('counts at most the reps in reserve the strength model trusts', () => {
    const [session] = sessionProgress([setRow({ session_id: 'day-1', rir: '7.0', rir_source: 'logged' })], 'external');
    expect(session.e1rmKg).toBe(130);
  });

  it('counts the reps left in reserve only when the lifter logged them', () => {
    const [logged] = sessionProgress([setRow({ session_id: 'day-1', rir: '3.0', rir_source: 'logged' })], 'external');
    const [estimated] = sessionProgress([setRow({ session_id: 'day-1', rir: '3.0' })], 'external');
    expect(logged.e1rmKg).toBe(123.33);
    expect(estimated.e1rmKg).toBe(113.33);
  });

  it('has no e1RM for sets too far from failure to estimate', () => {
    const [session] = sessionProgress(
      [
        setRow({
          session_id: 'day-1',
          weight_kg: '60',
          effective_load_kg: '60',
          reps: 10,
          rir: 5,
          rir_source: 'logged',
        }),
      ],
      'external',
    );
    expect(session.e1rmKg).toBeNull();
    expect(session.topSetKg).toBe(60);
  });

  it('gives a weighted bodyweight lift its e1RM in added load', () => {
    const [session] = sessionProgress(
      [setRow({ session_id: 'day-1', weight_kg: '20', effective_load_kg: '100' })],
      'bodyweight_plus',
    );
    expect(session).toMatchObject({ e1rmKg: 33.33, topSetKg: 20 });
  });
});

describe('program-driven sessions', () => {
  it('marks a session program-driven when any of its sets came from a prescription', () => {
    const sessions = sessionProgress(
      [
        setRow({ session_id: 'day-1' }),
        setRow({ session_id: 'day-2' }),
        setRow({ session_id: 'day-2', prescription_ref: 'w1:d1:squat:0' }),
      ],
      'external',
    );
    expect(sessions.map((session) => session.programDriven)).toEqual([false, true]);
  });
});

describe('plateau sessions', () => {
  const sessions = [
    {
      sessionId: 'a',
      startedAt: '2026-10-01T12:00:00Z',
      e1rmKg: null,
      topSetKg: 60,
      topSetReps: 12,
      mostReps: 12,
      programDriven: true,
    },
    {
      sessionId: 'b',
      startedAt: '2026-10-03T12:00:00Z',
      e1rmKg: 100,
      topSetKg: 90,
      topSetReps: 5,
      mostReps: 5,
      programDriven: false,
    },
  ];

  it('tracks the e1RM of a loaded lift', () => {
    expect(plateauSessions(sessions, 'external')).toEqual([
      { startedAt: '2026-10-01T12:00:00Z', value: null, programDriven: true },
      { startedAt: '2026-10-03T12:00:00Z', value: 100, programDriven: false },
    ]);
    expect(plateauSessions(sessions, 'bodyweight_plus').map((session) => session.value)).toEqual([null, 100]);
  });

  it('tracks the most reps of a bodyweight lift', () => {
    expect(plateauSessions(sessions, 'bodyweight').map((session) => session.value)).toEqual([12, 5]);
  });
});

describe('progress chart series', () => {
  const sessions = [
    {
      sessionId: 'a',
      startedAt: '2026-10-01T12:00:00Z',
      e1rmKg: null,
      topSetKg: 60,
      topSetReps: 12,
      mostReps: 12,
      programDriven: false,
    },
    {
      sessionId: 'b',
      startedAt: '2026-10-03T12:00:00Z',
      e1rmKg: 100,
      topSetKg: 90,
      topSetReps: 5,
      mostReps: 5,
      programDriven: false,
    },
  ];
  const october = (day: number) => Date.UTC(2026, 9, day, 12);

  it('plots the e1RM and the top set in the preferred unit, by when each workout started', () => {
    expect(progressChartSeries(sessions, 'external', 'kg')).toEqual([
      { name: 'e1RM', points: [{ x: october(3), y: 100 }] },
      {
        name: 'Top set',
        points: [
          { x: october(1), y: 60 },
          { x: october(3), y: 90 },
        ],
      },
    ]);
    expect(progressChartSeries(sessions, 'external', 'lb')[0].points).toEqual([{ x: october(3), y: 220.5 }]);
  });

  it('plots the most reps for a bodyweight exercise', () => {
    expect(progressChartSeries(sessions, 'bodyweight', 'kg')).toEqual([
      {
        name: 'Most reps',
        points: [
          { x: october(1), y: 12 },
          { x: october(3), y: 5 },
        ],
      },
    ]);
  });

  it('writes chart values like the table: reps alone, added load with a plus', () => {
    expect(progressValueText(12, 'bodyweight', 'kg')).toBe('12');
    expect(progressValueText(80, 'external', 'lb')).toBe('80 lb');
    expect(progressValueText(20, 'bodyweight_plus', 'kg')).toBe('+20 kg');
  });

  it('labels a point in time with its day and month', () => {
    expect(chartDateText(october(3))).toBe('3 Oct');
  });
});

describe('rep max table', () => {
  const originalTimeZone = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = 'Pacific/Auckland';
  });
  afterAll(() => {
    process.env.TZ = originalTimeZone;
  });

  it('lists 1RM to 10RM with the day each was set and empty rows for the rest', () => {
    const table = repMaxTable([
      {
        reps: 3,
        load_kg: '102.5',
        achieved_at: '2026-10-02T23:30:00Z',
        sets: { sessions: { local_date: '2026-10-03' } },
      },
      { reps: 1, load_kg: 110, achieved_at: '2026-09-20T20:00:00Z', sets: null },
    ]);
    expect(table).toHaveLength(10);
    expect(table[0]).toEqual({ reps: 1, loadKg: 110, localDate: '2026-09-21' });
    expect(table[1]).toEqual({ reps: 2, loadKg: null, localDate: null });
    expect(table[2]).toEqual({ reps: 3, loadKg: 102.5, localDate: '2026-10-03' });
    expect(table[9].reps).toBe(10);
  });

  it('gives the most reps record of a bodyweight exercise with its day', () => {
    expect(
      maxRepsRecord([
        {
          max_reps: 12,
          achieved_at: '2026-10-01T08:00:00Z',
          sets: { sessions: { local_date: '2026-10-01' } },
        },
      ]),
    ).toEqual({ reps: 12, localDate: '2026-10-01' });
    expect(maxRepsRecord([])).toBeNull();
  });
});

describe('queryProgressSets', () => {
  function rpcClient(data: unknown) {
    const calls: { name: string; args: unknown }[] = [];
    const client = {
      rpc: (name: string, args: unknown) => {
        calls.push({ name, args });
        const builder = {
          abortSignal: () => builder,
          then: (resolve: (result: unknown) => unknown) => Promise.resolve(resolve({ data, error: null })),
        };
        return builder;
      },
    };
    return { client: client as unknown as SupabaseClient, calls };
  }

  it('reads every set of the exercise in one call, however long the history', async () => {
    const rows = Array.from({ length: 2505 }, (_, index) => setRow({ session_id: `day-${(index % 9) + 1}` }));
    const { client, calls } = rpcClient(rows);
    expect(await queryProgressSets(client, 'exercise', new AbortController().signal)).toEqual(rows);
    expect(calls).toEqual([{ name: 'exercise_progress_sets', args: { exercise_id: 'exercise' } }]);
  });

  it('refuses rows this version cannot read', async () => {
    const { client } = rpcClient([{ session_id: 'day-1' }]);
    await expect(queryProgressSets(client, 'exercise', new AbortController().signal)).rejects.toThrow();
  });
});
