import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { aSet, DAY_MS, hoursAgo, payloadAt, postSession } from './loot-support.ts';
import {
  builtInExerciseId,
  createTestUser,
  db,
  env,
  type FunctionResponse,
  postCompleteSession,
  postFunction,
  rateLimitHits,
  seedRateLimitHits,
  TEST_PASSWORD,
  type TestUser,
} from './local-stack.ts';

let benchId: string;

function expectRateLimited(response: FunctionResponse, bucket: string, windowSeconds: number): void {
  expect(response.status, response.rawBody).toBe(429);
  expect(response.body.error).toBe('rate_limited');
  const details = response.body.details as { bucket: string; retryAfterSeconds: number };
  expect(details.bucket).toBe(bucket);
  expect(details.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  expect(details.retryAfterSeconds).toBeLessThanOrEqual(windowSeconds);
  expect(response.headers.get('retry-after')).toBe(String(details.retryAfterSeconds));
}

async function sessionAndSetCounts(userId: string) {
  const [row] = await db`
    select (select count(*)::int from public.sessions where user_id = ${userId}) as sessions,
           (select count(*)::int from public.sets where user_id = ${userId}) as sets`;
  return row;
}

beforeAll(async () => {
  benchId = await builtInExerciseId('barbell_bench_press');
});

afterAll(async () => {
  await db.end();
});

describe('complete-session', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });

  it('refuses a new session at the hourly cap and stores nothing', async () => {
    const stored = payloadAt(hoursAgo(4), [aSet(benchId, 0, 60)]);
    await postSession(user, stored);
    await seedRateLimitHits('session_create_hour', user.id, 20);
    const before = await sessionAndSetCounts(user.id);

    const refused = await postCompleteSession(user.accessToken, payloadAt(hoursAgo(2), [aSet(benchId, 0, 70)]));
    expectRateLimited(refused, 'session_create_hour', 3600);
    expect(await sessionAndSetCounts(user.id)).toEqual(before);

    const retry = await postCompleteSession(user.accessToken, stored);
    expect(retry.status, retry.rawBody).toBe(200);
    expect(retry.body.sessionId).toBe(stored.id);
  });

  it('does not count a session refused by validation', async () => {
    await seedRateLimitHits('session_create_hour', user.id, 19);
    const invalid = await postCompleteSession(user.accessToken, payloadAt(hoursAgo(2), [aSet(randomUUID(), 0, 60)]));
    expect(invalid.status).toBe(422);
    expect(invalid.body.error).toBe('unknown_exercise');
    expect(await rateLimitHits('session_create_hour', user.id)).toBe(19);
  });

  it('accepts sessions again once the window has passed', async () => {
    await seedRateLimitHits('session_create_hour', user.id, 20);
    await db`
      update private.rate_limit_hits set window_start = window_start - interval '1 hour'
      where bucket = 'session_create_hour' and subject = ${user.id}`;
    await postSession(user, payloadAt(hoursAgo(1), [aSet(benchId, 0, 65)]));
  });

  it('applies the daily cap even with the hourly bucket empty', async () => {
    const daily = await createTestUser();
    await seedRateLimitHits('session_create_day', daily.id, 60);
    const refused = await postCompleteSession(daily.accessToken, payloadAt(hoursAgo(1), [aSet(benchId, 0, 60)]));
    expectRateLimited(refused, 'session_create_day', 86400);
    expect(await rateLimitHits('session_create_hour', daily.id)).toBe(0);
  });

  it('counts a history-only session', async () => {
    const historian = await createTestUser();
    expect(await rateLimitHits('session_create_hour', historian.id)).toBe(0);
    const response = await postSession(historian, payloadAt(new Date(Date.now() - 8 * DAY_MS), [aSet(benchId, 0, 60)]));
    expect(response.body.historyOnly).toBe(true);
    expect(await rateLimitHits('session_create_hour', historian.id)).toBe(1);
  });
});

describe('edit-session', () => {
  it('refuses a real edit at the cap and lets a no-op through', async () => {
    const user = await createTestUser();
    const session = payloadAt(hoursAgo(1), [aSet(benchId, 0, 60)]);
    await postSession(user, session);
    await seedRateLimitHits('session_edit_hour', user.id, 60);
    const edit = (weightKg: number) =>
      postFunction('edit-session', user.accessToken, {
        sessionId: session.id,
        ifRevision: 0,
        notes: null,
        sets: [{ ...session.sets[0], weightKg }],
      });

    expectRateLimited(await edit(70), 'session_edit_hour', 3600);
    const [row] = await db`select revision from public.sessions where id = ${session.id}`;
    expect(row.revision).toBe(0);
    expect((await edit(60)).status).toBe(200);
  });
});

describe('delete-session', () => {
  it('refuses a delete at the cap and still answers a tombstone retry', async () => {
    const user = await createTestUser();
    const deleted = payloadAt(hoursAgo(2), [aSet(benchId, 0, 60)]);
    const kept = payloadAt(hoursAgo(1), [aSet(benchId, 0, 60)]);
    await postSession(user, deleted);
    await postSession(user, kept);
    expect((await postFunction('delete-session', user.accessToken, { sessionId: deleted.id })).status).toBe(200);
    await seedRateLimitHits('session_delete_hour', user.id, 30);

    expectRateLimited(
      await postFunction('delete-session', user.accessToken, { sessionId: kept.id }),
      'session_delete_hour',
      3600,
    );
    const [row] = await db`select count(*)::int as count from public.sessions where id = ${kept.id}`;
    expect(row.count).toBe(1);
    expect((await postFunction('delete-session', user.accessToken, { sessionId: deleted.id })).status).toBe(200);
  });
});

describe('export-data', () => {
  it('refuses the sixth export in an hour', async () => {
    const user = await createTestUser();
    for (let call = 0; call < 5; call += 1) {
      expect((await postFunction('export-data', user.accessToken, {})).status).toBe(200);
    }
    expectRateLimited(await postFunction('export-data', user.accessToken, {}), 'export_data_hour', 3600);
  });
});

describe('delete-account', () => {
  it('counts wrong passwords and refuses even the right one at the cap', async () => {
    const user = await createTestUser();
    const attempt = (password: string) =>
      postFunction('delete-account', user.accessToken, { confirmUsername: user.username, password });
    for (let call = 0; call < 5; call += 1) {
      const wrong = await attempt('not-the-password');
      expect(wrong.status).toBe(403);
      expect(wrong.body.error).toBe('wrong_password');
    }
    expectRateLimited(await attempt(TEST_PASSWORD), 'delete_account_hour', 3600);
    const [exists] = await db`select count(*)::int as count from public.profiles where id = ${user.id}`;
    expect(exists.count).toBe(1);

    await db`delete from private.rate_limit_hits where subject = ${user.id}`;
    const deleted = await attempt(TEST_PASSWORD);
    expect(deleted.status, deleted.rawBody).toBe(200);
  });
});

describe('CORS', () => {
  it.each(['complete-session', 'edit-session', 'delete-session', 'export-data', 'delete-account'])(
    '%s exposes Retry-After',
    async (name) => {
      const response = await fetch(`${env.FUNCTIONS_URL}/${name}`, { method: 'OPTIONS' });
      expect(response.headers.get('access-control-expose-headers')).toContain('retry-after');
    },
  );
});
