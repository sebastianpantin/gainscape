import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { roundTo } from '@domain/index.ts';
import {
  ageSession,
  builtInExerciseId,
  createTestUser,
  db,
  env,
  normalizedSnapshot,
  postCompleteSession,
  postFunction,
  rebuildCaches,
  setBodyweight,
  type TestUser,
} from './local-stack.ts';

type Effort = { type: 'level'; level: 'hard' | 'near_failure' } | { type: 'rir'; value: number } | null;

interface SetBody {
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  effort: Effort;
}

interface SessionBody {
  id: string;
  startedAt: string;
  endedAt: string;
  notes: string | null;
  sets: SetBody[];
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const hard = { type: 'level', level: 'hard' } as const;
const nearFailure = { type: 'level', level: 'near_failure' } as const;

function aSet(exerciseId: string, weightKg: number, reps: number, effort: Effort, isWarmup = false) {
  return { exerciseId, weightKg, reps, effort, isWarmup };
}

function sessionAt(startedAt: string, sets: ReturnType<typeof aSet>[]): SessionBody {
  return {
    id: randomUUID(),
    startedAt,
    endedAt: new Date(Date.parse(startedAt) + HOUR_MS / 2).toISOString(),
    notes: null,
    sets: sets.map((set, position) => ({ id: randomUUID(), position, ...set })),
  };
}

function ago(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

function withFreshIds(session: SessionBody): SessionBody {
  return { ...session, id: randomUUID(), sets: session.sets.map((set) => ({ ...set, id: randomUUID() })) };
}

async function sync(user: TestUser, session: SessionBody) {
  const response = await postCompleteSession(user.accessToken, session);
  expect(response.status, response.rawBody).toBe(200);
  return response;
}

function editBody(session: SessionBody, sets: SetBody[], ifRevision = 0, notes: string | null = session.notes) {
  return { sessionId: session.id, ifRevision, notes, sets };
}

async function edit(user: TestUser, body: unknown) {
  return await postFunction('edit-session', user.accessToken, body);
}

async function rowCountsFor(userId: string) {
  const [counts] = await db`
    select
      (select count(*) from public.sessions where user_id = ${userId})::int as sessions,
      (select count(*) from public.sets where user_id = ${userId})::int as sets,
      (select count(*) from public.set_skill_xp where user_id = ${userId})::int as set_skill_xp,
      (select coalesce(sum(revision), 0) from public.sessions where user_id = ${userId})::int as revisions`;
  return counts;
}

async function stateOf(userId: string) {
  return { counts: await rowCountsFor(userId), snapshot: await normalizedSnapshot(userId) };
}

async function storedSets(sessionId: string) {
  return await db`
    select id, exercise_id, position, weight_kg::float, effective_load_kg::float, reps, is_warmup,
           rir::float, rir_source, e1rm_before_kg::float, xp_awarded
    from public.sets where session_id = ${sessionId} order by position`;
}

async function storedSummary(sessionId: string) {
  const [row] = await db`select summary, revision from public.sessions where id = ${sessionId}`;
  return row;
}

async function expectEqualsRebuild(userId: string) {
  const incremental = await normalizedSnapshot(userId);
  expect((await rebuildCaches(userId)).status).toBe(200);
  expect(await normalizedSnapshot(userId)).toEqual(incremental);
}

async function createCustomExercise(owner: TestUser, archived = false): Promise<string> {
  const exerciseId = randomUUID();
  await db.begin(async (tx) => {
    await tx`insert into public.exercises (id, name, load_type, equipment, owner_user_id, archived_at)
             values (${exerciseId}, ${`Custom ${exerciseId.slice(0, 8)}`}, 'external', 'machine', ${owner.id},
                     ${archived ? new Date() : null})`;
    await tx`insert into public.exercise_skills (exercise_id, skill_id, share_bp)
             select ${exerciseId}, id, 10000 from public.skills where key = 'chest'`;
  });
  return exerciseId;
}

let benchId: string;
let squatId: string;
let pullUpId: string;
let weightedDipId: string;

beforeAll(async () => {
  [benchId, squatId, pullUpId, weightedDipId] = await Promise.all([
    builtInExerciseId('barbell_bench_press'),
    builtInExerciseId('back_squat'),
    builtInExerciseId('pull_up'),
    builtInExerciseId('weighted_dip'),
  ]);
});

afterAll(async () => {
  await db.end();
});

describe('edit-session re-derives history', () => {
  it('re-derives later sessions after an edit', async () => {
    const user = await createTestUser();
    const s1 = sessionAt(ago(3 * DAY_MS), [aSet(benchId, 80, 5, hard)]);
    const s2 = sessionAt(ago(DAY_MS), [aSet(benchId, 80, 5, null)]);
    await sync(user, s1);
    await sync(user, s2);
    expect((await storedSets(s1.id))[0].xp_awarded).toBe(1125);
    expect((await storedSets(s2.id))[0]).toMatchObject({ rir: 3, xp_awarded: 1262 });

    const editedSets = [{ ...s1.sets[0], effort: nearFailure }];
    const response = await edit(user, editBody(s1, editedSets));
    expect(response.status, response.rawBody).toBe(200);
    expect(response.body).toMatchObject({ revision: 1, replayedSessionIds: [s1.id, s2.id] });

    expect((await storedSets(s1.id))[0].xp_awarded).toBe(1875);
    expect((await storedSets(s2.id))[0]).toMatchObject({ rir: 0, e1rm_before_kg: 93.33, xp_awarded: 2277 });
    const [{ total }] = await db`select sum(xp)::int as total from public.user_skills where user_id = ${user.id}`;
    expect(total).toBe(4152);
    const mismatches = await db`
      select us.skill_id from public.user_skills us
      left join (select skill_id, sum(xp)::bigint as xp from public.set_skill_xp where user_id = ${user.id} group by skill_id) l
        using (skill_id)
      where us.user_id = ${user.id} and us.xp <> coalesce(l.xp, 0)`;
    expect(mismatches).toEqual([]);

    const fresh = await createTestUser();
    await sync(fresh, withFreshIds({ ...s1, sets: editedSets }));
    await sync(fresh, withFreshIds(s2));
    expect(await normalizedSnapshot(user.id)).toEqual(await normalizedSnapshot(fresh.id));
  });

  it.each([
    ['changed to squat', (set: SetBody) => ({ ...set, exerciseId: squatId, weightKg: 100 })],
    ['turned into a bench warm-up', (set: SetBody) => ({ ...set, isWarmup: true })],
  ])('makes the next session the baseline when the first-ever set is %s', async (_label, change) => {
    const user = await createTestUser();
    const s1 = sessionAt(ago(3 * DAY_MS), [aSet(benchId, 80, 5, hard)]);
    const s2 = sessionAt(ago(DAY_MS), [aSet(benchId, 80, 5, null), aSet(benchId, 80, 5, null)]);
    await sync(user, s1);
    await sync(user, s2);

    const editedSets = [change(s1.sets[0])];
    expect((await edit(user, editBody(s1, editedSets))).status).toBe(200);

    for (const row of await storedSets(s2.id)) {
      expect(row).toMatchObject({ rir_source: 'cold_start', rir: null, xp_awarded: 375 });
    }
    const { summary } = await storedSummary(s2.id);
    expect(summary.prs).toEqual([]);
    expect(Object.values(summary.xpBySkill as Record<string, number>).reduce((sum, xp) => sum + xp, 0)).toBe(750);

    const fresh = await createTestUser();
    await sync(fresh, withFreshIds({ ...s1, sets: editedSets }));
    await sync(fresh, withFreshIds(s2));
    expect(await normalizedSnapshot(user.id)).toEqual(await normalizedSnapshot(fresh.id));
  });

  it('restores the previous record when the PR set is removed', async () => {
    const user = await createTestUser();
    const s1 = sessionAt(ago(3 * DAY_MS), [aSet(benchId, 100, 5, hard)]);
    const s2 = sessionAt(ago(DAY_MS), [aSet(benchId, 105, 3, hard), aSet(benchId, 60, 10, null, true)]);
    await sync(user, s1);
    await sync(user, s2);
    expect((await storedSummary(s2.id)).summary.prs).toEqual([
      { exerciseId: benchId, kind: 'rep_max', reps: 3, loadKg: 105, previousLoadKg: 100, previousReps: null },
    ]);

    expect((await edit(user, editBody(s2, [s2.sets[1]]))).status).toBe(200);

    const slots = await db`
      select reps, load_kg::float, set_id, exact_set_id from public.rep_maxes
      where user_id = ${user.id} and exercise_id = ${benchId} and reps <= 5 order by reps`;
    expect(slots).toEqual(
      [1, 2, 3, 4, 5].map((reps) => ({
        reps,
        load_kg: 100,
        set_id: s1.sets[0].id,
        exact_set_id: reps === 5 ? s1.sets[0].id : null,
      })),
    );
    expect((await storedSummary(s2.id)).summary.prs).toEqual([]);
    await expectEqualsRebuild(user.id);
  });

  it('adds, reorders and re-exercises sets', async () => {
    const user = await createTestUser();
    const session = sessionAt(ago(HOUR_MS), [aSet(benchId, 80, 5, hard), aSet(benchId, 85, 3, hard)]);
    await sync(user, session);
    const [first, second] = session.sets;
    const editedSets = [
      { ...first, position: 1, exerciseId: squatId, weightKg: 120 },
      { ...second, position: 0 },
      { id: randomUUID(), exerciseId: benchId, position: 2, weightKg: 70, reps: 8, isWarmup: false, effort: null },
    ];
    const response = await edit(user, editBody(session, editedSets));
    expect(response.status, response.rawBody).toBe(200);

    const rows = await storedSets(session.id);
    expect(rows.map((row) => [row.id, row.exercise_id, row.position, row.weight_kg, row.reps])).toEqual([
      [second.id, benchId, 0, 85, 3],
      [first.id, squatId, 1, 120, 5],
      [editedSets[2].id, benchId, 2, 70, 8],
    ]);
    await expectEqualsRebuild(user.id);
  });
});

describe('edit-session loads', () => {
  it('keeps the logged bodyweight on kept sets and uses the current one for new sets', async () => {
    const user = await createTestUser();
    await setBodyweight(user, 80);
    const session = sessionAt(ago(HOUR_MS), [aSet(weightedDipId, 10, 8, hard), aSet(benchId, 60, 5, hard)]);
    await sync(user, session);
    await setBodyweight(user, 85);

    const [dip, bench] = session.sets;
    const pullUp = {
      id: randomUUID(),
      exerciseId: pullUpId,
      position: 2,
      weightKg: 0,
      reps: 8,
      isWarmup: false,
      effort: hard,
    };
    const response = await edit(user, editBody(session, [{ ...dip, weightKg: 20 }, bench, pullUp]));
    expect(response.status, response.rawBody).toBe(200);
    expect((await storedSets(session.id)).map((row) => row.effective_load_kg)).toEqual([100, 60, 85]);

    await db`update public.profile_private set bodyweight_kg = null where user_id = ${user.id}`;
    const before = await stateOf(user.id);
    const secondPullUp = { ...pullUp, id: randomUUID(), position: 3 };
    const refused = await edit(user, editBody(session, [{ ...dip, weightKg: 20 }, bench, pullUp, secondPullUp], 1));
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('bodyweight_required');
    expect(await stateOf(user.id)).toEqual(before);

    const reExercised = await edit(
      user,
      editBody(session, [{ ...dip, weightKg: 20 }, { ...bench, exerciseId: weightedDipId, weightKg: 0 }, pullUp], 1),
    );
    expect(reExercised.status).toBe(409);
    expect(reExercised.body.error).toBe('bodyweight_required');
    expect(await stateOf(user.id)).toEqual(before);
  });

  it('rounds weights and treats an identical re-send as a no-op', async () => {
    const user = await createTestUser();
    const session = sessionAt(ago(HOUR_MS), [aSet(benchId, 60, 5, hard)]);
    await sync(user, session);
    const body = editBody(session, [{ ...session.sets[0], weightKg: 62.505 }]);

    const first = await edit(user, body);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ revision: 1 });
    expect((await storedSets(session.id))[0].weight_kg).toBe(roundTo(2, 62.505));

    const second = await edit(user, body);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ revision: 1, replayedSessionIds: [] });
  });
});

