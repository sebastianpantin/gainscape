import { randomUUID } from 'node:crypto';
import { type TransactionSql } from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  combatLevel,
  DEFAULT_BALANCE,
  DEFAULT_LOOT,
  levelForXp,
  processSession,
  roundTo,
  type SetInput,
} from '@domain/index.ts';
import {
  activeDropSummaries,
  builtInExerciseId,
  createHoldExercise,
  createTestUser,
  db,
  domainCatalogFor,
  type FunctionResponse,
  normalizedSnapshot,
  postCompleteSession,
  rebuildCaches,
  resignedWithAnotherKey,
  setBodyweight,
  type TestUser,
  rowCounts,
} from './local-stack.ts';
import { aBout, anIntervalBout, asCardioSetInput, type BoutShape } from './session-support.ts';

type EffortLevel = 'hard' | 'near_failure';

function threeSets(exerciseId: string, firstPosition: number, weightKg: number, level: EffortLevel | null) {
  return [0, 1, 2].map((offset) => ({
    id: randomUUID(),
    exerciseId,
    position: firstPosition + offset,
    weightKg,
    reps: 8,
    isWarmup: false,
    effort: level === null ? null : { type: 'level' as const, level },
  }));
}

type LiftSetBody = ReturnType<typeof threeSets>[number];

function sessionPayload<SetShape>(sets: SetShape[], hoursAgo = 1) {
  const endedAt = new Date(Date.now() - (hoursAgo - 1) * 60 * 60 * 1000);
  const startedAt = new Date(endedAt.getTime() - 60 * 60 * 1000);
  return { id: randomUUID(), startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(), notes: null, sets };
}

async function expectedFreshUserSummary(
  payload: ReturnType<typeof sessionPayload<ReturnType<typeof threeSets>[number]>>,
) {
  const catalog = await domainCatalogFor([...new Set(payload.sets.map((set) => set.exerciseId))]);
  const session = { id: payload.id, startedAt: payload.startedAt, sets: payload.sets as never };
  return processSession({ skillXp: {}, bodyweightKg: null }, session, DEFAULT_BALANCE, { catalog }).outputs;
}

const countedTables = ['sessions', 'sets', 'set_skill_xp', 'user_skills'] as const;

async function derivedCachesFor(userId: string) {
  return {
    userSkills: await db`select skill_id, xp from public.user_skills where user_id = ${userId} order by skill_id`,
    exerciseMaxes: await db`select * from public.exercise_maxes where user_id = ${userId} order by exercise_id`,
    repMaxes: await db`select * from public.rep_maxes where user_id = ${userId} order by exercise_id, reps`,
  };
}

let benchId: string;
let squatId: string;
let lifter: TestUser;
let fixture: ReturnType<typeof sessionPayload<ReturnType<typeof threeSets>[number]>>;
let firstResponse: Awaited<ReturnType<typeof postCompleteSession>>;

beforeAll(async () => {
  benchId = await builtInExerciseId('barbell_bench_press');
  squatId = await builtInExerciseId('back_squat');
  lifter = await createTestUser();
  fixture = sessionPayload([...threeSets(benchId, 0, 60, 'hard'), ...threeSets(squatId, 3, 100, 'near_failure')]);
  firstResponse = await postCompleteSession(lifter.accessToken, fixture);
});

afterAll(async () => {
  await db.end();
});

