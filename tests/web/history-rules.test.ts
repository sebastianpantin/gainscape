import { describe, expect, it, vi } from 'vitest';
import type { InvokeOutcome } from '../../web/src/lib/function-client-rules.ts';
import { invokeWithRetries } from '../../web/src/lib/history-rules.ts';

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