describe('edit-session retries and concurrency', () => {
  it('answers retries, stale revisions and changed set ids', async () => {
    const user = await createTestUser();
    const session = sessionAt(ago(HOUR_MS), [aSet(benchId, 60, 5, hard), aSet(benchId, 60, 5, hard)]);
    await sync(user, session);
    const body = editBody(session, [session.sets[0], { ...session.sets[1], reps: 6 }]);

    const first = await edit(user, body);
    const retry = await edit(user, body);
    expect([first.status, retry.status]).toEqual([200, 200]);
    expect(retry.body).toMatchObject({ revision: first.body.revision, replayedSessionIds: [] });
    expect(retry.body.summary).toEqual(first.body.summary);

    const stale = await edit(user, editBody(session, [session.sets[0], { ...session.sets[1], reps: 7 }]));
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({ error: 'revision_conflict', details: { revision: 1 } });

    const renamed = editBody(session, [session.sets[0], { ...session.sets[1], id: randomUUID(), reps: 6 }], 1);
    const changedIds = await edit(user, renamed);
    expect(changedIds.status).toBe(200);
    expect(changedIds.body).toMatchObject({ revision: 2, replayedSessionIds: [session.id] });
  });

  it('closes the window after 7 days but still accepts a no-op', async () => {
    const user = await createTestUser();
    const session = sessionAt(ago(HOUR_MS), [aSet(benchId, 60, 5, hard)]);
    await sync(user, session);
    await ageSession(session.id, '7 days 1 minute');

    const refused = await edit(user, editBody(session, [{ ...session.sets[0], reps: 6 }]));
    expect(refused.status).toBe(409);
    expect(refused.body.error).toBe('edit_window_closed');
    const noOp = await edit(user, editBody(session, session.sets));
    expect(noOp.status).toBe(200);
    expect(noOp.body).toMatchObject({ revision: 0, replayedSessionIds: [] });
  });

  it('leaves sessions outside the window untouched', async () => {
    const user = await createTestUser();
    const old = sessionAt(ago(2 * HOUR_MS), [aSet(benchId, 80, 5, hard)]);
    const recent = sessionAt(ago(HOUR_MS), [aSet(benchId, 80, 5, null)]);
    await sync(user, old);
    await sync(user, recent);
    await ageSession(old.id, '8 days 1 hour');
    const oldBefore = {
      sets: await db`select * from public.sets where session_id = ${old.id}`,
      ...(await storedSummary(old.id)),
    };

    expect((await edit(user, editBody(recent, [{ ...recent.sets[0], reps: 6 }]))).status).toBe(200);
    const oldAfter = {
      sets: await db`select * from public.sets where session_id = ${old.id}`,
      ...(await storedSummary(old.id)),
    };
    expect(oldAfter).toEqual(oldBefore);
  });

  it('serialises an edit with an earlier complete-session', async () => {
    const user = await createTestUser();
    const s1 = sessionAt(ago(HOUR_MS), [aSet(benchId, 80, 5, null)]);
    await sync(user, s1);
    const s0 = sessionAt(ago(3 * HOUR_MS), [aSet(benchId, 80, 5, hard)]);

    const responses = await Promise.all([
      edit(user, editBody(s1, [{ ...s1.sets[0], effort: nearFailure }])),
      postCompleteSession(user.accessToken, s0),
    ]);
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    await expectEqualsRebuild(user.id);
  });
});