describe('complete-session with the fixture workout', () => {
  it('awards the XP the domain engine computes for these sets', async () => {
    expect(firstResponse.status).toBe(200);
    const expected = await expectedFreshUserSummary(fixture);
    expect(firstResponse.body.xpBySkill).toEqual(expected.xpBySkill);
    expect(firstResponse.body.levelUps).toEqual(expected.levelUps);
  });

  it('reports the session id and its active drops', async () => {
    expect(firstResponse.body.sessionId).toBe(fixture.id);
    expect(firstResponse.body.drops).toEqual(await activeDropSummaries(fixture.id));
  });

  it('stores derived strength columns on the sets', async () => {
    const rows =
      await db`select e1rm_before_kg::float, e1rm_candidate_kg::float, rir_source from public.sets where session_id = ${fixture.id} order by position`;
    expect(rows[0]).toEqual({ e1rm_before_kg: null, e1rm_candidate_kg: 80, rir_source: 'logged' });
    expect(rows[1].e1rm_before_kg).toBe(80);
    expect(rows[3].e1rm_candidate_kg).toBe(126.67);
  });

  it('caches the current e1RM per exercise', async () => {
    const [row] =
      await db`select e1rm_kg::float from public.exercise_maxes where user_id = ${lifter.id} and exercise_id = ${squatId}`;
    expect(row.e1rm_kg).toBe(126.67);
  });

  it('keeps user_skills equal to the per-set XP ledger', async () => {
    const mismatches = await db`
      select us.skill_id
      from public.user_skills us
      left join (
        select skill_id, sum(xp)::bigint as ledger_xp
        from public.set_skill_xp where user_id = ${lifter.id} group by skill_id
      ) ledger using (skill_id)
      where us.user_id = ${lifter.id} and us.xp <> coalesce(ledger.ledger_xp, 0)`;
    expect(mismatches).toEqual([]);
  });

  it('stores skill XP that yields the combat level of the XP it reported', async () => {
    const rows = await db`
      select s.key, s.combat_weight, coalesce(us.xp, 0)::int as xp
      from public.skills s
      left join public.user_skills us on us.skill_id = s.id and us.user_id = ${lifter.id}`;
    const reported = firstResponse.body.xpBySkill as Record<string, number>;
    for (const row of rows) expect(row.xp).toBe(reported[row.key] ?? 0);
    const levels = rows.map((row) => ({ weight: Number(row.combat_weight), level: levelForXp(row.xp) }));
    expect(combatLevel(levels)).toBeGreaterThanOrEqual(3);
  });

  it('stores the session receipt, local date, timezone and balance version', async () => {
    const [session] =
      await db`select summary, completed_at, local_date::text, timezone, balance_version from public.sessions where id = ${fixture.id}`;
    expect(firstResponse.body).toEqual({
      ...session.summary,
      programLinked: false,
      completedAt: new Date(session.completed_at).toISOString(),
      startedAt: fixture.startedAt,
      endedAt: fixture.endedAt,
      sessionRpe: null,
    });
    expect(session.timezone).toBe('Europe/Stockholm');
    expect(session.balance_version).toBe(DEFAULT_BALANCE.version);
    expect(session.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is idempotent when Finish is sent again', async () => {
    const before = await rowCounts(lifter.id, countedTables);
    const retry = await postCompleteSession(lifter.accessToken, fixture);
    expect(retry.status).toBe(200);
    expect(retry.rawBody).toBe(firstResponse.rawBody);
    expect(await rowCounts(lifter.id, countedTables)).toEqual(before);
  });

  it('returns the stored summary for a late retry instead of rejecting it as too old', async () => {
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const lateRetry = {
      ...fixture,
      startedAt: eightDaysAgo.toISOString(),
      endedAt: new Date(eightDaysAgo.getTime() + 3_600_000).toISOString(),
    };
    const retry = await postCompleteSession(lifter.accessToken, lateRetry);
    expect(retry.status).toBe(200);
    expect(retry.rawBody).toBe(firstResponse.rawBody);
  });
});

describe('complete-session resubmission with changed content', () => {
  async function storedContent(sessionId: string) {
    const [session] = await db`select notes, session_rpe, summary from public.sessions where id = ${sessionId}`;
    const sets = await db`
      select id, weight_kg::float, reps from public.sets where session_id = ${sessionId} order by position`;
    return { session, sets };
  }

  it.each([
    ['a changed weight', (sets: LiftSetBody[]) => ({ sets: [{ ...sets[0], weightKg: 72.5 }, ...sets.slice(1)] })],
    ['an added set', (sets: LiftSetBody[]) => ({ sets: [...sets, { ...sets[2], id: randomUUID(), position: 3 }] })],
    ['a removed set', (sets: LiftSetBody[]) => ({ sets: sets.slice(0, 2) })],
    ['changed notes', () => ({ notes: 'second thoughts' })],
    ['a changed session RPE', () => ({ sessionRpe: 9 })],
  ])('keeps the stored session and flags the answer for %s', async (_label, change) => {
    const user = await createTestUser();
    const payload = { ...sessionPayload(threeSets(benchId, 0, 70, 'hard')), sessionRpe: 7 };
    const first = await postCompleteSession(user.accessToken, payload);
    expect(first.status, first.rawBody).toBe(200);
    const before = await storedContent(payload.id);

    const resubmitted = await postCompleteSession(user.accessToken, { ...payload, ...change(payload.sets) });
    expect(resubmitted.status, resubmitted.rawBody).toBe(200);
    expect(resubmitted.body).toEqual({ ...first.body, storedContentDiffers: true });
    expect(await storedContent(payload.id)).toEqual(before);
  });

  it('does not flag an identical resubmission of a history-only session with cardio and unrated sets', async () => {
    const user = await createTestUser();
    const runId = await builtInExerciseId('running');
    const payload = sessionPayload<LiftSetBody | BoutShape>(
      [...threeSets(benchId, 0, 62.5, null), aBout(runId, 3, { distanceM: 5000 })],
      8 * 24,
    );
    const first = await postCompleteSession(user.accessToken, payload);
    expect(first.status, first.rawBody).toBe(200);
    const resubmitted = await postCompleteSession(user.accessToken, payload);
    expect(resubmitted.rawBody).toBe(first.rawBody);
  });

  it('does not flag a resubmission that differs only in its finish time', async () => {
    const user = await createTestUser();
    const payload = sessionPayload(threeSets(benchId, 0, 70, 'hard'));
    const first = await postCompleteSession(user.accessToken, payload);
    const later = new Date(Date.parse(payload.endedAt) + 5 * 60 * 1000).toISOString();
    const resubmitted = await postCompleteSession(user.accessToken, { ...payload, endedAt: later });
    expect(resubmitted.rawBody).toBe(first.rawBody);
  });
});

describe('complete-session timing and session RPE', () => {
  async function storedTiming(sessionId: string) {
    const [row] = await db`select started_at, ended_at, session_rpe from public.sessions where id = ${sessionId}`;
    return {
      startedAt: new Date(row.started_at).toISOString(),
      endedAt: new Date(row.ended_at).toISOString(),
      sessionRpe: row.session_rpe,
    };
  }

  it('stores the start, finish and session RPE and reports them back', async () => {
    const user = await createTestUser();
    const payload = { ...sessionPayload(threeSets(benchId, 0, 50, 'hard')), sessionRpe: 8 };
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    const expected = { startedAt: payload.startedAt, endedAt: payload.endedAt, sessionRpe: 8 };
    expect(await storedTiming(payload.id)).toEqual(expected);
    expect(response.body).toMatchObject(expected);
  });

  it('stores no session RPE when a draft from an older build leaves it out', async () => {
    const user = await createTestUser();
    const payload = sessionPayload(threeSets(benchId, 0, 50, 'hard'));
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    expect((await storedTiming(payload.id)).sessionRpe).toBeNull();
  });

  it('reports the stored timing and RPE when Finish is sent again with other values', async () => {
    const user = await createTestUser();
    const payload = { ...sessionPayload(threeSets(benchId, 0, 50, 'hard')), sessionRpe: 6 };
    await postCompleteSession(user.accessToken, payload);
    const retry = await postCompleteSession(user.accessToken, {
      ...payload,
      endedAt: new Date().toISOString(),
      sessionRpe: 9,
    });
    expect(retry.status).toBe(200);
    expect(retry.body).toMatchObject({ startedAt: payload.startedAt, endedAt: payload.endedAt, sessionRpe: 6 });
  });

  it('keeps the session RPE on a session saved to history only', async () => {
    const user = await createTestUser();
    const payload = { ...sessionPayload(threeSets(benchId, 0, 50, 'hard'), 8 * 24), sessionRpe: 3 };
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.historyOnly).toBe(true);
    expect((await storedTiming(payload.id)).sessionRpe).toBe(3);
  });

  it.each([0, 11, 7.5, '7'])('returns 422 for a session RPE of %j and writes nothing', async (sessionRpe) => {
    const user = await createTestUser();
    const response = await postCompleteSession(user.accessToken, {
      ...sessionPayload(threeSets(benchId, 0, 50, 'hard')),
      sessionRpe,
    });
    expect(response.status, response.rawBody).toBe(422);
    expect((await rowCounts(user.id, countedTables)).sessions).toBe(0);
  });
});

