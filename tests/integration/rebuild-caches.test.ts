import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  builtInExerciseId,
  createTestUser,
  db,
  env,
  fetchFunction,
  normalizedSnapshot,
  postCompleteSession,
  postFunction,
  rebuildCaches,
  setBodyweight,
  type TestUser,
} from './local-stack.ts';
import { DEFAULT_BALANCE } from '@domain/index.ts';
import { aBout, aSet, HOUR_MS, hoursAgo, payloadAt } from './session-support.ts';

let lifter: TestUser;
let benchId: string;
let squatId: string;
let pullUpId: string;

beforeAll(async () => {
  [benchId, squatId, pullUpId] = await Promise.all([
    builtInExerciseId('barbell_bench_press'),
    builtInExerciseId('back_squat'),
    builtInExerciseId('pull_up'),
  ]);
  lifter = await createTestUser();
  await setBodyweight(lifter, 80);

  const sessions = [
    payloadAt(hoursAgo(6), [aSet(benchId, 0, 80), aSet(pullUpId, 1, 0, { reps: 8 })]),
    payloadAt(hoursAgo(4), [
      aSet(benchId, 0, 80, { reps: 6, effort: null }),
      aSet(squatId, 1, 100, { effort: { type: 'level', level: 'near_failure' } }),
    ]),
  ];
  for (const session of sessions) expect((await postCompleteSession(lifter.accessToken, session)).status).toBe(200);

  await setBodyweight(lifter, 85);
  const third = payloadAt(hoursAgo(2), [
    aSet(pullUpId, 0, 0, { reps: 9, effort: null }),
    aSet(benchId, 1, 82.5, { effort: null }),
  ]);
  expect((await postCompleteSession(lifter.accessToken, third)).status).toBe(200);
});

afterAll(async () => {
  await db.end();
});

