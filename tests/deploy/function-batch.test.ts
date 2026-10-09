import { describe, expect, it } from 'vitest';
import { forEachConcurrently, isEdgeRuntimeDrop, retryEdgeRuntimeDrops } from '../../scripts/function-batch.ts';

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('forEachConcurrently', () => {
  it('runs every item once and never more than the limit at a time', async () => {
    const seen: number[] = [];
    let running = 0;
    let peak = 0;
    await forEachConcurrently([1, 2, 3, 4, 5, 6, 7], 3, async (item) => {
      running += 1;
      peak = Math.max(peak, running);
      await tick();
      seen.push(item);
      running -= 1;
    });
    expect([...seen].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(peak).toBe(3);
  });

  it('finishes at once for no items', async () => {
    await expect(forEachConcurrently([], 4, () => Promise.reject(new Error('never')))).resolves.toBeUndefined();
  });

  it('starts no item after the first failure, lets running items finish, then rejects with the first failure', async () => {
    const started: number[] = [];
    const finished: number[] = [];
    const run = forEachConcurrently([1, 2, 3, 4, 5, 6], 3, async (item) => {
      started.push(item);
      await tick();
      if (item === 1) throw new Error('item 1 failed');
      await tick();
      if (item === 2) throw new Error('item 2 failed');
      finished.push(item);
    });
    await expect(run).rejects.toThrow('item 1 failed');
    expect(started).toEqual([1, 2, 3]);
    expect(finished).toEqual([3]);
  });

  it('refuses a limit below 1', async () => {
    await expect(forEachConcurrently([1], 0, async () => {})).rejects.toThrow(RangeError);
  });
});

describe('isEdgeRuntimeDrop', () => {
  it('treats a 5xx with no body, a non-JSON body or a body without an app error as a drop', () => {
    expect(isEdgeRuntimeDrop(503, '')).toBe(true);
    expect(isEdgeRuntimeDrop(502, '<html>bad gateway</html>')).toBe(true);
    expect(isEdgeRuntimeDrop(500, '{"code":"Internal Server Error"}')).toBe(true);
    expect(isEdgeRuntimeDrop(500, 'null')).toBe(true);
  });

  it('never treats an app error or a non-5xx as a drop', () => {
    expect(isEdgeRuntimeDrop(500, '{"error":"internal"}')).toBe(false);
    expect(isEdgeRuntimeDrop(404, '')).toBe(false);
    expect(isEdgeRuntimeDrop(200, '{"ok":true}')).toBe(false);
  });
});

describe('retryEdgeRuntimeDrops', () => {
  const answers = (...responses: { status: number; rawBody: string }[]) => {
    let calls = 0;
    const send = async () => responses[Math.min(calls++, responses.length - 1)];
    return { send, calls: () => calls };
  };

  it('retries a drop and returns the first real answer', async () => {
    const { send, calls } = answers({ status: 503, rawBody: '' }, { status: 200, rawBody: '{"ok":true}' });
    expect(await retryEdgeRuntimeDrops(send, 2, () => {})).toEqual({ status: 200, rawBody: '{"ok":true}' });
    expect(calls()).toBe(2);
  });

  it('gives up after the retries and returns the last drop', async () => {
    const { send, calls } = answers({ status: 503, rawBody: '' });
    expect(await retryEdgeRuntimeDrops(send, 2, () => {})).toEqual({ status: 503, rawBody: '' });
    expect(calls()).toBe(3);
  });

  it('never retries an app error', async () => {
    const { send, calls } = answers({ status: 500, rawBody: '{"error":"internal"}' });
    expect(await retryEdgeRuntimeDrops(send, 2, () => {})).toEqual({ status: 500, rawBody: '{"error":"internal"}' });
    expect(calls()).toBe(1);
  });

  it('reports each retried drop', async () => {
    const warnings: string[] = [];
    const { send } = answers({ status: 503, rawBody: '' }, { status: 200, rawBody: '{}' });
    await retryEdgeRuntimeDrops(send, 2, (dropped) => warnings.push(`${dropped.status} ${dropped.rawBody}`));
    expect(warnings).toEqual(['503 ']);
  });
});