describe('complete-session rejections', () => {
  it('returns 409 for a session id owned by someone else', async () => {
    const intruder = await createTestUser();
    const response = await postCompleteSession(intruder.accessToken, fixture);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: 'session_id_conflict' });
  });

  it('returns 409 for a set id that already exists', async () => {
    const intruder = await createTestUser();
    const reusedSet = { ...fixture.sets[0] };
    const response = await postCompleteSession(intruder.accessToken, sessionPayload([reusedSet]));
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('set_id_conflict');
  });

  it('returns 422 for an unknown exercise', async () => {
    const user = await createTestUser();
    const response = await postCompleteSession(
      user.accessToken,
      sessionPayload(threeSets(randomUUID(), 0, 50, 'hard')),
    );
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('unknown_exercise');
  });

  it('accepts a custom exercise owned by the caller but pays no cold-start XP', async () => {
    const user = await createTestUser();
    const customExerciseId = randomUUID();
    await db.begin(async (tx) => {
      await tx`insert into public.exercises (id, name, load_type, equipment, owner_user_id)
               values (${customExerciseId}, 'My Press', 'external', 'machine', ${user.id})`;
      await tx`insert into public.exercise_skills (exercise_id, skill_id, share_bp)
               select ${customExerciseId}, id, 10000 from public.skills where key = 'chest'`;
    });
    const response = await postCompleteSession(
      user.accessToken,
      sessionPayload(threeSets(customExerciseId, 0, 50, null)),
    );
    expect(response.status).toBe(200);
    expect(response.body.xpBySkill).toEqual({});
  });

  it("accepts the caller's archived custom exercise", async () => {
    const user = await createTestUser();
    const customExerciseId = randomUUID();
    await db.begin(async (tx) => {
      await tx`insert into public.exercises (id, name, load_type, equipment, owner_user_id, archived_at)
               values (${customExerciseId}, 'Old Press', 'external', 'machine', ${user.id}, now())`;
      await tx`insert into public.exercise_skills (exercise_id, skill_id, share_bp)
               select ${customExerciseId}, id, 10000 from public.skills where key = 'chest'`;
    });
    const response = await postCompleteSession(
      user.accessToken,
      sessionPayload(threeSets(customExerciseId, 0, 50, 'hard')),
    );
    expect(response.status).toBe(200);
  });

  it("returns 422 for someone else's custom exercise", async () => {
    const [owner, other] = await Promise.all([createTestUser(), createTestUser()]);
    const customExerciseId = randomUUID();
    await db.begin(async (tx) => {
      await tx`insert into public.exercises (id, name, load_type, equipment, owner_user_id)
               values (${customExerciseId}, 'Private Press', 'external', 'machine', ${owner.id})`;
      await tx`insert into public.exercise_skills (exercise_id, skill_id, share_bp)
               select ${customExerciseId}, id, 10000 from public.skills where key = 'chest'`;
    });
    const response = await postCompleteSession(
      other.accessToken,
      sessionPayload(threeSets(customExerciseId, 0, 50, 'hard')),
    );
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('unknown_exercise');
  });

  it('accepts a former scroll variation the first time', async () => {
    const user = await createTestUser();
    const pauseSquatId = await builtInExerciseId('pause_squat');
    const response = await postCompleteSession(
      user.accessToken,
      sessionPayload(threeSets(pauseSquatId, 0, 80, 'hard')),
    );
    expect(response.status).toBe(200);
  });

  it('returns 422 for more than 200 sets', async () => {
    const user = await createTestUser();
    const sets = Array.from({ length: 201 }, (_, position) => ({
      ...threeSets(benchId, position, 50, 'hard')[0],
      position,
    }));
    const response = await postCompleteSession(user.accessToken, sessionPayload(sets));
    expect(response.status).toBe(422);
  });

  it.each([
    ['duplicate_set_id', (sets: LiftSetBody[]) => [sets[0], { ...sets[1], id: sets[0].id }]],
    ['duplicate_set_position', (sets: LiftSetBody[]) => [sets[0], { ...sets[1], position: sets[0].position }]],
  ])('returns 422 %s and writes nothing', async (code, duplicate) => {
    const user = await createTestUser();
    const response = await postCompleteSession(
      user.accessToken,
      sessionPayload(duplicate(threeSets(benchId, 0, 50, 'hard'))),
    );
    expect(response.status, response.rawBody).toBe(422);
    expect(response.body.error).toBe(code);
    expect((await rowCounts(user.id, countedTables)).sessions).toBe(0);
  });

  it.each([
    ['ends_before_start', -60, -61],
    ['session_too_long', -(12 * 60 + 2), -1],
    ['session_in_future', 6, 7],
  ])('returns 422 %s for implausible timing', async (code, startMinutesFromNow, endMinutesFromNow) => {
    const user = await createTestUser();
    const minutesFromNow = (minutes: number) => new Date(Date.now() + minutes * 60 * 1000).toISOString();
    const response = await postCompleteSession(user.accessToken, {
      ...sessionPayload(threeSets(benchId, 0, 50, 'hard')),
      startedAt: minutesFromNow(startMinutesFromNow),
      endedAt: minutesFromNow(endMinutesFromNow),
    });
    expect(response.status, response.rawBody).toBe(422);
    expect(response.body.error).toBe(code);
    expect((await rowCounts(user.id, countedTables)).sessions).toBe(0);
  });

  it.each([
    ['0000-01-01T00:00:00Z', '0000-01-01T00:30:00Z'],
    ['0001-01-01T00:00:00+01:00', '0001-01-01T00:30:00+01:00'],
  ])('returns 422 session_too_old for a start at %s', async (startedAt, endedAt) => {
    const user = await createTestUser();
    const response = await postCompleteSession(user.accessToken, {
      ...sessionPayload(threeSets(benchId, 0, 50, 'hard')),
      startedAt,
      endedAt,
    });
    expect(response.status, response.rawBody).toBe(422);
    expect(response.body.error).toBe('session_too_old');
    expect((await rowCounts(user.id, countedTables)).sessions).toBe(0);
  });

  it('stores notes without NUL characters', async () => {
    const user = await createTestUser();
    const payload = { ...sessionPayload(threeSets(benchId, 0, 50, 'hard')), notes: 'felt\u0000 strong\u0000' };
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    const [stored] = await db`select notes from public.sessions where id = ${payload.id}`;
    expect(stored.notes).toBe('felt strong');
  });

  it('returns 401 without a user token', async () => {
    const response = await postCompleteSession('not-a-token', sessionPayload(threeSets(benchId, 0, 50, 'hard')));
    expect(response.status).toBe(401);
  });

  it('returns 401 invalid token for a token signed with another secret', async () => {
    const user = await createTestUser();
    const payload = sessionPayload(threeSets(benchId, 0, 50, 'hard'));
    const response = await postCompleteSession(resignedWithAnotherKey(user.accessToken), payload);
    expect(response.status).toBe(401);
    expect(response.rawBody).toMatch(/invalid/i);
    expect(await rowCounts(user.id, countedTables)).toMatchObject({ sessions: 0, sets: 0 });
  });
});

