import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_BALANCE } from '@domain/index.ts';
import {
  ageSession,
  builtInExerciseId,
  createTestUser,
  db,
  grantDrop,
  lootSnapshot,
  normalizedSnapshot,
  postCompleteSession,
  postFunction,
  rebuildCaches,
  setBodyweight,
  type TestUser,
} from './local-stack.ts';
import {
  aBout,
  anIntervalBout,
  aSet,
  editSession,
  hoursAgo,
  payloadAt,
  postSession,
  type SessionPayload,
  withFreshIds,
} from './session-support.ts';

async function syncInOrder(user: TestUser, sessions: SessionPayload[]) {
  const ordered = [...sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  for (const session of ordered) await postSession(user, withFreshIds(session));
}

async function storedSummary(sessionId: string) {
  const [row] = await db`select summary from public.sessions where id = ${sessionId}`;
  return row.summary;
}

let benchId: string;
let squatId: string;
let pullUpId: string;
let cableCrunchId: string;

beforeAll(async () => {
  [benchId, squatId, pullUpId, cableCrunchId] = await Promise.all([
    builtInExerciseId('barbell_bench_press'),
    builtInExerciseId('back_squat'),
    builtInExerciseId('pull_up'),
    builtInExerciseId('cable_crunch'),
  ]);
});

afterAll(async () => {
  await db.end();
});

describe('out-of-order sync', () => {
  it('stores the same derived state as syncing in order', async () => {
    const s1 = payloadAt(hoursAgo(5), [aSet(benchId, 0, 60), aSet(squatId, 1, 100, { effort: null })]);
    const s2 = payloadAt(hoursAgo(3), [
      aSet(benchId, 0, 80, { reps: 6, effort: null }),
      aSet(pullUpId, 1, 0, { reps: 8 }),
    ]);
    const s3 = payloadAt(hoursAgo(1), [aSet(benchId, 0, 100)]);
    const [outOfOrder, inOrder] = await Promise.all([createTestUser(), createTestUser()]);
    await Promise.all([setBodyweight(outOfOrder, 80), setBodyweight(inOrder, 80)]);

    for (const spec of [s3, s1, s2]) await postSession(outOfOrder, withFreshIds(spec));
    await syncInOrder(inOrder, [s1, s2, s3]);

    expect(await normalizedSnapshot(outOfOrder.id)).toEqual(await normalizedSnapshot(inOrder.id));
  });

  it('re-derives a later session when an earlier one syncs late', async () => {
    const user = await createTestUser();
    const late = withFreshIds(payloadAt(hoursAgo(1), [aSet(benchId, 0, 100)]));
    const early = withFreshIds(payloadAt(hoursAgo(5), [aSet(benchId, 0, 60)]));

    const lateResponse = await postSession(user, late);
    expect(lateResponse.body.prs).toEqual([]);
    await postSession(user, early);

    const [row] = await db`
      select e1rm_before_kg::float, e1rm_candidate_kg::float, xp_awarded from public.sets where id = ${late.sets[0].id}`;
    expect(row).toEqual({ e1rm_before_kg: 74, e1rm_candidate_kg: 81.4, xp_awarded: 626 });
    const [max] =
      await db`select e1rm_kg::float from public.exercise_maxes where user_id = ${user.id} and exercise_id = ${benchId}`;
    expect(max.e1rm_kg).toBe(81.4);
    expect((await storedSummary(late.id)).prs).toEqual([
      {
        exerciseId: benchId,
        kind: 'rep_max',
        setId: late.sets[0].id,
        reps: 5,
        loadKg: 100,
        previousLoadKg: 60,
        previousReps: null,
      },
    ]);

    const retry = await postSession(user, late);
    expect(retry.body).toEqual({
      ...(await storedSummary(late.id)),
      programLinked: false,
      completedAt: expect.any(String),
      startedAt: late.startedAt,
      endedAt: late.endedAt,
      sessionRpe: null,
    });
    expect(retry.body.prs).toHaveLength(1);
    expect(retry.rawBody).not.toBe(lateResponse.rawBody);
  });

  it('judges records against earlier sessions only', async () => {
    const user = await createTestUser();
    const later = withFreshIds(payloadAt(hoursAgo(1), [aSet(benchId, 0, 105)]));
    const earlier = withFreshIds(payloadAt(hoursAgo(3), [aSet(benchId, 0, 100)]));
    await postSession(user, later);
    const earlierResponse = await postSession(user, earlier);

    expect(earlierResponse.body.prs).toEqual([]);
    expect((await storedSummary(later.id)).prs).toEqual([
      {
        exerciseId: benchId,
        kind: 'rep_max',
        setId: later.sets[0].id,
        reps: 5,
        loadKg: 105,
        previousLoadKg: 100,
        previousReps: null,
      },
    ]);
    const [slot] = await db`
      select load_kg::float, set_id from public.rep_maxes
      where user_id = ${user.id} and exercise_id = ${benchId} and reps = 5`;
    expect(slot).toEqual({ load_kg: 105, set_id: later.sets[0].id });
  });

  it('recomputes level-ups in later summaries', async () => {
    const lateSpec = payloadAt(hoursAgo(1), [aSet(cableCrunchId, 0, 30, { reps: 8, effort: null })]);
    const earlySpec = payloadAt(hoursAgo(3), [aSet(cableCrunchId, 0, 30, { reps: 8 })]);
    const [outOfOrder, inOrder] = await Promise.all([createTestUser(), createTestUser()]);
    const late = withFreshIds(lateSpec);
    const early = withFreshIds(earlySpec);

    const lateResponse = await postSession(outOfOrder, late);
    expect(lateResponse.body).toMatchObject({
      xpBySkill: { core: 165 },
      levelUps: [{ skill: 'core', from: 1, to: 2 }],
    });
    const earlyResponse = await postSession(outOfOrder, early);
    expect(earlyResponse.body).toMatchObject({
      xpBySkill: { core: 495 },
      levelUps: [{ skill: 'core', from: 1, to: 6 }],
    });
    const [earlySet] = await db`select e1rm_candidate_kg::float from public.sets where id = ${early.sets[0].id}`;
    expect(earlySet.e1rm_candidate_kg).toBe(40);
    const [lateSet] =
      await db`select rir::float, rir_source, effective_reps, xp_awarded from public.sets where id = ${late.sets[0].id}`;
    expect(lateSet).toEqual({ rir: 3, rir_source: 'estimated', effective_reps: 3, xp_awarded: 495 });
    expect(await storedSummary(late.id)).toMatchObject({
      xpBySkill: { core: 495 },
      levelUps: [{ skill: 'core', from: 6, to: 10 }],
    });
    const [skill] = await db`
      select us.xp::int from public.user_skills us join public.skills s on s.id = us.skill_id
      where us.user_id = ${outOfOrder.id} and s.key = 'core'`;
    expect(skill.xp).toBe(990);

    await syncInOrder(inOrder, [lateSpec, earlySpec]);
    expect((await normalizedSnapshot(outOfOrder.id)).sessions).toEqual((await normalizedSnapshot(inOrder.id)).sessions);
  });

  it('merges the rewritten summary into the stored one', async () => {
    const user = await createTestUser();
    const later = withFreshIds(payloadAt(hoursAgo(1), [aSet(benchId, 0, 80, { effort: null })]));
    await postSession(user, later);
    await db`update public.sessions set summary = summary || '{"extra": {"k": 1}}' where id = ${later.id}`;
    const before = await storedSummary(later.id);

    await postSession(user, withFreshIds(payloadAt(hoursAgo(3), [aSet(benchId, 0, 80)])));

    const after = await storedSummary(later.id);
    expect(after.extra).toEqual({ k: 1 });
    expect(after.drops).toEqual(before.drops);
    expect(after.sessionId).toBe(later.id);
    expect(after.xpBySkill).not.toEqual(before.xpBySkill);
  });
});

describe('replay with cardio bouts', () => {
  it('replays a mixed history to the same lift state as the lift-only history', async () => {
    const [runningId, sprintsId] = await Promise.all([
      builtInExerciseId('running'),
      builtInExerciseId('sprint_intervals'),
    ]);
    const specs = [
      payloadAt(hoursAgo(5), [aSet(benchId, 0, 60), aSet(squatId, 1, 100, { effort: null })]),
      payloadAt(hoursAgo(3), [aSet(benchId, 0, 80, { reps: 6, effort: null }), aSet(pullUpId, 1, 0, { reps: 8 })]),
      payloadAt(hoursAgo(1), [aSet(benchId, 0, 100)]),
    ];
    const withCardio = (payload: SessionPayload) => ({
      ...payload,
      sets: [
        ...payload.sets,
        aBout(runningId, payload.sets.length, { distanceM: 5500, effort: { type: 'cardio', level: 'hard' } }),
        anIntervalBout(sprintsId, payload.sets.length + 1, { workS: 20, restS: 40, rounds: 8 }, { effort: null }),
      ],
    });
    const [mixed, liftOnly] = await Promise.all([createTestUser(), createTestUser()]);
    await Promise.all([setBodyweight(mixed, 80), setBodyweight(liftOnly, 80)]);
    for (const index of [2, 0, 1]) await postSession(mixed, withCardio(withFreshIds(specs[index])));
    await syncInOrder(liftOnly, specs);

    const liftStateOf = async (userId: string) => {
      const snapshot = await normalizedSnapshot(userId);
      const liftSkills = await db`select id from public.skills where modality = 'lift'`;
      const liftSkillIds = new Set(liftSkills.map((row) => row.id));
      return {
        sets: snapshot.sets.filter((set) => (set as { duration_s?: number | null }).duration_s === null),
        userSkills: snapshot.userSkills.filter((row) => liftSkillIds.has(row.skill_id)),
        exerciseMaxes: snapshot.exerciseMaxes,
        repMaxes: snapshot.repMaxes,
        bodyweightRepRecords: snapshot.bodyweightRepRecords,
      };
    };
    expect(await liftStateOf(mixed.id)).toEqual(await liftStateOf(liftOnly.id));

    const cardioXp = await db`
      select s.key, x.xp from public.user_skills x join public.skills s on s.id = x.skill_id
      where x.user_id = ${mixed.id} and s.modality = 'cardio' order by s.key`;
    expect(cardioXp.map((row) => row.key)).toEqual(['agility', 'endurance']);

    const incremental = await normalizedSnapshot(mixed.id);
    expect((await rebuildCaches(mixed.id)).status).toBe(200);
    expect(await normalizedSnapshot(mixed.id)).toEqual(incremental);
  });
});

describe('prior state loaded from stored rows', () => {
  it('matches a rebuild after long gaps between sessions', async () => {
    const user = await createTestUser();
    await setBodyweight(user, 80);
    const oldest = withFreshIds(payloadAt(hoursAgo(3), [aSet(benchId, 0, 90)]));
    const older = withFreshIds(
      payloadAt(hoursAgo(2), [aSet(benchId, 0, 70, { reps: 8 }), aSet(pullUpId, 1, 0, { reps: 8 })]),
    );
    const recent = withFreshIds(payloadAt(hoursAgo(1), [aSet(pullUpId, 0, 0, { reps: 10 })]));
    for (const payload of [oldest, older, recent]) await postSession(user, payload);
    await ageSession(oldest.id, '130 days');
    await ageSession(older.id, '70 days');
    await ageSession(recent.id, '5 days');
    expect((await rebuildCaches(user.id)).status).toBe(200);

    const newest = withFreshIds(
      payloadAt(hoursAgo(1), [
        aSet(benchId, 0, 75, { reps: 6, effort: null }),
        aSet(pullUpId, 1, 0, { reps: 9, effort: null }),
      ]),
    );
    const middle = withFreshIds(
      payloadAt(hoursAgo(3), [aSet(benchId, 0, 72.5, { effort: null }), aSet(pullUpId, 1, 0, { reps: 11 })]),
    );
    await postSession(user, newest);
    await postSession(user, middle);

    const [middleBench] =
      await db`select e1rm_before_kg::float, rir_source from public.sets where id = ${middle.sets[0].id}`;
    expect(middleBench).toEqual({ e1rm_before_kg: 111, rir_source: 'estimated' });

    const incremental = await normalizedSnapshot(user.id);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await normalizedSnapshot(user.id)).toEqual(incremental);
  });
});

