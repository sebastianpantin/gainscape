import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  chartDateText,
  maxRepsRecord,
  progressChartSeries,
  progressValueText,
  type ProgressSetRow,
  repMaxTable,
  sessionProgress,
} from '../../web/src/lib/exercise-progress-rules.ts';

function setRow(changes: Partial<ProgressSetRow> & { session_id: string }): ProgressSetRow {
  const day = changes.session_id.replace('day-', '');
  return {
    weight_kg: '100',
    effective_load_kg: '100',
    reps: 5,
    rir: null,
    rir_source: 'estimated',
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
      { sessionId: 'day-1', startedAt: '2026-10-01T08:00:00Z', e1rmKg: 111, topSetKg: 100, mostReps: 8 },
      { sessionId: 'day-3', startedAt: '2026-10-03T08:00:00Z', e1rmKg: 112, topSetKg: 105, mostReps: 3 },
    ]);
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

describe('progress chart series', () => {
  const sessions = [
    { sessionId: 'a', startedAt: '2026-10-01T12:00:00Z', e1rmKg: null, topSetKg: 60, mostReps: 12 },
    { sessionId: 'b', startedAt: '2026-10-03T12:00:00Z', e1rmKg: 100, topSetKg: 90, mostReps: 5 },
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