describe('complete-session edge cases', () => {
  it('computes the local date for a timezone that only Postgres understands by falling back to UTC', async () => {
    const user = await createTestUser('posix/Europe/Stockholm');
    const [privateProfile] = await db`select timezone from public.profile_private where user_id = ${user.id}`;
    expect(privateProfile.timezone).toBe('UTC');
    const response = await postCompleteSession(user.accessToken, sessionPayload(threeSets(benchId, 0, 60, 'hard')));
    expect(response.status).toBe(200);
  });

  it('answers a cross-user race on the same session id with one success and one conflict', async () => {
    const [first, second] = await Promise.all([createTestUser(), createTestUser()]);
    const contested = sessionPayload(threeSets(benchId, 0, 60, 'hard'));
    const secondAttempt = { ...contested, sets: threeSets(benchId, 0, 60, 'hard') };
    const statuses = (
      await Promise.all([
        postCompleteSession(first.accessToken, contested),
        postCompleteSession(second.accessToken, secondAttempt),
      ])
    )
      .map((response) => response.status)
      .sort();
    expect(statuses).toEqual([200, 409]);
  });

  it('stores a session that started more than 7 days ago as history only', async () => {
    const user = await createTestUser();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const payload = {
      ...sessionPayload([...threeSets(benchId, 0, 100, 'hard'), ...threeSets(benchId, 3, 100, null)]),
      startedAt: eightDaysAgo.toISOString(),
      endedAt: new Date(eightDaysAgo.getTime() + 3_600_000).toISOString(),
    };
    const derivedBefore = await derivedCachesFor(user.id);

    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      sessionId: payload.id,
      xpBySkill: {},
      levelUps: [],
      prs: [],
      drops: [],
      historyOnly: true,
      programLinked: false,
      completedAt: expect.any(String),
      startedAt: payload.startedAt,
      endedAt: payload.endedAt,
      sessionRpe: null,
    });
    const [session] = await db`select history_only from public.sessions where id = ${payload.id}`;
    expect(session.history_only).toBe(true);
    const sets = await db`
      select rir::float, rir_source, xp_awarded, e1rm_candidate_kg from public.sets
      where session_id = ${payload.id} order by position`;
    expect(sets.map((row) => [row.rir, row.rir_source])).toEqual([
      [3, 'logged'],
      [3, 'logged'],
      [3, 'logged'],
      [null, 'cold_start'],
      [null, 'cold_start'],
      [null, 'cold_start'],
    ]);
    for (const row of sets) expect(row).toMatchObject({ xp_awarded: 0, e1rm_candidate_kg: null });
    expect((await rowCounts(user.id, countedTables)).set_skill_xp).toBe(0);
    expect(await derivedCachesFor(user.id)).toEqual(derivedBefore);

    const retry = await postCompleteSession(user.accessToken, payload);
    expect(retry.status).toBe(200);
    expect(retry.rawBody).toBe(response.rawBody);

    const following = sessionPayload(threeSets(benchId, 0, 60, null));
    expect((await postCompleteSession(user.accessToken, following)).status).toBe(200);
    const followingSets = await db`select rir_source, xp_awarded from public.sets where session_id = ${following.id}`;
    for (const row of followingSets) {
      expect(row).toEqual({ rir_source: 'cold_start', xp_awarded: DEFAULT_BALANCE.coldStartXpPerSet });
    }
  });

  it('a history-only session still requires bodyweight for a bodyweight exercise', async () => {
    const user = await createTestUser();
    const pullUpId = await builtInExerciseId('pull_up');
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const payload = {
      ...sessionPayload(threeSets(pullUpId, 0, 0, 'hard')),
      startedAt: eightDaysAgo.toISOString(),
      endedAt: new Date(eightDaysAgo.getTime() + 3_600_000).toISOString(),
    };
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status).toBe(409);
    expect(response.body.error).toBe('bodyweight_required');
    expect(await rowCounts(user.id, countedTables)).toMatchObject({ sessions: 0, sets: 0 });
  });

  it('stores weightKg rounded to 2 dp', async () => {
    const user = await createTestUser();
    const payload = sessionPayload([
      { ...threeSets(benchId, 0, 62.505, 'hard')[0] },
      { ...threeSets(benchId, 1, 64.085, 'hard')[0] },
    ]);
    expect((await postCompleteSession(user.accessToken, payload)).status).toBe(200);
    const rows = await db`
      select weight_kg::float, effective_load_kg::float from public.sets
      where session_id = ${payload.id} order by position`;
    expect(rows).toEqual([
      { weight_kg: roundTo(2, 62.505), effective_load_kg: roundTo(2, 62.505) },
      { weight_kg: 64.08, effective_load_kg: 64.08 },
    ]);
  });
});