describe('strength cache', () => {
  async function expectStrengthCacheMatchesRebuild(userId: string) {
    const incremental = (await normalizedSnapshot(userId)).exerciseMaxes;
    expect((await rebuildCaches(userId)).status).toBe(200);
    expect((await normalizedSnapshot(userId)).exerciseMaxes).toEqual(incremental);
    return incremental;
  }

  it('stores the same exercise maxes as a rebuild through new, back-dated, edited and deleted sessions', async () => {
    const user = await createTestUser();
    await setBodyweight(user, 80);
    const first = withFreshIds(
      payloadAt(hoursAgo(30), [
        aSet(benchId, 0, 40, { isWarmup: true }),
        aSet(benchId, 1, 80),
        aSet(pullUpId, 2, 0, { reps: 8 }),
      ]),
    );
    const second = withFreshIds(payloadAt(hoursAgo(20), [aSet(squatId, 0, 100), aSet(pullUpId, 1, 0, { reps: 10 })]));
    const newest = withFreshIds(payloadAt(hoursAgo(10), [aSet(benchId, 0, 85)]));
    for (const payload of [first, second, newest]) await postSession(user, payload);
    const afterNewest = await expectStrengthCacheMatchesRebuild(user.id);
    expect(Object.keys(afterNewest)).toHaveLength(3);

    await postSession(
      user,
      withFreshIds(payloadAt(hoursAgo(25), [aSet(benchId, 0, 90, { reps: 3 }), aSet(squatId, 1, 105, { reps: 3 })])),
    );
    await expectStrengthCacheMatchesRebuild(user.id);

    const [{ revision }] = await db`select revision from public.sessions where id = ${second.id}`;
    const edited = await editSession(user, second, [{ ...second.sets[1], position: 0, reps: 12 }], revision);
    expect(edited.status, edited.rawBody).toBe(200);
    await expectStrengthCacheMatchesRebuild(user.id);

    const removed = await postFunction('delete-session', user.accessToken, { sessionId: newest.id });
    expect(removed.status, removed.rawBody).toBe(200);
    await expectStrengthCacheMatchesRebuild(user.id);

    await postSession(
      user,
      withFreshIds(payloadAt(hoursAgo(2), [aSet(squatId, 0, 110), aSet(pullUpId, 1, 0, { reps: 11 })])),
    );
    const afterLatest = await expectStrengthCacheMatchesRebuild(user.id);
    expect(Object.keys(afterLatest)).toHaveLength(3);
  });
});

