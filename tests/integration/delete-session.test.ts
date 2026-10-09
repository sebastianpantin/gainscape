import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  activeDropSummaries,
  ageSession,
  builtInExerciseId,
  createTestUser,
  db,
  normalizedSnapshot,
  postCompleteSession,
  postFunction,
  rebuildCaches,
  type TestUser,
  rowCounts,
} from './local-stack.ts';
import { aSet, DAY_MS, editSession, hoursAgo, payloadAt, postSession, withFreshIds } from './session-support.ts';

async function remove(user: TestUser, body: unknown) {
  return await postFunction('delete-session', user.accessToken, body);
}

const countedTables = ['sessions', 'sets', 'deleted_sessions'] as const;

async function cachesOf(userId: string) {
  const { repMaxes, exerciseMaxes, userSkills } = await normalizedSnapshot(userId);
  return { repMaxes, exerciseMaxes, userSkills };
}

let benchId: string;
let squatId: string;

beforeAll(async () => {
  [benchId, squatId] = await Promise.all([builtInExerciseId('barbell_bench_press'), builtInExerciseId('back_squat')]);
});

afterAll(async () => {
  await db.end();
});

describe('delete-session', () => {
  it('deletes the later session and blocks it from syncing again', async () => {
    const user = await createTestUser();
    const s1 = payloadAt(hoursAgo(3), [aSet(benchId, 0, 80)]);
    const s2 = payloadAt(hoursAgo(1), [aSet(benchId, 0, 100, { reps: 3 })]);
    await postSession(user, s1);
    await postSession(user, s2);

    const activeDrops = await activeDropSummaries(s2.id);
    expect(activeDrops.some((drop) => drop.source === 'pr')).toBe(true);
    const response = await remove(user, { sessionId: s2.id });
    expect(response.status, response.rawBody).toBe(200);
    expect(response.body).toEqual({
      sessionId: s2.id,
      deleted: true,
      replayedSessionIds: [],
      revokedDrops: activeDrops.map((drop) => ({ ...drop, revokedQuantity: drop.quantity })),
    });

    const onlyFirst = await createTestUser();
    await postSession(onlyFirst, withFreshIds(s1));
    expect(await cachesOf(user.id)).toEqual(await cachesOf(onlyFirst.id));

    const retry = await remove(user, { sessionId: s2.id });
    expect(retry.status).toBe(200);
    expect(retry.body.replayedSessionIds).toEqual([]);
    expect(retry.body.revokedDrops).toEqual([]);

    const before = await rowCounts(user.id, countedTables);
    const resync = await postCompleteSession(user.accessToken, s2);
    expect(resync.status).toBe(410);
    expect(resync.body.error).toBe('session_deleted');
    expect(await rowCounts(user.id, countedTables)).toEqual(before);

    const intruder = await createTestUser();
    const intruderSync = await postCompleteSession(intruder.accessToken, { ...s2, sets: withFreshIds(s2).sets });
    expect(intruderSync.status).toBe(409);
    expect(intruderSync.body.error).toBe('session_id_conflict');
  });

  it('re-derives the later session when an earlier one is deleted', async () => {
    const user = await createTestUser();
    const s1 = payloadAt(hoursAgo(3), [aSet(benchId, 0, 80)]);
    const s2 = payloadAt(hoursAgo(1), [aSet(benchId, 0, 80, { effort: null })]);
    await postSession(user, s1);
    await postSession(user, s2);

    const response = await remove(user, { sessionId: s1.id });
    expect(response.status).toBe(200);
    expect(response.body.replayedSessionIds).toEqual([s2.id]);

    const onlySecond = await createTestUser();
    await postSession(onlySecond, withFreshIds(s2));
    expect(await normalizedSnapshot(user.id)).toEqual(await normalizedSnapshot(onlySecond.id));
  });

  it('removes cache rows of exercises left without sessions', async () => {
    const user = await createTestUser();
    const s1 = payloadAt(hoursAgo(3), [aSet(benchId, 0, 80)]);
    const s2 = payloadAt(hoursAgo(1), [aSet(squatId, 0, 100)]);
    await postSession(user, s1);
    await postSession(user, s2);

    expect((await remove(user, { sessionId: s2.id })).status).toBe(200);
    const squatRows = await db`
      select 'max' from public.exercise_maxes where user_id = ${user.id} and exercise_id = ${squatId}
      union all
      select 'rep' from public.rep_maxes where user_id = ${user.id} and exercise_id = ${squatId}`;
    expect(squatRows).toEqual([]);
    const legs = await db`
      select 1 from public.user_skills us join public.skills s on s.id = us.skill_id
      where us.user_id = ${user.id} and s.key = 'legs'`;
    expect(legs).toEqual([]);

    const incremental = await normalizedSnapshot(user.id);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await normalizedSnapshot(user.id)).toEqual(incremental);
  });
});