describe('complete-session with unrated sets', () => {
  it('stores the first session of an exercise as cold start', async () => {
    const user = await createTestUser();
    const payload = sessionPayload(threeSets(benchId, 0, 60, null));
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status).toBe(200);
    const rows =
      await db`select effort_input_type, effort_value, rir, rir_source, xp_awarded from public.sets where session_id = ${payload.id}`;
    expect(rows).toHaveLength(3);
    for (const row of rows) {
      expect(row).toEqual({
        effort_input_type: null,
        effort_value: null,
        rir: null,
        rir_source: 'cold_start',
        xp_awarded: DEFAULT_BALANCE.coldStartXpPerSet,
      });
    }
  });

  it('estimates RIR for an unrated set after a logged session', async () => {
    const user = await createTestUser();
    const logged = sessionPayload(
      [0, 1, 2].map((position) => ({ ...threeSets(benchId, 0, 80, 'hard')[0], position, reps: 5 })),
      3,
    );
    expect((await postCompleteSession(user.accessToken, logged)).status).toBe(200);
    const unrated = sessionPayload([{ ...threeSets(benchId, 0, 80, null)[0], reps: 5 }], 1);
    expect((await postCompleteSession(user.accessToken, unrated)).status).toBe(200);
    const [row] =
      await db`select rir::float, rir_source, e1rm_before_kg::float from public.sets where session_id = ${unrated.id}`;
    expect(row).toEqual({ rir: 3, rir_source: 'estimated', e1rm_before_kg: 98.67 });
  });
});

describe('complete-session review regressions', () => {
  it('accepts a half-step RPE on a pure bodyweight exercise', async () => {
    const user = await createTestUser();
    await setBodyweight(user, 80);
    const pullUpId = await builtInExerciseId('pull_up');
    const set = { ...threeSets(pullUpId, 0, 0, 'hard')[0], reps: 10, effort: { type: 'rpe', value: 8.5 } };
    const response = await postCompleteSession(user.accessToken, sessionPayload([set]));
    expect(response.status).toBe(200);
  });
});

