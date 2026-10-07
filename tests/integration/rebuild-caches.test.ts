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