describe('delete-session guards', () => {
  let owner: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
  });

  async function expectRejected(user: TestUser, body: unknown, status: number) {
    const before = await Promise.all([rowCounts(owner.id, countedTables), normalizedSnapshot(owner.id)]);
    const response = await remove(user, body);
    expect(response.status, response.rawBody).toBe(status);
    expect(await Promise.all([rowCounts(owner.id, countedTables), normalizedSnapshot(owner.id)])).toEqual(before);
    return response;
  }

  it('refuses a session outside the window', async () => {
    const session = payloadAt(hoursAgo(1), [aSet(benchId, 0, 60)]);
    await postSession(owner, session);
    await ageSession(session.id, '7 days 1 minute');
    expect((await expectRejected(owner, { sessionId: session.id }, 409)).body.error).toBe('edit_window_closed');
  });

  it('refuses a history-only session', async () => {
    const session = payloadAt(new Date(Date.now() - 8 * DAY_MS), [aSet(benchId, 0, 60)]);
    await postSession(owner, session);
    expect((await expectRejected(owner, { sessionId: session.id }, 409)).body.error).toBe('edit_window_closed');
  });

  it("returns 404 for someone else's session and for an unknown id", async () => {
    const session = payloadAt(hoursAgo(2), [aSet(benchId, 0, 60)]);
    await postSession(owner, session);
    expect((await expectRejected(stranger, { sessionId: session.id }, 404)).body.error).toBe('session_not_found');
    expect((await expectRejected(owner, { sessionId: randomUUID() }, 404)).body.error).toBe('session_not_found');
  });

  it('returns 409 revision_conflict for a stale ifRevision and deletes with the current one', async () => {
    const session = payloadAt(hoursAgo(3), [aSet(benchId, 0, 60)]);
    await postSession(owner, session);
    await editSession(owner, session, [{ ...session.sets[0], weightKg: 62.5 }]);
    const stale = await expectRejected(owner, { sessionId: session.id, ifRevision: 0 }, 409);
    expect(stale.body).toEqual({ error: 'revision_conflict', details: { revision: 1 } });
    const current = await remove(owner, { sessionId: session.id, ifRevision: 1 });
    expect(current.status, current.rawBody).toBe(200);
    expect(current.body.deleted).toBe(true);
  });

  it('returns 422 for a malformed id or an extra key', async () => {
    await expectRejected(owner, { sessionId: 'not-a-uuid' }, 422);
    await expectRejected(owner, { sessionId: randomUUID(), force: true }, 422);
    await expectRejected(owner, { sessionId: randomUUID(), ifRevision: -1 }, 422);
  });
});

describe('delete-session and custom exercises', () => {
  it('unlocks the shares of a custom exercise whose only session is deleted', async () => {
    const user = await createTestUser();
    const skills = Object.fromEntries((await db`select id, key from public.skills`).map((row) => [row.key, row.id]));
    const exercise = {
      id: randomUUID(),
      name: `Landmine ${randomUUID().slice(0, 8)}`,
      loadType: 'external',
      equipment: 'other',
      shares: [
        { skillId: skills.shoulders, shareBp: 6000 },
        { skillId: skills.chest, shareBp: 4000 },
      ],
    };
    expect((await user.client.rpc('save_custom_exercise', { exercise })).error).toBeNull();
    const session = payloadAt(hoursAgo(1), [aSet(exercise.id, 0, 40, { reps: 8 })]);
    await postSession(user, session);
    const reshared = { ...exercise, shares: [{ skillId: skills.shoulders, shareBp: 10000 }] };
    expect((await user.client.rpc('save_custom_exercise', { exercise: reshared })).error?.message).toBe(
      'shares_locked',
    );

    expect((await remove(user, { sessionId: session.id })).status).toBe(200);
    expect((await user.client.rpc('save_custom_exercise', { exercise: reshared })).error).toBeNull();
  });
});