describe('replay guards', () => {
  async function staleAndCorrupted(userId: string) {
    await db`update public.sessions set derived_balance_version = ${DEFAULT_BALANCE.version - 1} where user_id = ${userId}`;
    await db`update public.set_skill_xp set xp = xp + 1000 where user_id = ${userId}`;
    await db`update public.user_skills set xp = xp + 5000 where user_id = ${userId}`;
  }

  async function expectHealed(userId: string) {
    const healed = await normalizedSnapshot(userId);
    expect(healed.sessions.map((session) => session.derivedBalanceVersion)).toEqual(
      healed.sessions.map(() => DEFAULT_BALANCE.version),
    );
    expect((await rebuildCaches(userId)).status).toBe(200);
    expect(await normalizedSnapshot(userId)).toEqual(healed);
  }

  it('rebuilds stale derived rows before replaying a late sync', async () => {
    const user = await createTestUser();
    await postSession(user, withFreshIds(payloadAt(hoursAgo(5), [aSet(benchId, 0, 60)])));
    await postSession(user, withFreshIds(payloadAt(hoursAgo(3), [aSet(benchId, 0, 70)])));
    await staleAndCorrupted(user.id);

    await postSession(user, withFreshIds(payloadAt(hoursAgo(1), [aSet(benchId, 0, 62.5)])));

    await expectHealed(user.id);
  });

  it('rebuilds stale derived rows before replaying an edit', async () => {
    const user = await createTestUser();
    const first = withFreshIds(payloadAt(hoursAgo(5), [aSet(benchId, 0, 60)]));
    const second = withFreshIds(payloadAt(hoursAgo(3), [aSet(benchId, 0, 70)]));
    await postSession(user, first);
    await postSession(user, second);
    await staleAndCorrupted(user.id);

    await editSession(user, second, [{ ...second.sets[0], weightKg: 75 }]);

    await expectHealed(user.id);
  });

  it('rebuilds stale derived rows before replaying a delete', async () => {
    const user = await createTestUser();
    const first = withFreshIds(payloadAt(hoursAgo(5), [aSet(benchId, 0, 60)]));
    const second = withFreshIds(payloadAt(hoursAgo(3), [aSet(benchId, 0, 70)]));
    const third = withFreshIds(payloadAt(hoursAgo(1), [aSet(benchId, 0, 80)]));
    for (const payload of [first, second, third]) await postSession(user, payload);
    await staleAndCorrupted(user.id);

    const response = await postFunction('delete-session', user.accessToken, { sessionId: second.id });
    expect(response.status, response.rawBody).toBe(200);

    await expectHealed(user.id);
  });

  it('answers a self-healing edit or delete only for sessions from the changed one on', async () => {
    const user = await createTestUser();
    const sessions = [7, 5, 3, 1].map((hours) => withFreshIds(payloadAt(hoursAgo(hours), [aSet(benchId, 0, 60)])));
    for (const payload of sessions) await postSession(user, payload);
    const [first, second, third, fourth] = sessions;
    const dropOnRemovedSet = await grantDrop(user.id, first.id, randomUUID(), 'forged_scraps', 2, 'pr');

    await staleAndCorrupted(user.id);
    const edited = await editSession(user, second, [{ ...second.sets[0], weightKg: 75 }]);
    expect(edited.body.replayedSessionIds).toEqual([second.id, third.id, fourth.id]);
    expect(edited.body.revokedDrops).toEqual([]);

    await staleAndCorrupted(user.id);
    const deleted = await postFunction('delete-session', user.accessToken, { sessionId: third.id });
    expect(deleted.status, deleted.rawBody).toBe(200);
    expect(deleted.body.replayedSessionIds).toEqual([fourth.id]);
    expect(deleted.body.revokedDrops).toEqual([]);

    const [drop] = await db`select revoked_at from public.drops where id = ${dropOnRemovedSet.dropId}`;
    expect(drop.revoked_at).toBeNull();
  });

  it('serialises concurrent out-of-order syncs for one user', async () => {
    const earlier = payloadAt(hoursAgo(3), [aSet(benchId, 0, 80), aSet(squatId, 1, 100, { effort: null })]);
    const later = payloadAt(hoursAgo(1), [aSet(benchId, 0, 85, { effort: null }), aSet(squatId, 1, 110, { reps: 3 })]);
    const [concurrent, inOrder] = await Promise.all([createTestUser(), createTestUser()]);

    const payloads = [withFreshIds(later), withFreshIds(earlier)];
    const responses = await Promise.all(
      payloads.map((payload) => postCompleteSession(concurrent.accessToken, payload)),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    await syncInOrder(inOrder, [earlier, later]);

    expect(await normalizedSnapshot(concurrent.id)).toEqual(await normalizedSnapshot(inOrder.id));

    const loot = await lootSnapshot(concurrent.id);
    expect(loot.lootRolls.length).toBeGreaterThan(0);
    const retries = await Promise.all(payloads.map((payload) => postCompleteSession(concurrent.accessToken, payload)));
    expect(retries.map((response) => response.status)).toEqual([200, 200]);
    expect(await lootSnapshot(concurrent.id)).toEqual(loot);
  });
});
