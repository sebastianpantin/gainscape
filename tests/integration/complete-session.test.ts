import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { combatLevel, DEFAULT_BALANCE, levelForXp, processSession, roundTo } from '@domain/index.ts';
import {
  builtInExerciseId,
  createTestUser,
  db,
  domainCatalogFor,
  postCompleteSession,
  resignedWithAnotherKey,
  setBodyweight,
  type TestUser,
} from './local-stack.ts';

type EffortLevel = 'hard' | 'near_failure';

function threeSets(exerciseId: string, firstPosition: number, weightKg: number, level: EffortLevel | null) {
  return [0, 1, 2].map((offset) => ({
    id: randomUUID(),
    exerciseId,
    position: firstPosition + offset,
    weightKg,
    reps: 8,
    isWarmup: false,
    effort: level === null ? null : { type: 'level', level },
  }));
}

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

async function rowCountsFor(userId: string) {
  const [counts] = await db`
    select
      (select count(*) from public.sessions where user_id = ${userId})::int as sessions,
      (select count(*) from public.sets where user_id = ${userId})::int as sets,
      (select count(*) from public.set_skill_xp where user_id = ${userId})::int as set_skill_xp,
      (select count(*) from public.user_skills where user_id = ${userId})::int as user_skills`;
  return counts;
}

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

  it('reports the session id and no drops', () => {
    expect(firstResponse.body).toMatchObject({ sessionId: fixture.id, drops: [] });
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
      await db`select summary, local_date::text, timezone, balance_version from public.sessions where id = ${fixture.id}`;
    expect(session.summary).toEqual(firstResponse.body);
    expect(session.timezone).toBe('Europe/Stockholm');
    expect(session.balance_version).toBe(DEFAULT_BALANCE.version);
    expect(session.local_date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is idempotent when Finish is sent again', async () => {
    const before = await rowCountsFor(lifter.id);
    const retry = await postCompleteSession(lifter.accessToken, fixture);
    expect(retry.status).toBe(200);
    expect(retry.rawBody).toBe(firstResponse.rawBody);
    expect(await rowCountsFor(lifter.id)).toEqual(before);
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

  it('returns 422 for a locked scroll variation and writes nothing, then accepts it once unlocked', async () => {
    const user = await createTestUser();
    const pauseSquatId = await builtInExerciseId('pause_squat');
    const locked = await postCompleteSession(user.accessToken, sessionPayload(threeSets(pauseSquatId, 0, 80, 'hard')));
    expect(locked.status).toBe(422);
    expect(locked.body).toMatchObject({ error: 'unknown_exercise', details: { exerciseIds: [pauseSquatId] } });
    expect(await rowCountsFor(user.id)).toEqual({ sessions: 0, sets: 0, set_skill_xp: 0, user_skills: 0 });

    await db`
      insert into public.user_unlocks (user_id, exercise_id, item_id)
      select ${user.id}, ${pauseSquatId}, id from public.items where key = 'scroll_pause_squat'`;
    const unlocked = await postCompleteSession(
      user.accessToken,
      sessionPayload(threeSets(pauseSquatId, 0, 80, 'hard')),
    );
    expect(unlocked.status).toBe(200);
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
    expect(await rowCountsFor(user.id)).toMatchObject({ sessions: 0, sets: 0 });
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
    expect((await rowCountsFor(user.id)).set_skill_xp).toBe(0);
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
    expect(await rowCountsFor(user.id)).toMatchObject({ sessions: 0, sets: 0 });
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
    expect((await rowCountsFor(user.id)).sessions).toBe(0);

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