describe('complete-session with bodyweight exercises', () => {
  let pullUpId: string;
  let weightedPullUpId: string;

  beforeAll(async () => {
    pullUpId = await builtInExerciseId('pull_up');
    weightedPullUpId = await builtInExerciseId('weighted_pull_up');
  });

  it('asks for bodyweight before accepting the session, then uses it as the load', async () => {
    const user = await createTestUser();
    const payload = sessionPayload([
      { ...threeSets(pullUpId, 0, 0, 'hard')[0] },
      { ...threeSets(weightedPullUpId, 1, 10, 'hard')[0] },
    ]);
    const refused = await postCompleteSession(user.accessToken, payload);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('bodyweight_required');
    expect((await rowCounts(user.id, countedTables)).sessions).toBe(0);

    await setBodyweight(user, 82.5);
    const accepted = await postCompleteSession(user.accessToken, payload);
    expect(accepted.status).toBe(200);
    const rows =
      await db`select effective_load_kg::float from public.sets where session_id = ${payload.id} order by position`;
    expect(rows.map((row) => row.effective_load_kg)).toEqual([82.5, 92.5]);
  });

  it('rejects added load on a pure bodyweight exercise', async () => {
    const user = await createTestUser();
    await setBodyweight(user, 80);
    const response = await postCompleteSession(user.accessToken, sessionPayload(threeSets(pullUpId, 0, 5, 'hard')));
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('bodyweight_load_not_zero');
  });
});

describe('complete-session with cardio bouts', () => {
  let runningId: string;
  let sprintsId: string;

  beforeAll(async () => {
    runningId = await builtInExerciseId('running');
    sprintsId = await builtInExerciseId('sprint_intervals');
  });

  function steadyBout(exerciseId: string, position: number, overrides: Partial<BoutShape> = {}): BoutShape {
    return aBout(exerciseId, position, { distanceM: 5000, ...overrides });
  }

  function intervalBout(exerciseId: string, position: number, overrides: Partial<BoutShape> = {}): BoutShape {
    return anIntervalBout(exerciseId, position, { workS: 30, restS: 30, rounds: 10 }, overrides);
  }

  async function expectedOutputs(payload: { id: string; startedAt: string; sets: (LiftSetBody | BoutShape)[] }) {
    const catalog = await domainCatalogFor([...new Set(payload.sets.map((set) => set.exerciseId))]);
    const sets = payload.sets.map((set): SetInput => ('kind' in set ? asCardioSetInput(set) : set));
    const session = { id: payload.id, startedAt: payload.startedAt, sets };
    return processSession({ skillXp: {}, bodyweightKg: null }, session, DEFAULT_BALANCE, { catalog }).outputs;
  }

  it('stores a lift without kind next to steady and interval bouts and pays both skill groups', async () => {
    const user = await createTestUser();
    const payload = sessionPayload([
      threeSets(benchId, 0, 60, 'hard')[0],
      steadyBout(runningId, 1),
      intervalBout(sprintsId, 2),
    ]);
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    const expected = await expectedOutputs(payload);
    expect(response.body.xpBySkill).toEqual(expected.xpBySkill);
    expect(Object.keys(response.body.xpBySkill!)).toEqual(expect.arrayContaining(['chest', 'endurance', 'agility']));
    expect(response.body.xpBySkill!.endurance).toBe(Math.round(30 * DEFAULT_BALANCE.cardioXpPerWorkMinute.endurance));

    const ledger = await db`
      select s.key, sum(x.xp)::int as xp from public.set_skill_xp x join public.skills s on s.id = x.skill_id
      where x.user_id = ${user.id} group by s.key`;
    expect(Object.fromEntries(ledger.map((row) => [row.key, row.xp]))).toEqual(expected.xpBySkill);

    const rows = await db`
      select position, weight_kg, reps, effective_load_kg, duration_s, distance_m::float, interval_work_s,
             interval_rest_s, interval_rounds, counted_work_s, pace_flagged, effort_input_type, effort_value::float,
             rir, effective_reps, is_warmup
      from public.sets where session_id = ${payload.id} order by position`;
    expect(rows[0]).toMatchObject({ weight_kg: '60.00', reps: 8, duration_s: null, counted_work_s: null });
    expect(rows[1]).toMatchObject({
      weight_kg: null,
      reps: null,
      effective_load_kg: null,
      duration_s: 1800,
      distance_m: 5000,
      interval_rounds: null,
      counted_work_s: 1800,
      pace_flagged: false,
      effort_input_type: 'cardio',
      effort_value: 2,
      rir: null,
      effective_reps: 0,
      is_warmup: false,
    });
    expect(rows[2]).toMatchObject({
      duration_s: 570,
      distance_m: null,
      interval_work_s: 30,
      interval_rest_s: 30,
      interval_rounds: 10,
      counted_work_s: 300,
      effort_input_type: 'cardio',
      effort_value: 3,
    });
  });

  it('flags an implausible pace and still pays duration XP', async () => {
    const user = await createTestUser();
    const payload = sessionPayload([steadyBout(runningId, 0, { distanceM: 20000, durationS: 1800 })]);
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.xpBySkill).toEqual((await expectedOutputs(payload)).xpBySkill);
    const [row] = await db`select pace_flagged from public.sets where session_id = ${payload.id}`;
    expect(row.pace_flagged).toBe(true);
  });

  it('stores a cardio bout without effort as the default moderate effort', async () => {
    const user = await createTestUser();
    const payload = sessionPayload([steadyBout(runningId, 0, { effort: null, distanceM: null })]);
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    const [row] = await db`select effort_input_type, rir_source from public.sets where session_id = ${payload.id}`;
    expect(row).toEqual({ effort_input_type: null, rir_source: 'default' });
    expect(response.body.xpBySkill).toEqual({
      endurance: Math.round(30 * DEFAULT_BALANCE.cardioXpPerWorkMinute.endurance),
    });
  });

  it('pays Mobility for a yoga bout and refuses a distance on it with 422 distance_not_tracked', async () => {
    const user = await createTestUser();
    const yogaId = await builtInExerciseId('yoga');
    const refused = await postCompleteSession(
      user.accessToken,
      sessionPayload([steadyBout(yogaId, 0, { distanceM: 1000, durationS: 1200 })]),
    );
    expect(refused.status, refused.rawBody).toBe(422);
    expect(refused.body.error).toBe('distance_not_tracked');
    expect((await rowCounts(user.id, countedTables)).sessions).toBe(0);
    const payload = sessionPayload([steadyBout(yogaId, 0, { distanceM: null, durationS: 1200 })]);
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.xpBySkill).toEqual((await expectedOutputs(payload)).xpBySkill);
    expect(Object.keys(response.body.xpBySkill ?? {})).toEqual(['mobility']);
  });

  it('returns 422 kind_mismatch for a cardio bout on a lift exercise and writes nothing', async () => {
    const user = await createTestUser();
    const response = await postCompleteSession(user.accessToken, sessionPayload([steadyBout(benchId, 0)]));
    expect(response.status, response.rawBody).toBe(422);
    expect(response.body.error).toBe('kind_mismatch');
    expect((await rowCounts(user.id, countedTables)).sessions).toBe(0);
  });

  it('returns 422 kind_mismatch for a lift set on a cardio exercise', async () => {
    const user = await createTestUser();
    const response = await postCompleteSession(user.accessToken, sessionPayload(threeSets(runningId, 0, 0, 'hard')));
    expect(response.status, response.rawBody).toBe(422);
    expect(response.body.error).toBe('kind_mismatch');
  });

  it.each([
    [
      'a cardio effort on a lift set',
      () => ({ ...threeSets(benchId, 0, 60, 'hard')[0], effort: { type: 'cardio', level: 'hard' } }),
    ],
    [
      'a lift effort on a cardio bout',
      () => ({ ...steadyBout(runningId, 0), effort: { type: 'level', level: 'hard' } }),
    ],
    ['a duration on an interval bout', () => intervalBout(sprintsId, 0, { durationS: 570 })],
    ['a steady bout shorter than a minute', () => steadyBout(runningId, 0, { durationS: 59 })],
    [
      'an interval bout over 4 hours',
      () => intervalBout(sprintsId, 0, { interval: { workS: 3600, restS: 0, rounds: 5 } }),
    ],
    ['lift fields on a cardio bout', () => ({ ...steadyBout(runningId, 0), reps: 5 })],
  ])('returns 422 invalid_payload for %s', async (_case, makeSet) => {
    const user = await createTestUser();
    const response = await postCompleteSession(user.accessToken, sessionPayload([makeSet()]));
    expect(response.status, response.rawBody).toBe(422);
    expect(response.body.error).toBe('invalid_payload');
  });

  it('stores a cardio bout older than 7 days as history only', async () => {
    const user = await createTestUser();
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const payload = {
      ...sessionPayload([steadyBout(runningId, 0), intervalBout(sprintsId, 1)]),
      startedAt: eightDaysAgo.toISOString(),
      endedAt: new Date(eightDaysAgo.getTime() + 3_600_000).toISOString(),
    };
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.historyOnly).toBe(true);
    const rows = await db`
      select duration_s, counted_work_s, xp_awarded from public.sets where session_id = ${payload.id} order by position`;
    expect(rows).toEqual([
      { duration_s: 1800, counted_work_s: 1800, xp_awarded: 0 },
      { duration_s: 570, counted_work_s: 300, xp_awarded: 0 },
    ]);
  });
});

