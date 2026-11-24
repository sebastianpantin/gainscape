import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { querySeenGarminActivities } from '../../web/src/lib/garmin/seen-activities-rules.ts';
import {
  builtInExerciseId,
  createTestUser,
  db,
  normalizedSnapshot,
  postFunction,
  rebuildCaches,
  seedRateLimitHits,
  type TestUser,
} from './local-stack.ts';
import { aBout, DAY_MS, editSession, HOUR_MS, payloadAt, postSession } from './session-support.ts';

interface ActivityBody {
  startedAt: string;
  garminType: string | null;
  exerciseId: string;
  durationS: number;
  distanceM: number | null;
  interval: { workS: number; restS: number; rounds: number } | null;
}

interface ActivityOutcome {
  startedAt: string;
  outcome: 'imported' | 'history_only' | 'skipped';
  sessionId?: string;
  xp?: number;
  reason?: string;
}

let runningId: string;
let cyclingId: string;
let benchId: string;
let yogaId: string;

beforeAll(async () => {
  [runningId, cyclingId, benchId, yogaId] = await Promise.all([
    builtInExerciseId('running'),
    builtInExerciseId('cycling'),
    builtInExerciseId('barbell_bench_press'),
    builtInExerciseId('yoga'),
  ]);
});

afterAll(async () => {
  await db.end();
});

function wholeSecondAgo(ms: number): string {
  return new Date(Math.floor((Date.now() - ms) / 1000) * 1000).toISOString();
}

function aRun(startedAt: string, overrides: Partial<ActivityBody> = {}): ActivityBody {
  return {
    startedAt,
    garminType: 'running',
    exerciseId: runningId,
    durationS: 1800,
    distanceM: 5000,
    interval: null,
    ...overrides,
  };
}

async function importAs(user: TestUser, activities: unknown[]) {
  return await postFunction('import-activities', user.accessToken, { activities });
}

async function imported(user: TestUser, activities: ActivityBody[]): Promise<ActivityOutcome[]> {
  const response = await importAs(user, activities);
  expect(response.status, response.rawBody).toBe(200);
  return (response.body as unknown as { activities: ActivityOutcome[] }).activities;
}

async function seenBy(userId: string) {
  const rows = await db`
    select started_at, outcome::text, session_id, garmin_type
    from public.garmin_activities where user_id = ${userId} order by started_at`;
  return rows.map((row) => ({
    startedAt: new Date(row.started_at).toISOString(),
    outcome: row.outcome as string,
    sessionId: row.session_id as string | null,
    garminType: row.garmin_type as string | null,
  }));
}

async function sessionsOf(userId: string) {
  return await db`
    select id, started_at, ended_at, history_only, notes, session_rpe, summary
    from public.sessions where user_id = ${userId} order by started_at`;
}

async function totalXp(userId: string): Promise<number> {
  const [row] = await db`select coalesce(sum(xp), 0)::int as xp from public.user_skills where user_id = ${userId}`;
  return row.xp;
}

