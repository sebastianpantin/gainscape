import { describe, expect, it, vi } from 'vitest';
import type { InvokeOutcome } from '../../web/src/lib/platform/function-client-rules.ts';
import {
  invokeWithRetries,
  parseSessionDetailRow,
  parseSessionPageRows,
  withoutHistorySession,
} from '../../web/src/lib/history/history-rules.ts';

type Outcome = InvokeOutcome<{ saved: true }>;

const ok: Outcome = { kind: 'ok', data: { saved: true } };
const offline: Outcome = { kind: 'retryable', reason: 'offline' };
const serverDown: Outcome = { kind: 'http_error', status: 503, code: 'http_503', details: undefined };
const conflict: Outcome = { kind: 'http_error', status: 409, code: 'revision_conflict', details: undefined };

function harness(outcomes: Outcome[], controller = new AbortController()) {
  const pauses: number[] = [];
  const reasons: string[] = [];
  const invoke = vi.fn(async () => outcomes.shift() ?? ok);
  const run = () =>
    invokeWithRetries({
      invoke,
      pause: async (ms) => {
        pauses.push(ms);
      },
      signal: controller.signal,
      onRetry: (reason) => reasons.push(reason),
    });
  return { invoke, pauses, reasons, run, controller };
}

describe('invokeWithRetries', () => {
  it('returns the first outcome when it is not transient', async () => {
    const { invoke, pauses, run } = harness([conflict]);
    await expect(run()).resolves.toEqual(conflict);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(pauses).toEqual([]);
  });

  it('retries transient failures with a growing pause until one succeeds', async () => {
    const { invoke, pauses, reasons, run } = harness([offline, serverDown, ok]);
    await expect(run()).resolves.toEqual(ok);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(pauses).toEqual([1000, 2000]);
    expect(reasons).toEqual(['offline', 'http_503']);
  });

  it('gives up after four automatic retries and returns the last outcome', async () => {
    const { invoke, pauses, run } = harness([offline, offline, offline, offline, serverDown, ok]);
    await expect(run()).resolves.toEqual(serverDown);
    expect(invoke).toHaveBeenCalledTimes(5);
    expect(pauses).toEqual([1000, 2000, 4000, 8000]);
  });

  it('stops retrying once the signal aborts during a pause', async () => {
    const controller = new AbortController();
    const reasons: string[] = [];
    const invoke = vi.fn(async (): Promise<Outcome> => offline);
    const outcome = await invokeWithRetries({
      invoke,
      pause: async () => controller.abort(),
      signal: controller.signal,
      onRetry: (reason) => reasons.push(reason),
    });
    expect(outcome).toEqual(offline);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(reasons).toEqual(['offline']);
  });

  it('does not retry when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const { invoke, run } = harness([offline], controller);
    await expect(run()).resolves.toEqual(offline);
    expect(invoke).toHaveBeenCalledTimes(1);
  });
});

const sessionColumns = {
  id: 'session-1',
  started_at: '2026-09-30T08:00:00.000Z',
  ended_at: '2026-09-30T08:48:00.000Z',
  session_rpe: 7,
  local_date: '2026-09-30',
  history_only: false,
  revision: 2,
  program_day_id: null,
  notes: null,
  summary: { xpBySkill: {}, levelUps: [], prs: [], drops: [] },
};

const sessionView = {
  id: 'session-1',
  startedAt: '2026-09-30T08:00:00.000Z',
  endedAt: '2026-09-30T08:48:00.000Z',
  sessionRpe: 7,
  localDate: '2026-09-30',
  historyOnly: false,
  revision: 2,
  programDayId: null,
  notes: null,
  summary: { xpBySkill: {}, levelUps: [], prs: [], drops: [] },
};

describe('parseSessionPageRows', () => {
  it('reads the embedded sets with their object-shaped exercise and numeric loads', () => {
    const rows = [
      {
        ...sessionColumns,
        sets: [
          { position: 1, is_warmup: false, effective_load_kg: '80.5', reps: 5, exercises: { name: 'Bench press' } },
          { position: 0, is_warmup: true, effective_load_kg: null, reps: null, exercises: null },
        ],
      },
    ];
    expect(parseSessionPageRows(rows)).toEqual([
      {
        ...sessionView,
        setCount: 2,
        overviewSets: [
          { exerciseName: 'Bench press', position: 1, effectiveLoadKg: 80.5, reps: 5, isWarmup: false },
          { exerciseName: 'Exercise', position: 0, effectiveLoadKg: null, reps: null, isWarmup: true },
        ],
      },
    ]);
  });

  it('rejects a row whose exercise embed is not an object', () => {
    const rows = [
      {
        ...sessionColumns,
        sets: [{ position: 0, is_warmup: false, effective_load_kg: 60, reps: 5, exercises: [{ name: 'Squat' }] }],
      },
    ];
    expect(() => parseSessionPageRows(rows)).toThrow();
  });

  it('rejects a row without its session columns', () => {
    expect(() => parseSessionPageRows([{ id: 'session-1', sets: [] }])).toThrow();
  });
});

describe('parseSessionDetailRow', () => {
  it('reads the set count from the counted embed without any set rows', () => {
    expect(parseSessionDetailRow({ ...sessionColumns, sets: [{ count: 4 }] })).toEqual({ ...sessionView, setCount: 4 });
  });

  it('rejects a detail row whose set count is missing', () => {
    expect(() => parseSessionDetailRow({ ...sessionColumns, sets: [] })).toThrow();
  });
});

describe('withoutHistorySession', () => {
  const pages = { pages: [[{ id: 'a' }, { id: 'b' }], [{ id: 'c' }]], pageParams: [null, { id: 'b' }] };

  it('drops a deleted workout from whichever loaded page holds it and keeps the page params', () => {
    expect(withoutHistorySession(pages, 'c')).toEqual({
      pages: [[{ id: 'a' }, { id: 'b' }], []],
      pageParams: [null, { id: 'b' }],
    });
  });

  it('leaves the pages alone when the workout is not loaded, and an empty cache empty', () => {
    expect(withoutHistorySession(pages, 'z')).toEqual(pages);
    expect(withoutHistorySession(undefined, 'a')).toBeUndefined();
  });
});