async function untilSomeoneWaitsOn(transactionId: string, settled: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 200 && !settled(); attempt += 1) {
    const waiting = await db`
      select 1 from pg_locks where locktype = 'transactionid' and transactionid::text = ${transactionId} and not granted`;
    if (waiting.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

async function syncAgainstUncommittedRow(
  writeRow: (tx: TransactionSql) => Promise<unknown>,
  sync: () => Promise<FunctionResponse>,
): Promise<FunctionResponse> {
  const { pending } = await db.begin(async (tx) => {
    await tx`set local session_replication_role = replica`;
    await writeRow(tx);
    const [{ transactionId }] = await tx`select txid_current()::text as "transactionId"`;
    let settled = false;
    const pending = sync().finally(() => (settled = true));
    await untilSomeoneWaitsOn(transactionId, () => settled);
    return { pending };
  });
  return await pending;
}

describe('complete-session unique violations from a concurrent writer', () => {
  it('answers 409 id_conflict when another writer takes the session id first', async () => {
    const [user, other] = await Promise.all([createTestUser(), createTestUser()]);
    const payload = sessionPayload(threeSets(benchId, 0, 50, 'hard'));
    const response = await syncAgainstUncommittedRow(
      (tx) => tx`
        insert into public.sessions
          (id, user_id, started_at, ended_at, local_date, timezone, balance_version, derived_balance_version, summary)
        values (${payload.id}, ${other.id}, ${payload.startedAt}, ${payload.endedAt}, current_date, 'UTC',
                ${DEFAULT_BALANCE.version}, ${DEFAULT_BALANCE.version}, '{}')`,
      () => postCompleteSession(user.accessToken, payload),
    );
    expect(response.status, response.rawBody).toBe(409);
    expect(response.body.error).toBe('id_conflict');
  });

  it('answers 500 for a unique violation that is not an id collision', async () => {
    const user = await createTestUser();
    const payload = sessionPayload(threeSets(benchId, 0, 50, 'hard'));
    const [regularTable] = await db`select id from public.drop_tables where key = 'regular'`;
    const response = await syncAgainstUncommittedRow(
      (tx) => tx`
        insert into public.loot_rolls
          (user_id, session_id, set_id, kind, local_date, roll_index, drop_table_id, chance, hit, loot_version)
        values (${user.id}, ${payload.id}, ${payload.sets[0].id}, 'regular', '2000-01-01', 0, ${regularTable.id},
                0.1, false, ${DEFAULT_LOOT.version})`,
      () => postCompleteSession(user.accessToken, payload),
    );
    expect(response.status, response.rawBody).toBe(500);
    expect(response.body.error).toBe('internal_error');
  });
});

describe('complete-session with hold sets', () => {
  async function holdExercisesOf(user: TestUser) {
    return {
      pinchId: await createHoldExercise(user.id, 'time', 'external', { grip: 10000 }),
      carryId: await createHoldExercise(user.id, 'distance', 'external', { grip: 6000, core: 4000 }),
      hangId: await createHoldExercise(user.id, 'time', 'bodyweight', { grip: 10000 }),
    };
  }

  function aHold(exerciseId: string, position: number, measured: { durationS: number } | { distanceM: number }) {
    return {
      kind: 'hold' as const,
      id: randomUUID(),
      exerciseId,
      position,
      weightKg: 24,
      ...measured,
      effort: { type: 'level' as const, level: 'failure' as const },
    };
  }

  it('stores a timed hold and a carry and pays Grip by rep equivalents', async () => {
    const user = await createTestUser();
    const { pinchId, carryId } = await holdExercisesOf(user);
    const payload = sessionPayload([aHold(pinchId, 0, { durationS: 45 }), aHold(carryId, 1, { distanceM: 20 })]);
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    const xpPerRep = DEFAULT_BALANCE.xpPerEffectiveRep;
    expect(response.body.xpBySkill).toEqual({
      core: Math.round(4 * xpPerRep * 0.4),
      grip: 6 * xpPerRep + Math.round(4 * xpPerRep * 0.6),
    });
    const rows = await db`
      select position, weight_kg::float, effective_load_kg::float, reps, duration_s, distance_m::float, counted_work_s,
             effort_input_type, effort_value::float, rir_source, effective_reps, xp_awarded
      from public.sets where session_id = ${payload.id} order by position`;
    expect(rows).toEqual([
      {
        position: 0,
        weight_kg: 24,
        effective_load_kg: 24,
        reps: null,
        duration_s: 45,
        distance_m: null,
        counted_work_s: null,
        effort_input_type: 'level',
        effort_value: 0,
        rir_source: 'logged',
        effective_reps: 6,
        xp_awarded: 6 * xpPerRep,
      },
      {
        position: 1,
        weight_kg: 24,
        effective_load_kg: 24,
        reps: null,
        duration_s: null,
        distance_m: 20,
        counted_work_s: null,
        effort_input_type: 'level',
        effort_value: 0,
        rir_source: 'logged',
        effective_reps: 4,
        xp_awarded: 4 * xpPerRep,
      },
    ]);
  });

  it('adds the bodyweight to a hang and rebuilds the same state from history', async () => {
    const user = await createTestUser();
    const { hangId } = await holdExercisesOf(user);
    await setBodyweight(user, 75);
    const payload = sessionPayload([{ ...aHold(hangId, 0, { durationS: 30 }), weightKg: 0, effort: null }]);
    const response = await postCompleteSession(user.accessToken, payload);
    expect(response.status, response.rawBody).toBe(200);
    const [row] =
      await db`select effective_load_kg::float, rir_source, effective_reps from public.sets where session_id = ${payload.id}`;
    expect(row).toEqual({ effective_load_kg: 75, rir_source: 'default', effective_reps: 3 });
    const before = await normalizedSnapshot(user.id);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await normalizedSnapshot(user.id)).toEqual(before);
  });

  it('refuses a hold on a rep exercise, a rep set on a hold exercise and a hold with both measures', async () => {
    const user = await createTestUser();
    const { pinchId } = await holdExercisesOf(user);
    const onBench = await postCompleteSession(user.accessToken, sessionPayload([aHold(benchId, 0, { durationS: 30 })]));
    expect([onBench.status, onBench.body.error]).toEqual([422, 'kind_mismatch']);
    const repsOnPinch = await postCompleteSession(
      user.accessToken,
      sessionPayload([threeSets(pinchId, 0, 20, 'hard')[0]]),
    );
    expect([repsOnPinch.status, repsOnPinch.body.error]).toEqual([422, 'kind_mismatch']);
    const both = await postCompleteSession(
      user.accessToken,
      sessionPayload([{ ...aHold(pinchId, 0, { durationS: 30 }), distanceM: 10 }]),
    );
    expect([both.status, both.body.error]).toEqual([422, 'invalid_payload']);
    const rir = await postCompleteSession(
      user.accessToken,
      sessionPayload([{ ...aHold(pinchId, 0, { durationS: 30 }), effort: { type: 'rir', value: 2 } }]),
    );
    expect([rir.status, rir.body.error]).toEqual([422, 'invalid_payload']);
    expect((await rowCounts(user.id, countedTables)).sessions).toBe(0);
  });
});