describe('import-activities', () => {
  it('needs a signed-in user', async () => {
    const response = await postFunction('import-activities', 'not-a-token', {
      activities: [aRun(wholeSecondAgo(HOUR_MS))],
    });
    expect(response.status).toBe(401);
  });

  it('stores a confirmed activity as a Session with one Cardio set and no Effort, and remembers it', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(3 * HOUR_MS);
    const [outcome] = await imported(user, [aRun(startedAt, { garminType: 'treadmill_running' })]);

    expect(outcome).toEqual({
      startedAt,
      outcome: 'imported',
      sessionId: expect.any(String),
      xp: expect.any(Number),
    });
    expect(outcome.xp).toBe(await totalXp(user.id));
    expect(outcome.xp).toBeGreaterThan(0);
    expect(await seenBy(user.id)).toEqual([
      { startedAt, outcome: 'imported', sessionId: outcome.sessionId, garminType: 'treadmill_running' },
    ]);
    const [session] = await sessionsOf(user.id);
    expect(session).toMatchObject({ id: outcome.sessionId, history_only: false, notes: null, session_rpe: null });
    expect(new Date(session.started_at).toISOString()).toBe(startedAt);
    expect(new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()).toBe(1800 * 1000);
    const sets = await db`
      select exercise_id, position, duration_s, distance_m::float, interval_rounds, effort_input_type, effort_value,
             reps, weight_kg
      from public.sets where session_id = ${outcome.sessionId!}`;
    expect(sets).toEqual([
      {
        exercise_id: runningId,
        position: 0,
        duration_s: 1800,
        distance_m: 5000,
        interval_rounds: null,
        effort_input_type: null,
        effort_value: null,
        reps: null,
        weight_kg: null,
      },
    ]);
  });

  it('earns by the normal rules: the same XP and Records as the same run logged by hand without Effort', async () => {
    const [importer, logger] = await Promise.all([createTestUser(), createTestUser()]);
    const firstStart = wholeSecondAgo(30 * HOUR_MS);
    const secondStart = wholeSecondAgo(4 * HOUR_MS);
    const longer = { durationS: 2160, distanceM: 6000 };

    const logged = [];
    for (const [startedAt, values] of [
      [firstStart, { durationS: 1800, distanceM: 5000 }],
      [secondStart, longer],
    ] as const) {
      const payload = payloadAt(new Date(startedAt), [aBout(runningId, 0, { ...values, effort: null })]);
      logged.push(await postSession(logger, payload));
    }
    const outcomes = await imported(importer, [aRun(firstStart), aRun(secondStart, longer)]);

    expect(outcomes.map((outcome) => outcome.xp)).toEqual(
      logged.map((response) => Object.values(response.body.xpBySkill!).reduce((sum, xp) => sum + xp, 0)),
    );
    expect(outcomes[0].xp).toBeGreaterThan(0);
    const [, second] = await sessionsOf(importer.id);
    expect(second.summary.prs).toEqual([
      {
        kind: 'cardio',
        exerciseId: runningId,
        setId: expect.any(String),
        records: [
          { kind: 'distance', value: 6000, previous: 5000 },
          { kind: 'duration', value: 2160, previous: 1800 },
        ],
      },
    ]);
  });

  it('stores the interval of a structured workout as an interval set', async () => {
    const user = await createTestUser();
    const [outcome] = await imported(user, [
      aRun(wholeSecondAgo(2 * HOUR_MS), { durationS: 860, interval: { workS: 60, restS: 30, rounds: 4 } }),
    ]);
    const [set] = await db`
      select duration_s, interval_work_s, interval_rest_s, interval_rounds, counted_work_s
      from public.sets where session_id = ${outcome.sessionId!}`;
    expect(set).toEqual({
      duration_s: 330,
      interval_work_s: 60,
      interval_rest_s: 30,
      interval_rounds: 4,
      counted_work_s: 240,
    });
    const [session] = await sessionsOf(user.id);
    expect(new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()).toBe(860 * 1000);
  });

  it('skips the second import of the same activity and changes nothing', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(5 * HOUR_MS);
    const [first] = await imported(user, [aRun(startedAt)]);
    const before = await normalizedSnapshot(user.id);

    const again = await imported(user, [aRun(startedAt, { exerciseId: cyclingId, distanceM: 9000 })]);

    expect(again).toEqual([{ startedAt, outcome: 'skipped', reason: 'already_imported' }]);
    expect(await normalizedSnapshot(user.id)).toEqual(before);
    expect(await seenBy(user.id)).toEqual([
      { startedAt, outcome: 'imported', sessionId: first.sessionId, garminType: 'running' },
    ]);
  });

  it('imports an activity once when one chunk names it twice', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(5 * HOUR_MS);
    const outcomes = await imported(user, [aRun(startedAt), aRun(startedAt)]);
    expect(outcomes.map((outcome) => outcome.outcome)).toEqual(['imported', 'skipped']);
    expect(outcomes[1].reason).toBe('already_imported');
    expect(await sessionsOf(user.id)).toHaveLength(1);
  });

  it('keeps a deleted import deleted: no later import brings it back', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(6 * HOUR_MS);
    const [first] = await imported(user, [aRun(startedAt)]);
    const removed = await postFunction('delete-session', user.accessToken, { sessionId: first.sessionId });
    expect(removed.status, removed.rawBody).toBe(200);
    expect(await seenBy(user.id)).toEqual([{ startedAt, outcome: 'deleted', sessionId: null, garminType: 'running' }]);

    expect(await imported(user, [aRun(startedAt)])).toEqual([{ startedAt, outcome: 'skipped', reason: 'deleted' }]);
    expect(await sessionsOf(user.id)).toEqual([]);
    expect(await totalXp(user.id)).toBe(0);
  });

  it('keeps the link to its Garmin activity when the imported Session is edited', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(6 * HOUR_MS);
    const [first] = await imported(user, [aRun(startedAt)]);
    const [stored] = await db`select id from public.sets where session_id = ${first.sessionId!}`;

    await editSession(user, { id: first.sessionId! }, [
      aBout(runningId, 0, { id: stored.id, durationS: 2400, distanceM: 7000, effort: null }),
    ]);

    expect(await seenBy(user.id)).toEqual([
      { startedAt, outcome: 'imported', sessionId: first.sessionId, garminType: 'running' },
    ]);
    expect(await imported(user, [aRun(startedAt)])).toEqual([
      { startedAt, outcome: 'skipped', reason: 'already_imported' },
    ]);
  });

  it('skips an activity Gainscape rejected earlier', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(6 * HOUR_MS);
    await db`
      insert into public.garmin_activities (user_id, started_at, outcome, garmin_type)
      values (${user.id}, ${startedAt}, 'rejected', 'running')`;
    expect(await imported(user, [aRun(startedAt)])).toEqual([{ startedAt, outcome: 'skipped', reason: 'rejected' }]);
    expect(await sessionsOf(user.id)).toEqual([]);
  });

  it('stores an activity older than 7 days as history only, which earns nothing', async () => {
    const user = await createTestUser();
    const old = wholeSecondAgo(8 * DAY_MS);
    const recent = wholeSecondAgo(6 * DAY_MS);
    const outcomes = await imported(user, [aRun(old, { durationS: 3600, distanceM: 12000 }), aRun(recent)]);

    expect(outcomes).toEqual([
      { startedAt: old, outcome: 'history_only', sessionId: expect.any(String) },
      { startedAt: recent, outcome: 'imported', sessionId: expect.any(String), xp: expect.any(Number) },
    ]);
    const [oldSession, recentSession] = await sessionsOf(user.id);
    expect(oldSession).toMatchObject({ id: outcomes[0].sessionId, history_only: true });
    expect(recentSession.summary.prs).toEqual([]);
    const [oldSet] = await db`select xp_awarded from public.sets where session_id = ${outcomes[0].sessionId!}`;
    expect(oldSet.xp_awarded).toBe(0);
    expect(await totalXp(user.id)).toBe(outcomes[1].xp);
    expect((await seenBy(user.id)).map((seen) => seen.outcome)).toEqual(['imported', 'imported']);
  });

  it('replays later Sessions when a scored import lands before them', async () => {
    const user = await createTestUser();
    const first = payloadAt(new Date(wholeSecondAgo(30 * HOUR_MS)), [
      aBout(runningId, 0, { durationS: 1800, distanceM: 5000 }),
    ]);
    const later = payloadAt(new Date(wholeSecondAgo(2 * HOUR_MS)), [
      aBout(runningId, 0, { durationS: 2160, distanceM: 6000 }),
    ]);
    await postSession(user, first);
    const laterResponse = await postSession(user, later);
    expect(laterResponse.body.prs).toHaveLength(1);

    const between = wholeSecondAgo(20 * HOUR_MS);
    const [outcome] = await imported(user, [aRun(between, { durationS: 3600, distanceM: 10_000 })]);

    expect(outcome.outcome).toBe('imported');
    const sessions = await sessionsOf(user.id);
    expect(sessions.map((session) => session.id)).toEqual([first.id, outcome.sessionId, later.id]);
    expect(sessions[1].summary.prs).toHaveLength(1);
    expect(sessions[2].summary.prs).toEqual([]);
    const afterImport = await normalizedSnapshot(user.id);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await normalizedSnapshot(user.id)).toEqual(afterImport);
  });

  it('imports a chunk sent out of order in start-time order, and answers in the order sent', async () => {
    const user = await createTestUser();
    const starts = [50, 10, 30, 70, 20].map((hours) => wholeSecondAgo(hours * HOUR_MS));
    const outcomes = await imported(
      user,
      starts.map((startedAt, index) =>
        aRun(startedAt, { durationS: 1800 + index * 60, distanceM: 5000 + index * 500 }),
      ),
    );

    expect(outcomes.map((outcome) => outcome.startedAt)).toEqual(starts);
    expect(outcomes.every((outcome) => outcome.outcome === 'imported')).toBe(true);
    const completed = await db`
      select started_at from public.sessions where user_id = ${user.id} order by completed_at, id`;
    expect(completed.map((row) => new Date(row.started_at).toISOString())).toEqual([...starts].sort());
    const afterImport = await normalizedSnapshot(user.id);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await normalizedSnapshot(user.id)).toEqual(afterImport);
  });

  it('gives the same result whether older chunks arrive before or after newer ones', async () => {
    const [inOrder, reversed] = await Promise.all([createTestUser(), createTestUser()]);
    const older = [60, 50].map((hours) => aRun(wholeSecondAgo(hours * HOUR_MS)));
    const newer = [20, 10].map((hours, index) =>
      aRun(wholeSecondAgo(hours * HOUR_MS), { durationS: 2400 + index * 600, distanceM: 7000 + index * 2000 }),
    );
    await imported(inOrder, older);
    await imported(inOrder, newer);
    await imported(reversed, newer);
    await imported(reversed, older);

    const [first, second] = await Promise.all([normalizedSnapshot(inOrder.id), normalizedSnapshot(reversed.id)]);
    expect(second.userSkills).toEqual(first.userSkills);
    expect(second.cardioRecords).toEqual(first.cardioRecords);
    expect((await sessionsOf(reversed.id)).map((session) => session.summary.prs.length)).toEqual(
      (await sessionsOf(inOrder.id)).map((session) => session.summary.prs.length),
    );
  });

  it('takes a full chunk: 50 activities, 10 of them young enough to score', async () => {
    const user = await createTestUser();
    const scored = Array.from({ length: 10 }, (_, index) =>
      aRun(wholeSecondAgo((2 + index * 12) * HOUR_MS), { durationS: 1800 + index * 60, distanceM: 5000 + index * 200 }),
    );
    const old = Array.from({ length: 40 }, (_, index) => aRun(wholeSecondAgo((10 + index) * DAY_MS)));
    const outcomes = await imported(user, [...scored, ...old]);

    expect(outcomes.map((outcome) => outcome.outcome)).toEqual([
      ...scored.map(() => 'imported'),
      ...old.map(() => 'history_only'),
    ]);
    expect(await sessionsOf(user.id)).toHaveLength(50);
    const afterImport = await normalizedSnapshot(user.id);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await normalizedSnapshot(user.id)).toEqual(afterImport);
  });

  it('refuses a chunk of more than 50 activities and stores nothing', async () => {
    const user = await createTestUser();
    const tooMany = Array.from({ length: 51 }, (_, index) => aRun(wholeSecondAgo((10 + index) * DAY_MS)));
    const response = await importAs(user, tooMany);
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('invalid_payload');
    expect(await sessionsOf(user.id)).toEqual([]);
  });

  it('refuses a chunk with more than 10 activities young enough to score, which would outrun the function', async () => {
    const user = await createTestUser();
    const eleven = Array.from({ length: 11 }, (_, index) => aRun(wholeSecondAgo((2 + index * 12) * HOUR_MS)));
    const response = await importAs(user, eleven);
    expect(response.status, response.rawBody).toBe(422);
    expect(response.body).toEqual({ error: 'too_many_scored_activities', details: { maxScored: 10 } });
    expect(await sessionsOf(user.id)).toEqual([]);
    expect(await seenBy(user.id)).toEqual([]);
  });

  it('does not count toward the Session rate limits', async () => {
    const user = await createTestUser();
    await seedRateLimitHits('session_create_hour', user.id, 10_000);
    await seedRateLimitHits('session_create_day', user.id, 10_000);
    const [outcome] = await imported(user, [aRun(wholeSecondAgo(HOUR_MS))]);
    expect(outcome.outcome).toBe('imported');
  });

  it('caps imported activities at 500 a day and skips the rest of the chunk', async () => {
    const user = await createTestUser();
    await seedRateLimitHits('garmin_import_day', user.id, 498);
    const starts = [40, 30, 20, 10].map((hours) => wholeSecondAgo(hours * HOUR_MS));
    const outcomes = await imported(
      user,
      starts.map((startedAt) => aRun(startedAt)),
    );

    expect(outcomes.map((outcome) => [outcome.outcome, outcome.reason])).toEqual([
      ['imported', undefined],
      ['imported', undefined],
      ['skipped', 'daily_cap'],
      ['skipped', 'daily_cap'],
    ]);
    expect((await seenBy(user.id)).map((seen) => seen.startedAt)).toEqual(starts.slice(0, 2));
    expect(await sessionsOf(user.id)).toHaveLength(2);
  });

  it('spends none of the daily cap on an activity it skips', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(3 * HOUR_MS);
    await imported(user, [aRun(startedAt)]);
    await seedRateLimitHits('garmin_import_day', user.id, 499);
    const outcomes = await imported(user, [aRun(startedAt), aRun(wholeSecondAgo(2 * HOUR_MS))]);
    expect(outcomes.map((outcome) => outcome.outcome)).toEqual(['skipped', 'imported']);
  });

  it('skips an activity that starts in the future without remembering it', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(-2 * HOUR_MS);
    expect(await imported(user, [aRun(startedAt)])).toEqual([{ startedAt, outcome: 'skipped', reason: 'unreadable' }]);
    expect(await seenBy(user.id)).toEqual([]);
  });

  it.each<[string, () => unknown[], string]>([
    ['no activities', () => [], 'invalid_payload'],
    [
      'a start time between two seconds',
      () => [aRun(new Date(Math.floor(Date.now() / 1000) * 1000 - HOUR_MS + 250).toISOString())],
      'invalid_payload',
    ],
    ['a duration over four hours', () => [aRun(wholeSecondAgo(HOUR_MS), { durationS: 14_401 })], 'invalid_payload'],
    ['a duration under a minute', () => [aRun(wholeSecondAgo(HOUR_MS), { durationS: 59 })], 'invalid_payload'],
    ['a distance over 200 km', () => [aRun(wholeSecondAgo(HOUR_MS), { distanceM: 200_001 })], 'invalid_payload'],
    [
      'an interval out of bounds',
      () => [aRun(wholeSecondAgo(HOUR_MS), { interval: { workS: 2, restS: 30, rounds: 4 } })],
      'invalid_payload',
    ],
    [
      'a Garmin type that is no key',
      () => [aRun(wholeSecondAgo(HOUR_MS), { garminType: 'Trail Run!' })],
      'invalid_payload',
    ],
    ['an unknown field', () => [{ ...aRun(wholeSecondAgo(HOUR_MS)), effort: 'max' }], 'invalid_payload'],
    [
      'an unknown exercise',
      () => [aRun(wholeSecondAgo(HOUR_MS), { exerciseId: '5d0c1c9e-3c1e-4d53-9d4e-2f6c8f1a7b10' })],
      'unknown_exercise',
    ],
    ['a lift exercise', () => [aRun(wholeSecondAgo(HOUR_MS), { exerciseId: benchId })], 'kind_mismatch'],
    [
      'a distance on an exercise that tracks none',
      () => [aRun(wholeSecondAgo(HOUR_MS), { exerciseId: yogaId })],
      'distance_not_tracked',
    ],
  ])('refuses a chunk with %s and stores nothing', async (_case, activities, error) => {
    const user = await createTestUser();
    const valid = aRun(wholeSecondAgo(3 * HOUR_MS));
    const response = await importAs(user, activities().length === 0 ? [] : [valid, ...activities()]);
    expect(response.status, response.rawBody).toBe(422);
    expect(response.body.error).toBe(error);
    expect(await seenBy(user.id)).toEqual([]);
    expect(await sessionsOf(user.id)).toEqual([]);
  });

  it("imports into the caller's account only: the same start time is another activity for another user", async () => {
    const [first, second] = await Promise.all([createTestUser(), createTestUser()]);
    const startedAt = wholeSecondAgo(3 * HOUR_MS);
    await imported(first, [aRun(startedAt)]);
    const [outcome] = await imported(second, [aRun(startedAt)]);
    expect(outcome.outcome).toBe('imported');
    expect(await sessionsOf(second.id)).toHaveLength(1);
  });
});