describe('edit-session authorization and validation', () => {
  let owner: TestUser;
  let stranger: TestUser;
  let session: SessionBody;
  let otherSession: SessionBody;

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    session = sessionAt(ago(2 * HOUR_MS), [aSet(benchId, 60, 5, hard)]);
    otherSession = sessionAt(ago(HOUR_MS), [aSet(benchId, 65, 5, hard)]);
    await sync(owner, session);
    await sync(owner, otherSession);
  });

  async function expectRejected(user: TestUser, body: unknown, status: number, error?: string) {
    const before = await Promise.all([stateOf(owner.id), stateOf(stranger.id)]);
    const response = await edit(user, body);
    expect(response.status, response.rawBody).toBe(status);
    if (error) expect(response.body.error).toBe(error);
    expect(await Promise.all([stateOf(owner.id), stateOf(stranger.id)])).toEqual(before);
  }

  it("returns 404 for someone else's session", async () => {
    await expectRejected(stranger, editBody(session, [{ ...session.sets[0], reps: 6 }]), 404, 'session_not_found');
  });

  it("returns 422 for someone else's custom exercise", async () => {
    const ownersExercise = await createCustomExercise(owner);
    const strangersSession = sessionAt(ago(HOUR_MS), [aSet(benchId, 60, 5, hard)]);
    await sync(stranger, strangersSession);
    const body = editBody(strangersSession, [{ ...strangersSession.sets[0], exerciseId: ownersExercise }]);
    await expectRejected(stranger, body, 422, 'unknown_exercise');
  });

  it("accepts the caller's own archived custom exercise", async () => {
    const archived = await createCustomExercise(owner, true);
    const own = sessionAt(ago(3 * HOUR_MS), [aSet(benchId, 60, 5, hard)]);
    await sync(owner, own);
    const response = await edit(owner, editBody(own, [{ ...own.sets[0], exerciseId: archived }]));
    expect(response.status, response.rawBody).toBe(200);
  });

  it("returns 409 for a new set id taken by the caller's other set", async () => {
    const body = editBody(session, [session.sets[0], { ...session.sets[0], id: otherSession.sets[0].id, position: 1 }]);
    await expectRejected(owner, body, 409, 'set_id_conflict');
  });

  it.each([
    ['no sets', (body: ReturnType<typeof editBody>) => ({ ...body, sets: [] })],
    [
      'missing notes',
      (body: ReturnType<typeof editBody>) =>
        Object.fromEntries(Object.entries(body).filter(([key]) => key !== 'notes')),
    ],
    [
      'a duplicate position',
      (body: ReturnType<typeof editBody>) => ({ ...body, sets: [body.sets[0], { ...body.sets[0], id: randomUUID() }] }),
    ],
    ['a negative revision', (body: ReturnType<typeof editBody>) => ({ ...body, ifRevision: -1 })],
    [
      '201 sets',
      (body: ReturnType<typeof editBody>) => ({
        ...body,
        sets: Array.from({ length: 201 }, (_, position) => ({ ...body.sets[0], id: randomUUID(), position })),
      }),
    ],
    ['an unknown key', (body: ReturnType<typeof editBody>) => ({ ...body, startedAt: new Date().toISOString() })],
  ])('returns 422 for %s', async (_label, mutate) => {
    await expectRejected(owner, mutate(editBody(session, [{ ...session.sets[0], reps: 6 }])), 422);
  });

  it('returns 405 for GET and 401 without a token', async () => {
    const url = `${env.FUNCTIONS_URL}/edit-session`;
    const before = await stateOf(owner.id);
    const get = await fetch(url, { headers: { Authorization: `Bearer ${owner.accessToken}`, apikey: env.ANON_KEY } });
    expect(get.status).toBe(405);
    const anonymous = await fetch(url, {
      method: 'POST',
      headers: { apikey: env.ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify(editBody(session, [{ ...session.sets[0], reps: 6 }])),
    });
    expect(anonymous.status).toBe(401);
    expect(await stateOf(owner.id)).toEqual(before);
  });
});
