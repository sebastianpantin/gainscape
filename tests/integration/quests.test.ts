import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  builtInExerciseId,
  createTestUser,
  db,
  fetchFunction,
  type FunctionResponse,
  env,
  normalizedSnapshot,
  postFunction,
  rateLimitHits,
  rebuildCaches,
  seedRateLimitHits,
  type TestUser,
} from './local-stack.ts';
import { aSet, DAY_MS, editSession, hoursAgo, payloadAt, postSession, type SessionPayload } from './session-support.ts';

let squatId: string;
let benchId: string;
let initiationId: string;
let heavySingleId: string;
let legsId: string;
let coreId: string;

async function idOf(table: 'quests' | 'skills', key: string): Promise<string> {
  const [row] = await db`select id from ${db(`public.${table}`)} where key = ${key}`;
  return row.id;
}

beforeAll(async () => {
  [squatId, benchId, initiationId, heavySingleId, legsId, coreId] = await Promise.all([
    builtInExerciseId('back_squat'),
    builtInExerciseId('barbell_bench_press'),
    idOf('quests', 'squat_rack_initiation'),
    idOf('quests', 'the_heavy_single'),
    idOf('skills', 'legs'),
    idOf('skills', 'core'),
  ]);
});

afterAll(async () => {
  await db.end();
});

async function startQuest(user: TestUser, body: unknown) {
  return await postFunction('start-quest', user.accessToken, body);
}

async function seedProgress(userId: string, questId: string, stepIndex: number, stepProgress: number) {
  await db`
    insert into public.quest_progress (user_id, quest_id, started_at, step_index, step_progress)
    values (${userId}, ${questId}, date_trunc('milliseconds', now() - interval '3 days'), ${stepIndex}, ${stepProgress})`;
}

async function backdateQuestStart(userId: string, questId: string) {
  await db`
    update public.quest_progress set started_at = date_trunc('milliseconds', now() - interval '3 days')
    where user_id = ${userId} and quest_id = ${questId}`;
}

async function progressOf(userId: string) {
  return await db`
    select quest_id, step_index, step_progress::float from public.quest_progress
    where user_id = ${userId} order by quest_id`;
}

async function completionsOf(userId: string) {
  return await db`
    select quest_id, session_id, anchor_session_id, anchor_started_at, started_at, quest_points
    from public.quest_completions where user_id = ${userId} order by quest_id`;
}

async function questEventsOf(userId: string) {
  return await db`
    select session_id, event_key, type::text, occurred_at, payload
    from public.events where user_id = ${userId} and type = 'quest' order by event_key`;
}

async function skillsMismatchingSetXpPlusQuestXp(userId: string) {
  return await db`
    with expected as (
      select s.id as skill_id,
             coalesce((
               select sum(x.xp) from public.set_skill_xp x
               join public.sets st on st.id = x.set_id
               join public.sessions se on se.id = st.session_id
               where x.user_id = ${userId} and x.skill_id = s.id and not se.history_only), 0)
             + coalesce((
               select sum(q.xp) from public.quest_completion_xp q
               where q.user_id = ${userId} and q.skill_id = s.id), 0) as xp
      from public.skills s
    )
    select e.skill_id, e.xp::int as expected, coalesce(us.xp, 0)::int as actual
    from expected e
    left join public.user_skills us on us.user_id = ${userId} and us.skill_id = e.skill_id
    where e.xp <> coalesce(us.xp, 0)`;
}

async function expectRebuildChangesNothing(userId: string) {
  const before = await normalizedSnapshot(userId);
  expect((await rebuildCaches(userId)).status).toBe(200);
  expect(await normalizedSnapshot(userId)).toEqual(before);
}

const squatSet = (position: number, reps = 5) => aSet(squatId, position, 60, { reps });
const hundredSquatReps = () => Array.from({ length: 10 }, (_, position) => squatSet(position, 10));

