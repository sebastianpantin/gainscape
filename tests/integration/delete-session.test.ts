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
} from './local-stack.ts';
import { HOUR_MS, postSession, withFreshIds } from './loot-support.ts';

type Effort = { type: 'level'; level: 'hard' } | null;

const hard = { type: 'level', level: 'hard' } as const;

function sessionAt(hoursAgo: number, sets: { exerciseId: string; weightKg: number; reps: number; effort: Effort }[]) {
  const startedAt = new Date(Date.now() - hoursAgo * HOUR_MS);
  return {
    id: randomUUID(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + HOUR_MS / 2).toISOString(),
    notes: null,
    sets: sets.map((set, position) => ({ id: randomUUID(), position, isWarmup: false, ...set })),
  };
}

async function remove(user: TestUser, body: unknown) {
  return await postFunction('delete-session', user.accessToken, body);
}

async function rowCountsFor(userId: string) {
  const [counts] = await db`
    select
      (select count(*) from public.sessions where user_id = ${userId})::int as sessions,
      (select count(*) from public.sets where user_id = ${userId})::int as sets,
      (select count(*) from public.deleted_sessions where user_id = ${userId})::int as deleted_sessions`;
  return counts;
}

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
    const s1 = sessionAt(3, [{ exerciseId: benchId, weightKg: 80, reps: 5, effort: hard }]);
    const s2 = sessionAt(1, [{ exerciseId: benchId, weightKg: 100, reps: 3, effort: hard }]);
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

    const before = await rowCountsFor(user.id);
    const resync = await postCompleteSession(user.accessToken, s2);
    expect(resync.status).toBe(410);
    expect(resync.body.error).toBe('session_deleted');
    expect(await rowCountsFor(user.id)).toEqual(before);

    const intruder = await createTestUser();
    const intruderSync = await postCompleteSession(intruder.accessToken, { ...s2, sets: withFreshIds(s2).sets });
    expect(intruderSync.status).toBe(409);
    expect(intruderSync.body.error).toBe('session_id_conflict');
  });

  it('re-derives the later session when an earlier one is deleted', async () => {
    const user = await createTestUser();
    const s1 = sessionAt(3, [{ exerciseId: benchId, weightKg: 80, reps: 5, effort: hard }]);
    const s2 = sessionAt(1, [{ exerciseId: benchId, weightKg: 80, reps: 5, effort: null }]);
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
    const s1 = sessionAt(3, [{ exerciseId: benchId, weightKg: 80, reps: 5, effort: hard }]);
    const s2 = sessionAt(1, [{ exerciseId: squatId, weightKg: 100, reps: 5, effort: hard }]);
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
    const before = await Promise.all([rowCountsFor(owner.id), normalizedSnapshot(owner.id)]);
    const response = await remove(user, body);
    expect(response.status, response.rawBody).toBe(status);
    expect(await Promise.all([rowCountsFor(owner.id), normalizedSnapshot(owner.id)])).toEqual(before);
    return response;
  }

  it('refuses a session outside the window', async () => {
    const session = sessionAt(1, [{ exerciseId: benchId, weightKg: 60, reps: 5, effort: hard }]);
    await postSession(owner, session);
    await ageSession(session.id, '7 days 1 minute');
    expect((await expectRejected(owner, { sessionId: session.id }, 409)).body.error).toBe('edit_window_closed');
  });

  it('refuses a history-only session', async () => {
    const startedAt = new Date(Date.now() - 8 * 24 * HOUR_MS);
    const session = {
      ...sessionAt(1, [{ exerciseId: benchId, weightKg: 60, reps: 5, effort: hard }]),
      startedAt: startedAt.toISOString(),
      endedAt: new Date(startedAt.getTime() + HOUR_MS).toISOString(),
    };
    await postSession(owner, session);
    expect((await expectRejected(owner, { sessionId: session.id }, 409)).body.error).toBe('edit_window_closed');
  });

  it("returns 404 for someone else's session and for an unknown id", async () => {
    const session = sessionAt(2, [{ exerciseId: benchId, weightKg: 60, reps: 5, effort: hard }]);
    await postSession(owner, session);
    expect((await expectRejected(stranger, { sessionId: session.id }, 404)).body.error).toBe('session_not_found');
    expect((await expectRejected(owner, { sessionId: randomUUID() }, 404)).body.error).toBe('session_not_found');
  });

  it('returns 422 for a malformed id or an extra key', async () => {
    await expectRejected(owner, { sessionId: 'not-a-uuid' }, 422);
    await expectRejected(owner, { sessionId: randomUUID(), force: true }, 422);
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
    const session = sessionAt(1, [{ exerciseId: exercise.id, weightKg: 40, reps: 8, effort: hard }]);
    await postSession(user, session);
    const reshared = { ...exercise, shares: [{ skillId: skills.shoulders, shareBp: 10000 }] };
    expect((await user.client.rpc('save_custom_exercise', { exercise: reshared })).error?.message).toBe(
      'shares_locked',
    );

    expect((await remove(user, { sessionId: session.id })).status).toBe(200);
    expect((await user.client.rpc('save_custom_exercise', { exercise: reshared })).error).toBeNull();
  });
});
