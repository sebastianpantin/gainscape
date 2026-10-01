import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ageSession,
  builtInExerciseId,
  createTestUser,
  db,
  lootSnapshot,
  normalizedSnapshot,
  postCompleteSession,
  rebuildCaches,
  setBodyweight,
  type TestUser,
} from './local-stack.ts';
import { HOUR_MS, postSession } from './loot-support.ts';

type Effort = { type: 'level'; level: 'hard' | 'near_failure' } | null;

interface SetSpec {
  exerciseId: string;
  weightKg: number;
  reps: number;
  effort: Effort;
  isWarmup?: boolean;
}

interface SessionSpec {
  startedAt: string;
  sets: SetSpec[];
}

const hard = { type: 'level', level: 'hard' } as const;

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * HOUR_MS).toISOString();
}

function sessionSpec(startedAt: string, sets: SetSpec[]): SessionSpec {
  return { startedAt, sets };
}

function payloadFor(spec: SessionSpec) {
  return {
    id: randomUUID(),
    startedAt: spec.startedAt,
    endedAt: new Date(Date.parse(spec.startedAt) + HOUR_MS / 2).toISOString(),
    notes: null,
    sets: spec.sets.map((set, position) => ({
      id: randomUUID(),
      exerciseId: set.exerciseId,
      position,
      weightKg: set.weightKg,
      reps: set.reps,
      isWarmup: set.isWarmup ?? false,
      effort: set.effort,
    })),
  };
}

async function syncInOrder(user: TestUser, specs: SessionSpec[]) {
  const ordered = [...specs].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  for (const spec of ordered) await postSession(user, payloadFor(spec));
}

async function storedSummary(sessionId: string) {
  const [row] = await db`select summary from public.sessions where id = ${sessionId}`;
  return row.summary;
}