describe('start-quest', () => {
  it('starts an available quest once and answers the same progress on a repeat', async () => {
    const user = await createTestUser();
    const first = await startQuest(user, { questId: initiationId });
    expect(first.status, first.rawBody).toBe(200);
    expect(first.body).toEqual({
      questId: initiationId,
      startedAt: expect.any(String),
      stepIndex: 0,
      stepProgress: 0,
    });
    const again = await startQuest(user, { questId: initiationId.toUpperCase() });
    expect(again.status, again.rawBody).toBe(200);
    expect(again.body).toEqual(first.body);
    expect(await progressOf(user.id)).toEqual([{ quest_id: initiationId, step_index: 0, step_progress: 0 }]);
    expect(await rateLimitHits('quest_start_hour', user.id)).toBe(1);
  });

  it('lists every missing requirement', async () => {
    const user = await createTestUser();
    const response = await startQuest(user, { questId: heavySingleId });
    expect(response.status, response.rawBody).toBe(409);
    expect(response.body).toEqual({
      error: 'quest_requirements_not_met',
      details: {
        missing: [
          { kind: 'missing_level', skillId: legsId, level: 15, currentLevel: 1 },
          { kind: 'missing_quest', questId: initiationId },
        ],
      },
    });
    expect(await progressOf(user.id)).toEqual([]);
  });

  it('answers 404 for an unknown quest and 422 for a malformed body', async () => {
    const user = await createTestUser();
    const unknown = await startQuest(user, { questId: randomUUID() });
    expect(unknown.status, unknown.rawBody).toBe(404);
    expect(unknown.body.error).toBe('quest_not_found');
    for (const body of [{}, { questId: 'not-a-uuid' }, { questId: initiationId, extra: true }]) {
      const malformed = await startQuest(user, body);
      expect(malformed.status, malformed.rawBody).toBe(422);
    }
  });

  it('is rate limited per user', async () => {
    const user = await createTestUser();
    await seedRateLimitHits('quest_start_hour', user.id, 30);
    const response = await startQuest(user, { questId: initiationId });
    expect(response.status, response.rawBody).toBe(429);
    expect(response.body.error).toBe('rate_limited');
    expect(await progressOf(user.id)).toEqual([]);
  });

  it('refuses a caller without a session token', async () => {
    const response = await fetchFunction('start-quest', {
      method: 'POST',
      headers: { apikey: env.PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ questId: initiationId }),
    });
    expect(response.status).toBe(401);
  });
});

describe('complete-session advances quests', () => {
  let user: TestUser;
  let first: SessionPayload;
  let second: SessionPayload;
  let finishing: SessionPayload;
  let later: SessionPayload;
  let finishingBody: FunctionResponse['body'];

  beforeAll(async () => {
    first = payloadAt(hoursAgo(40), [squatSet(0)]);
    second = payloadAt(hoursAgo(30), [squatSet(0)]);
    finishing = payloadAt(hoursAgo(20), hundredSquatReps());
    later = payloadAt(hoursAgo(10), [aSet(benchId, 0, 60)]);
    user = await createTestUser();
    expect((await startQuest(user, { questId: initiationId })).status).toBe(200);
    await backdateQuestStart(user.id, initiationId);
  });

  it('counts a session towards the current step', async () => {
    const response = await postSession(user, first);
    expect(response.body.quests).toEqual({
      completed: [],
      progressed: [{ questId: initiationId, stepIndex: 0, stepProgress: 1, stepTarget: 2 }],
      unlocked: [],
      levelUps: [],
    });
  });

  it('moves to the next step when one is done', async () => {
    const response = await postSession(user, second);
    expect(response.body.quests?.progressed).toEqual([
      { questId: initiationId, stepIndex: 1, stepProgress: 0, stepTarget: 100 },
    ]);
    expect(await progressOf(user.id)).toEqual([{ quest_id: initiationId, step_index: 1, step_progress: 0 }]);
  });

  it('completes the quest, grants its xp and posts one sessionless quest event', async () => {
    const response = await postSession(user, finishing);
    finishingBody = response.body;
    const quests = response.body.quests;
    expect(quests?.completed).toEqual([
      {
        questId: initiationId,
        key: 'squat_rack_initiation',
        name: 'Squat Rack Initiation',
        questPoints: 1,
        xpBySkill: { [legsId]: 800, [coreId]: 200 },
      },
    ]);
    expect(quests?.progressed).toEqual([]);
    expect(quests?.levelUps.length).toBeGreaterThan(0);

    expect(await progressOf(user.id)).toEqual([]);
    const [completion] = await completionsOf(user.id);
    expect(completion).toMatchObject({
      quest_id: initiationId,
      session_id: finishing.id,
      anchor_session_id: finishing.id,
      quest_points: 1,
    });
    expect(new Date(completion.anchor_started_at).toISOString()).toBe(finishing.startedAt);
    expect(await skillsMismatchingSetXpPlusQuestXp(user.id)).toEqual([]);

    const events = await questEventsOf(user.id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ session_id: null, event_key: 'quest:squat_rack_initiation', type: 'quest' });
    expect(new Date(events[0].occurred_at).toISOString()).toBe(finishing.endedAt);
    expect(events[0].payload).toEqual({
      questId: initiationId,
      questKey: 'squat_rack_initiation',
      name: 'Squat Rack Initiation',
      questPoints: 1,
      levelUps: quests?.levelUps,
    });

    const profile = await user.client.rpc('get_profile', { target: user.id });
    expect(profile.data.questPoints).toBe(1);
  });

  it('answers a resubmission with the stored summary and completes nothing twice', async () => {
    const response = await postSession(user, finishing);
    expect(response.body).toEqual(finishingBody);
    expect(await completionsOf(user.id)).toHaveLength(1);
    expect(await questEventsOf(user.id)).toHaveLength(1);
  });

  it('refuses to start a completed quest', async () => {
    const response = await startQuest(user, { questId: initiationId });
    expect(response.status, response.rawBody).toBe(409);
    expect(response.body.error).toBe('quest_completed');
  });

  it('matches a rebuild after completing', async () => {
    await expectRebuildChangesNothing(user.id);
  });

  it('keeps quest xp when a later session is added and edited', async () => {
    await postSession(user, later);
    expect(await skillsMismatchingSetXpPlusQuestXp(user.id)).toEqual([]);
    await editSession(user, later, [aSet(benchId, 0, 70, { id: later.sets[0].id })]);
    expect(await skillsMismatchingSetXpPlusQuestXp(user.id)).toEqual([]);
    await expectRebuildChangesNothing(user.id);
  });

  it('keeps quest xp when an older session syncs after the completion', async () => {
    await postSession(user, payloadAt(hoursAgo(35), [aSet(benchId, 0, 50)]));
    expect(await skillsMismatchingSetXpPlusQuestXp(user.id)).toEqual([]);
    await expectRebuildChangesNothing(user.id);
  });

  it('leaves quest state alone when the completing session is edited', async () => {
    const completions = await completionsOf(user.id);
    await editSession(user, finishing, [{ ...finishing.sets[0], reps: 3 }]);
    expect(await completionsOf(user.id)).toEqual(completions);
    const [stored] = await db`select summary from public.sessions where id = ${finishing.id}`;
    expect(stored.summary.quests).toEqual(finishingBody.quests);
    expect(await skillsMismatchingSetXpPlusQuestXp(user.id)).toEqual([]);
    await expectRebuildChangesNothing(user.id);
  });

  it('keeps the completion and its xp when the completing session is deleted', async () => {
    const response = await postFunction('delete-session', user.accessToken, { sessionId: finishing.id });
    expect(response.status, response.rawBody).toBe(200);
    const [completion] = await completionsOf(user.id);
    expect(completion).toMatchObject({ session_id: null, anchor_session_id: finishing.id });
    expect(await questEventsOf(user.id)).toHaveLength(1);
    expect(await skillsMismatchingSetXpPlusQuestXp(user.id)).toEqual([]);
    await expectRebuildChangesNothing(user.id);
  });
});