describe('rebuild-caches', () => {
  it('reproduces exactly what incremental processing stored', async () => {
    const before = await normalizedSnapshot(lifter.id);
    const result = await rebuildCaches(lifter.id);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ userId: lifter.id, sessionsReplayed: 3, setsRewritten: 6 });
    expect(await normalizedSnapshot(lifter.id)).toEqual(before);
  });

  it('re-derives cardio records and the cardio summaries', async () => {
    const runner = await createTestUser();
    const runId = await builtInExerciseId('running');
    const run = (hours: number, durationS: number, distanceM: number) =>
      payloadAt(hoursAgo(hours), [aBout(runId, 0, { durationS, distanceM, effort: null })]);
    for (const session of [run(6, 1800, 5000), run(4, 1790, 5800), run(2, 1500, 5000)]) {
      expect((await postCompleteSession(runner.accessToken, session)).status).toBe(200);
    }
    const before = await normalizedSnapshot(runner.id);
    expect(before.cardioRecords).toHaveLength(3);
    expect((await rebuildCaches(runner.id)).status).toBe(200);
    expect(await normalizedSnapshot(runner.id)).toEqual(before);
  });

  it('keeps the bodyweight each set was logged with', async () => {
    const rows = await db`
      select st.effective_load_kg::float from public.sets st join public.sessions s on s.id = st.session_id
      where st.user_id = ${lifter.id} and st.exercise_id = ${pullUpId} order by s.started_at`;
    expect(rows.map((row) => row.effective_load_kg)).toEqual([80, 85]);
  });

  it('re-derives legacy default-effort sets', async () => {
    const user = await createTestUser();
    const sessionId = randomUUID();
    const setId = randomUUID();
    const startedAt = new Date(Date.now() - HOUR_MS).toISOString();
    await db.begin(async (tx) => {
      await tx`insert into public.sessions (id, user_id, started_at, ended_at, local_date, timezone, balance_version, derived_balance_version, summary)
               values (${sessionId}, ${user.id}, ${startedAt}, ${startedAt}, current_date, 'UTC', 1, 1, '{}')`;
      await tx`insert into public.sets (id, session_id, user_id, exercise_id, position, weight_kg, effective_load_kg, reps, rir, rir_source, effective_reps, xp_awarded)
               values (${setId}, ${sessionId}, ${user.id}, ${benchId}, 0, 60, 60, 8, 3, 'default', 3, 30)`;
    });
    expect((await rebuildCaches(user.id)).status).toBe(200);
    const [row] = await db`select rir_source, rir, derived_balance_version, balance_version
                           from public.sets st join public.sessions s on s.id = st.session_id where st.id = ${setId}`;
    expect(row).toEqual({
      rir_source: 'cold_start',
      rir: null,
      derived_balance_version: DEFAULT_BALANCE.version,
      balance_version: 1,
    });
    const [{ legacy }] =
      await db`select count(*)::int as legacy from public.sets where rir_source = 'default' and user_id = ${user.id}`;
    expect(legacy).toBe(0);
  });

  it('rebuild equals the incremental state after out-of-order syncs', async () => {
    const user = await createTestUser();
    await setBodyweight(user, 80);
    const sessions = [
      payloadAt(hoursAgo(2), [
        aSet(benchId, 0, 90, { effort: null }),
        aSet(pullUpId, 1, 0, { reps: 10, effort: null }),
      ]),
      payloadAt(hoursAgo(6), [aSet(benchId, 0, 80)]),
      payloadAt(hoursAgo(4), [
        aSet(squatId, 0, 100, { effort: { type: 'level', level: 'near_failure' } }),
        aSet(pullUpId, 1, 0, { reps: 8 }),
      ]),
    ];
    for (const session of sessions) expect((await postCompleteSession(user.accessToken, session)).status).toBe(200);
    const incremental = await normalizedSnapshot(user.id);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await normalizedSnapshot(user.id)).toEqual(incremental);
  });

  it('rebuild equals the incremental state after edits and deletes', async () => {
    const user = await createTestUser();
    await setBodyweight(user, 80);
    const sessions = [
      payloadAt(hoursAgo(2), [
        aSet(benchId, 0, 90, { effort: null }),
        aSet(pullUpId, 1, 0, { reps: 10, effort: null }),
      ]),
      payloadAt(hoursAgo(8), [aSet(benchId, 0, 80), aSet(squatId, 1, 100)]),
      payloadAt(hoursAgo(4), [aSet(squatId, 0, 110, { reps: 3, effort: null }), aSet(pullUpId, 1, 0, { reps: 8 })]),
      payloadAt(hoursAgo(6), [aSet(benchId, 0, 85, { reps: 4 })]),
    ];
    for (const session of sessions) expect((await postCompleteSession(user.accessToken, session)).status).toBe(200);
    const edit = (body: unknown) => postFunction('edit-session', user.accessToken, body);
    const [, earliest, middle, secondEarliest] = sessions;
    expect(
      (
        await edit({
          sessionId: earliest.id,
          ifRevision: 0,
          notes: 'lighter',
          sets: [
            { ...earliest.sets[0], weightKg: 75, effort: { type: 'level', level: 'near_failure' } },
            earliest.sets[1],
          ],
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await edit({
          sessionId: middle.id,
          ifRevision: 0,
          notes: null,
          sets: [
            { ...middle.sets[1], position: 0 },
            { ...middle.sets[0], position: 1, exerciseId: benchId, weightKg: 95 },
          ],
        })
      ).status,
    ).toBe(200);
    expect((await postFunction('delete-session', user.accessToken, { sessionId: secondEarliest.id })).status).toBe(200);

    const incremental = await normalizedSnapshot(user.id);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await normalizedSnapshot(user.id)).toEqual(incremental);
  });

  it('rebuild removes cache rows of exercises with no sessions', async () => {
    const user = await createTestUser();
    const session = payloadAt(hoursAgo(1), [aSet(benchId, 0, 80)]);
    expect((await postCompleteSession(user.accessToken, session)).status).toBe(200);
    await db`insert into public.rep_maxes (user_id, exercise_id, reps, load_kg, achieved_at)
             values (${user.id}, ${squatId}, 3, 120, now())`;
    expect((await rebuildCaches(user.id)).status).toBe(200);
    const stray = await db`select 1 from public.rep_maxes where user_id = ${user.id} and exercise_id = ${squatId}`;
    expect(stray).toHaveLength(0);
    const kept = await db`select 1 from public.rep_maxes where user_id = ${user.id} and exercise_id = ${benchId}`;
    expect(kept.length).toBeGreaterThan(0);
  });

  it.each([
    ['a user token', () => ({ Authorization: `Bearer ${lifter.accessToken}`, apikey: env.PUBLISHABLE_KEY })],
    ['the publishable key', () => ({ apikey: env.PUBLISHABLE_KEY })],
    ['the secret key as a bearer token instead of apikey', () => ({ Authorization: `Bearer ${env.SECRET_KEY}` })],
    ['no key at all', () => ({})],
  ])('refuses a caller with %s', async (_case, credentials) => {
    const result = await rebuildCaches(lifter.id, credentials());
    expect(result.status).toBe(403);
    expect(result.body.error).toBe('secret_key_required');
  });

  it('returns 404 user_not_found for a user without a profile', async () => {
    const result = await rebuildCaches(randomUUID());
    expect(result.status).toBe(404);
    expect(result.body.error).toBe('user_not_found');
  });

  it.each([
    ['a missing user id', JSON.stringify({}), 422, 'invalid_payload'],
    ['a user id that is not a uuid', JSON.stringify({ userId: 'not-a-uuid' }), 422, 'invalid_payload'],
    ['an unknown key', JSON.stringify({ userId: randomUUID(), extra: true }), 422, 'invalid_payload'],
    ['a body that is not JSON', '{', 400, 'invalid_json'],
  ])('rejects %s', async (_case, body, status, code) => {
    const response = await fetchFunction('rebuild-caches', {
      method: 'POST',
      headers: { apikey: env.SECRET_KEY, 'Content-Type': 'application/json' },
      body,
    });
    expect(response.status, response.rawBody).toBe(status);
    expect(JSON.parse(response.rawBody).error).toBe(code);
  });
});