async function rowCountsFor(userId: string) {
  const [counts] = await db`
    select
      (select count(*) from public.sessions where user_id = ${userId})::int as sessions,
      (select count(*) from public.sets where user_id = ${userId})::int as sets,
      (select count(*) from public.set_skill_xp where user_id = ${userId})::int as set_skill_xp,
      (select count(*) from public.user_skills where user_id = ${userId})::int as user_skills,
      (select count(*) from public.rep_maxes where user_id = ${userId})::int as rep_maxes,
      (select count(*) from public.exercise_maxes where user_id = ${userId})::int as exercise_maxes`;
  return counts;
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
    const s1 = sessionSpec(hoursAgo(5), [
      { exerciseId: benchId, weightKg: 60, reps: 5, effort: hard },
      { exerciseId: squatId, weightKg: 100, reps: 5, effort: null },
    ]);
    const s2 = sessionSpec(hoursAgo(3), [
      { exerciseId: benchId, weightKg: 80, reps: 6, effort: null },
      { exerciseId: pullUpId, weightKg: 0, reps: 8, effort: hard },
    ]);
    const s3 = sessionSpec(hoursAgo(1), [{ exerciseId: benchId, weightKg: 100, reps: 5, effort: hard }]);
    const [outOfOrder, inOrder] = await Promise.all([createTestUser(), createTestUser()]);
    await Promise.all([setBodyweight(outOfOrder, 80), setBodyweight(inOrder, 80)]);

    for (const spec of [s3, s1, s2]) await postSession(outOfOrder, payloadFor(spec));
    await syncInOrder(inOrder, [s1, s2, s3]);

    expect(await normalizedSnapshot(outOfOrder.id)).toEqual(await normalizedSnapshot(inOrder.id));
  });

  it('re-derives a later session when an earlier one syncs late', async () => {
    const user = await createTestUser();
    const late = payloadFor(sessionSpec(hoursAgo(1), [{ exerciseId: benchId, weightKg: 100, reps: 5, effort: hard }]));
    const early = payloadFor(sessionSpec(hoursAgo(5), [{ exerciseId: benchId, weightKg: 60, reps: 5, effort: hard }]));

    const lateResponse = await postSession(user, late);
    expect(lateResponse.body.prs).toEqual([]);
    await postSession(user, early);

    const [row] = await db`
      select e1rm_before_kg::float, e1rm_candidate_kg::float, xp_awarded from public.sets where id = ${late.sets[0].id}`;
    expect(row).toEqual({ e1rm_before_kg: 74, e1rm_candidate_kg: 81.4, xp_awarded: 1290 });
    const [max] =
      await db`select e1rm_kg::float from public.exercise_maxes where user_id = ${user.id} and exercise_id = ${benchId}`;
    expect(max.e1rm_kg).toBe(81.4);
    expect((await storedSummary(late.id)).prs).toEqual([
      { exerciseId: benchId, kind: 'rep_max', reps: 5, loadKg: 100, previousLoadKg: 60, previousReps: null },
    ]);

    const retry = await postSession(user, late);
    expect(retry.body).toEqual(await storedSummary(late.id));
    expect(retry.body.prs).toHaveLength(1);
    expect(retry.rawBody).not.toBe(lateResponse.rawBody);
  });

  it('judges records against earlier sessions only', async () => {
    const user = await createTestUser();
    const later = payloadFor(sessionSpec(hoursAgo(1), [{ exerciseId: benchId, weightKg: 105, reps: 5, effort: hard }]));
    const earlier = payloadFor(
      sessionSpec(hoursAgo(3), [{ exerciseId: benchId, weightKg: 100, reps: 5, effort: hard }]),
    );
    await postSession(user, later);
    const earlierResponse = await postSession(user, earlier);

    expect(earlierResponse.body.prs).toEqual([]);
    expect((await storedSummary(later.id)).prs).toEqual([
      { exerciseId: benchId, kind: 'rep_max', reps: 5, loadKg: 105, previousLoadKg: 100, previousReps: null },
    ]);
    const [slot] = await db`
      select load_kg::float, set_id from public.rep_maxes
      where user_id = ${user.id} and exercise_id = ${benchId} and reps = 5`;
    expect(slot).toEqual({ load_kg: 105, set_id: later.sets[0].id });
  });

  it('recomputes level-ups in later summaries', async () => {
    const lateSpec = sessionSpec(hoursAgo(1), [{ exerciseId: cableCrunchId, weightKg: 30, reps: 8, effort: null }]);
    const earlySpec = sessionSpec(hoursAgo(3), [{ exerciseId: cableCrunchId, weightKg: 30, reps: 8, effort: hard }]);
    const [outOfOrder, inOrder] = await Promise.all([createTestUser(), createTestUser()]);
    const late = payloadFor(lateSpec);
    const early = payloadFor(earlySpec);

    const lateResponse = await postSession(outOfOrder, late);
    expect(lateResponse.body).toMatchObject({
      xpBySkill: { core: 340 },
      levelUps: [{ skill: 'core', from: 1, to: 4 }],
    });
    const earlyResponse = await postSession(outOfOrder, early);
    expect(earlyResponse.body).toMatchObject({
      xpBySkill: { core: 1020 },
      levelUps: [{ skill: 'core', from: 1, to: 9 }],
    });
    const [earlySet] = await db`select e1rm_candidate_kg::float from public.sets where id = ${early.sets[0].id}`;
    expect(earlySet.e1rm_candidate_kg).toBe(40);
    const [lateSet] =
      await db`select rir::float, rir_source, effective_reps, xp_awarded from public.sets where id = ${late.sets[0].id}`;
    expect(lateSet).toEqual({ rir: 3, rir_source: 'estimated', effective_reps: 3, xp_awarded: 1020 });
    expect(await storedSummary(late.id)).toMatchObject({
      xpBySkill: { core: 1020 },
      levelUps: [{ skill: 'core', from: 9, to: 13 }],
    });
    const [skill] = await db`
      select us.xp::int from public.user_skills us join public.skills s on s.id = us.skill_id
      where us.user_id = ${outOfOrder.id} and s.key = 'core'`;
    expect(skill.xp).toBe(2040);

    await syncInOrder(inOrder, [lateSpec, earlySpec]);
    expect((await normalizedSnapshot(outOfOrder.id)).sessions).toEqual((await normalizedSnapshot(inOrder.id)).sessions);
  });

  it('merges the rewritten summary into the stored one', async () => {
    const user = await createTestUser();
    const later = payloadFor(sessionSpec(hoursAgo(1), [{ exerciseId: benchId, weightKg: 80, reps: 5, effort: null }]));
    await postSession(user, later);
    await db`update public.sessions set summary = summary || '{"extra": {"k": 1}}' where id = ${later.id}`;
    const before = await storedSummary(later.id);

    await postSession(
      user,
      payloadFor(sessionSpec(hoursAgo(3), [{ exerciseId: benchId, weightKg: 80, reps: 5, effort: hard }])),
    );

    const after = await storedSummary(later.id);
    expect(after.extra).toEqual({ k: 1 });
    expect(after.drops).toEqual(before.drops);
    expect(after.sessionId).toBe(later.id);
    expect(after.xpBySkill).not.toEqual(before.xpBySkill);
  });
});