describe('quest progress rules at sync', () => {
  it('ignores a session that ended before the quest started', async () => {
    const user = await createTestUser();
    expect((await startQuest(user, { questId: initiationId })).status).toBe(200);
    const response = await postSession(user, payloadAt(hoursAgo(5), [squatSet(0)]));
    expect(response.body.quests).toBeUndefined();
    expect(await progressOf(user.id)).toEqual([{ quest_id: initiationId, step_index: 0, step_progress: 0 }]);
  });

  it('ignores a history-only session', async () => {
    const user = await createTestUser();
    await db`
      insert into public.quest_progress (user_id, quest_id, started_at)
      values (${user.id}, ${initiationId}, now() - interval '30 days')`;
    const response = await postSession(user, payloadAt(new Date(Date.now() - 10 * DAY_MS), [squatSet(0)]));
    expect(response.body.historyOnly).toBe(true);
    expect(response.body.quests).toBeUndefined();
    expect(await progressOf(user.id)).toEqual([{ quest_id: initiationId, step_index: 0, step_progress: 0 }]);
  });

  it('applies the xp of a quest anchored at a deleted session exactly once', async () => {
    const user = await createTestUser();
    await seedProgress(user.id, initiationId, 1, 90);
    const finishing = payloadAt(hoursAgo(20), [squatSet(0, 10)]);
    expect((await postSession(user, finishing)).body.quests?.completed).toHaveLength(1);
    expect((await postFunction('delete-session', user.accessToken, { sessionId: finishing.id })).status).toBe(200);
    await postSession(user, payloadAt(hoursAgo(25), [aSet(benchId, 0, 60)]));
    expect(await skillsMismatchingSetXpPlusQuestXp(user.id)).toEqual([]);
    await expectRebuildChangesNothing(user.id);
  });
});

describe('rebuild-caches with quests', () => {
  it('rebuilds a user whose only derived data is quest xp', async () => {
    const user = await createTestUser();
    await seedProgress(user.id, initiationId, 1, 90);
    const finishing = payloadAt(hoursAgo(20), [squatSet(0, 10)]);
    await postSession(user, finishing);
    expect((await postFunction('delete-session', user.accessToken, { sessionId: finishing.id })).status).toBe(200);
    await db`delete from public.user_skills where user_id = ${user.id}`;

    let listed = false;
    for (let after: string | null = null; !listed;) {
      const page = await fetchFunction('rebuild-caches', {
        method: 'POST',
        headers: { apikey: env.SECRET_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ list: { scope: 'all', after, limit: 1000 } }),
      });
      const body = JSON.parse(page.rawBody);
      listed = body.userIds.includes(user.id);
      if (body.next === null) break;
      after = body.next;
    }
    expect(listed).toBe(true);

    expect((await rebuildCaches(user.id)).status).toBe(200);
    const skills = await db`select skill_id, xp::int from public.user_skills where user_id = ${user.id} order by xp`;
    expect(skills).toEqual([
      { skill_id: coreId, xp: 200 },
      { skill_id: legsId, xp: 800 },
    ]);
  });
});