const MAX_UUID = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
const TWICE_NAMED = randomUUID();

function uuidBefore(id: string): string {
  const hex = (BigInt(`0x${id.replaceAll('-', '')}`) - 1n).toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function postRebuild(body: unknown) {
  const response = await fetchFunction('rebuild-caches', {
    method: 'POST',
    headers: { apikey: env.SECRET_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: JSON.parse(response.rawBody), rawBody: response.rawBody };
}

async function listFrom(scope: 'stale' | 'all', after: string | null, limit: number) {
  const response = await postRebuild({ list: { scope, after, limit } });
  expect(response.status, response.rawBody).toBe(200);
  return response.body as { userIds: string[]; next: string | null };
}

async function lifterWithSessions(): Promise<TestUser> {
  const user = await createTestUser();
  expect((await postCompleteSession(user.accessToken, payloadAt(hoursAgo(3), [aSet(benchId, 0, 80)]))).status).toBe(
    200,
  );
  return user;
}

async function markStale(userId: string): Promise<void> {
  await db`update public.sessions set derived_balance_version = ${DEFAULT_BALANCE.version - 1} where user_id = ${userId}`;
}

describe('rebuild-caches in batches', () => {
  it('lists a user with a stale session, but not one whose sessions are all current', async () => {
    const [stale, current] = [await lifterWithSessions(), await lifterWithSessions()];
    await markStale(stale.id);

    expect(await listFrom('stale', uuidBefore(stale.id), 1)).toEqual({ userIds: [stale.id], next: stale.id });
    expect((await listFrom('stale', uuidBefore(current.id), 1)).userIds).not.toContain(current.id);
  });

  it('lists every profile with a session or a derived row for all, but never an empty profile', async () => {
    const [withSessions, empty, onlyDerived] = [
      await lifterWithSessions(),
      await createTestUser(),
      await createTestUser(),
    ];
    await db`insert into public.rep_maxes (user_id, exercise_id, reps, load_kg, achieved_at)
             values (${onlyDerived.id}, ${squatId}, 3, 120, now())`;

    expect((await listFrom('all', uuidBefore(withSessions.id), 1)).userIds).toEqual([withSessions.id]);
    expect((await listFrom('all', uuidBefore(onlyDerived.id), 1)).userIds).toEqual([onlyDerived.id]);
    expect((await listFrom('all', uuidBefore(empty.id), 1)).userIds).not.toContain(empty.id);
  });

  it('pages in ascending id order and ends with next null', async () => {
    const page = await listFrom('all', null, 3);
    expect(page.userIds).toHaveLength(3);
    expect([...page.userIds].sort()).toEqual(page.userIds);
    expect(page.next).toBe(page.userIds[2]);
    const following = await listFrom('all', page.next, 3);
    expect(following.userIds.every((id) => id > page.userIds[2])).toBe(true);
    expect(await listFrom('all', MAX_UUID, 3)).toEqual({ userIds: [], next: null });
  });

  it('rebuilds a batch of users, reports a missing one and leaves no stale session', async () => {
    const [stale, current] = [await lifterWithSessions(), await lifterWithSessions()];
    const before = await normalizedSnapshot(current.id);
    await markStale(stale.id);
    const missing = randomUUID();

    const response = await postRebuild({ userIds: [stale.id, missing, current.id] });

    expect(response.status, response.rawBody).toBe(200);
    expect(response.body).toEqual({
      balanceVersion: DEFAULT_BALANCE.version,
      rebuilt: [
        { userId: stale.id, sessionsReplayed: 1, setsRewritten: 1 },
        { userId: current.id, sessionsReplayed: 1, setsRewritten: 1 },
      ],
      missing: [missing],
    });
    expect((await listFrom('stale', uuidBefore(stale.id), 1)).userIds).not.toContain(stale.id);
    expect(await normalizedSnapshot(current.id)).toEqual(before);
  });

  it('names the user a batch failed on and keeps the users rebuilt before it', async () => {
    const [stale, broken] = [await lifterWithSessions(), await lifterWithSessions()];
    await markStale(stale.id);
    await db`update public.sessions set challenge = '{}'::jsonb where user_id = ${broken.id}`;
    try {
      const response = await postRebuild({ userIds: [stale.id, broken.id] });

      expect(response.status, response.rawBody).toBe(500);
      expect(response.body).toEqual({ error: 'rebuild_failed', details: { userId: broken.id, rebuiltBefore: 1 } });
      expect((await listFrom('stale', uuidBefore(stale.id), 1)).userIds).not.toContain(stale.id);
    } finally {
      await db`update public.sessions set challenge = null where user_id = ${broken.id}`;
    }
  });

  it.each([
    ['an empty batch', { userIds: [] }],
    ['a batch of 51 users', { userIds: Array.from({ length: 51 }, () => randomUUID()) }],
    ['a batch with a non-uuid', { userIds: ['not-a-uuid'] }],
    ['a batch naming a user twice', { userIds: [TWICE_NAMED, TWICE_NAMED.toUpperCase()] }],
    ['a list limit of 0', { list: { scope: 'all', after: null, limit: 0 } }],
    ['a list limit of 1001', { list: { scope: 'all', after: null, limit: 1001 } }],
    ['an unknown list scope', { list: { scope: 'everyone', after: null, limit: 10 } }],
    ['a list without after', { list: { scope: 'stale', limit: 10 } }],
    ['a user id and a batch together', { userId: randomUUID(), userIds: [randomUUID()] }],
  ])('rejects %s', async (_case, body) => {
    const response = await postRebuild(body);
    expect(response.status, response.rawBody).toBe(422);
    expect(response.body.error).toBe('invalid_payload');
  });

  it('refuses a batch or a list without the secret key', async () => {
    for (const body of [{ userIds: [lifter.id] }, { list: { scope: 'all', after: null, limit: 1 } }]) {
      const response = await fetchFunction('rebuild-caches', {
        method: 'POST',
        headers: { apikey: env.PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(403);
    }
  });
});