describe('seen Garmin activities', () => {
  it('lets the web app read its own seen activities in a time range, and nobody else', async () => {
    const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    const starts = [9, 6, 3].map((hours) => wholeSecondAgo(hours * HOUR_MS));
    const outcomes = await imported(
      owner,
      starts.map((startedAt) => aRun(startedAt)),
    );
    const removed = await postFunction('delete-session', owner.accessToken, { sessionId: outcomes[1].sessionId });
    expect(removed.status).toBe(200);

    expect(await querySeenGarminActivities(owner.client, starts[1], starts[2])).toEqual([
      { startedAt: starts[1], outcome: 'deleted' },
      { startedAt: starts[2], outcome: 'imported' },
    ]);
    expect(await querySeenGarminActivities(owner.client, starts[0], starts[0])).toEqual([
      { startedAt: starts[0], outcome: 'imported' },
    ]);
    expect(await querySeenGarminActivities(stranger.client, starts[0], starts[2])).toEqual([]);
  });

  it('refuses a client that writes a seen activity directly', async () => {
    const user = await createTestUser();
    const startedAt = wholeSecondAgo(3 * HOUR_MS);
    await imported(user, [aRun(startedAt)]);
    const inserted = await user.client
      .from('garmin_activities')
      .insert({ user_id: user.id, started_at: wholeSecondAgo(HOUR_MS), outcome: 'deleted' });
    const updated = await user.client.from('garmin_activities').update({ outcome: 'deleted' }).eq('user_id', user.id);
    const deleted = await user.client.from('garmin_activities').delete().eq('user_id', user.id);
    expect([inserted.error?.code, updated.error?.code, deleted.error?.code]).toEqual(['42501', '42501', '42501']);
    expect((await seenBy(user.id)).map((seen) => seen.outcome)).toEqual(['imported']);
  });
});
