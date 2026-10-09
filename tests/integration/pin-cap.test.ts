import postgres from 'postgres';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestUser, db, env } from './local-stack.ts';

const writers = postgres(env.DB_URL, { max: 2, onnotice: () => {} });

afterAll(async () => {
  await Promise.all([writers.end(), db.end()]);
});

const PIN_CAP = 50;

async function waitUntilBlockedOrSettled(pid: number, settled: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100 && !settled(); attempt += 1) {
    const [activity] = await db`select wait_event_type from pg_stat_activity where pid = ${pid}`;
    if (activity?.wait_event_type === 'Lock') return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

describe('pin cap', () => {
  it('serialises two concurrent pins at 49 so only one of them lands', async () => {
    const user = await createTestUser();
    const exercises = await db`
      select id from public.exercises where owner_user_id is null order by key limit ${PIN_CAP + 1}`;
    const pins = exercises.map((row, position) => ({ user_id: user.id, exercise_id: row.id, position }));
    await db`insert into public.pinned_exercises ${db(pins.slice(0, PIN_CAP - 1))}`;

    let allowFirstCommit!: () => void;
    const firstMayCommit = new Promise<void>((resolve) => (allowFirstCommit = resolve));
    let markFirstInserted!: () => void;
    const firstInserted = new Promise<void>((resolve) => (markFirstInserted = resolve));
    const first = writers.begin(async (tx) => {
      await tx`insert into public.pinned_exercises ${tx(pins[PIN_CAP - 1])}`;
      markFirstInserted();
      await firstMayCommit;
    });
    await firstInserted;

    let markSecondPid!: (pid: number) => void;
    const secondPid = new Promise<number>((resolve) => (markSecondPid = resolve));
    let secondSettled = false;
    const second = writers
      .begin(async (tx) => {
        const [{ pid }] = await tx`select pg_backend_pid() as pid`;
        markSecondPid(pid);
        await tx`insert into public.pinned_exercises ${tx(pins[PIN_CAP])}`;
      })
      .then(
        () => 'inserted',
        (error: Error) => error.message,
      )
      .finally(() => (secondSettled = true));

    await waitUntilBlockedOrSettled(await secondPid, () => secondSettled);
    allowFirstCommit();
    await first;

    expect(await second).toBe('too_many_pins');
    const [{ count }] = await db`select count(*)::int as count from public.pinned_exercises where user_id = ${user.id}`;
    expect(count).toBe(PIN_CAP);
  });
});