describe('prior state loaded from stored rows', () => {
  it('matches a rebuild after long gaps between sessions', async () => {
    const user = await createTestUser();
    await setBodyweight(user, 80);
    const oldest = payloadFor(sessionSpec(hoursAgo(3), [{ exerciseId: benchId, weightKg: 90, reps: 5, effort: hard }]));
    const older = payloadFor(
      sessionSpec(hoursAgo(2), [
        { exerciseId: benchId, weightKg: 70, reps: 8, effort: hard },
        { exerciseId: pullUpId, weightKg: 0, reps: 8, effort: hard },
      ]),
    );
    const recent = payloadFor(
      sessionSpec(hoursAgo(1), [{ exerciseId: pullUpId, weightKg: 0, reps: 10, effort: hard }]),
    );
    for (const payload of [oldest, older, recent]) await postSession(user, payload);
    await ageSession(oldest.id, '130 days');
    await ageSession(older.id, '70 days');
    await ageSession(recent.id, '5 days');
    expect((await rebuildCaches(user.id)).status).toBe(200);

    const newest = payloadFor(
      sessionSpec(hoursAgo(1), [
        { exerciseId: benchId, weightKg: 75, reps: 6, effort: null },
        { exerciseId: pullUpId, weightKg: 0, reps: 9, effort: null },
      ]),
    );
    const middle = payloadFor(
      sessionSpec(hoursAgo(3), [
        { exerciseId: benchId, weightKg: 72.5, reps: 5, effort: null },
        { exerciseId: pullUpId, weightKg: 0, reps: 11, effort: hard },
      ]),
    );
    await postSession(user, newest);
    await postSession(user, middle);

    const [middleBench] =
      await db`select e1rm_before_kg::float, rir_source from public.sets where id = ${middle.sets[0].id}`;
    expect(middleBench).toEqual({ e1rm_before_kg: 93.33, rir_source: 'estimated' });

    const incremental = await normalizedSnapshot(user.id);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await normalizedSnapshot(user.id)).toEqual(incremental);
  });
});

describe('replay guards', () => {
  it('refuses to replay over derived rows from an older balance version until a rebuild', async () => {
    const user = await createTestUser();
    const first = payloadFor(sessionSpec(hoursAgo(3), [{ exerciseId: benchId, weightKg: 60, reps: 5, effort: hard }]));
    await postSession(user, first);
    await db`update public.sessions set derived_balance_version = 1 where id = ${first.id}`;
    const before = await rowCountsFor(user.id);

    const next = payloadFor(sessionSpec(hoursAgo(1), [{ exerciseId: benchId, weightKg: 62.5, reps: 5, effort: hard }]));
    const refused = await postCompleteSession(user.accessToken, next);
    expect(refused.status).toBe(503);
    expect(refused.body.error).toBe('rebuild_required');
    expect(await rowCountsFor(user.id)).toEqual(before);

    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect((await postCompleteSession(user.accessToken, next)).status).toBe(200);
  });

  it('serialises concurrent out-of-order syncs for one user', async () => {
    const earlier = sessionSpec(hoursAgo(3), [
      { exerciseId: benchId, weightKg: 80, reps: 5, effort: hard },
      { exerciseId: squatId, weightKg: 100, reps: 5, effort: null },
    ]);
    const later = sessionSpec(hoursAgo(1), [
      { exerciseId: benchId, weightKg: 85, reps: 5, effort: null },
      { exerciseId: squatId, weightKg: 110, reps: 3, effort: hard },
    ]);
    const [concurrent, inOrder] = await Promise.all([createTestUser(), createTestUser()]);

    const payloads = [payloadFor(later), payloadFor(earlier)];
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
