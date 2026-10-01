import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { webCollectionCounts } from './collection-support.ts';
import { aBout, aSet, hoursAgo, payloadAt, postSession } from './loot-support.ts';
import { builtInExerciseId, createTestUser, db, setBodyweight, type TestUser } from './local-stack.ts';

const ids: Record<string, string> = {};

beforeAll(async () => {
  for (const key of [
    'barbell_bench_press',
    'back_squat',
    'weighted_dip',
    'pull_up',
    'leg_press',
    'cable_crunch',
    'running',
  ]) {
    ids[key] = await builtInExerciseId(key);
  }
});

afterAll(async () => {
  await db.end();
});

async function pin(user: TestUser, exerciseId: string, position: number): Promise<void> {
  const { error } = await user.client.from('pinned_exercises').insert({ exercise_id: exerciseId, position });
  expect(error).toBeNull();
}

async function customExercise(user: TestUser, archived: boolean): Promise<string> {
  const exerciseId = randomUUID();
  const [legs] = await db`select id from public.skills where key = 'legs'`;
  const saved = await user.client.rpc('save_custom_exercise', {
    exercise: {
      id: exerciseId,
      name: `Sled ${exerciseId.slice(0, 6)}`,
      loadType: 'external',
      equipment: 'other',
      shares: [{ skillId: legs.id, shareBp: 10000 }],
    },
  });
  expect(saved.error).toBeNull();
  if (archived) {
    const archive = await user.client.rpc('set_custom_exercise_archived', { exercise_id: exerciseId, archived: true });
    expect(archive.error).toBeNull();
  }
  return exerciseId;
}

async function expectParity(user: TestUser): Promise<void> {
  const { data, error } = await user.client.rpc('get_profile', { target: user.id });
  expect(error).toBeNull();
  const expected = await webCollectionCounts(user.id);
  expect(data.collection).toEqual(expected);
  expect(expected.totalSlots).toBeGreaterThan(0);
}

describe('collection parity between get_profile and the web rule', () => {
  it('matches for external lifts, including inexact slots and an undone pin', async () => {
    const user = await createTestUser();
    await postSession(user, payloadAt(hoursAgo(3), [aSet(ids.barbell_bench_press, 0, 60, { reps: 8 })]));
    await postSession(
      user,
      payloadAt(hoursAgo(1), [
        aSet(ids.barbell_bench_press, 0, 70, { reps: 3 }),
        aSet(ids.back_squat, 1, 100, { reps: 5 }),
      ]),
    );
    await pin(user, ids.leg_press, 0);
    await expectParity(user);
  });

  it('matches for bodyweight-plus and pure bodyweight lifts', async () => {
    const user = await createTestUser();
    await setBodyweight(user, 80);
    await postSession(
      user,
      payloadAt(hoursAgo(2), [aSet(ids.weighted_dip, 0, 10, { reps: 6 }), aSet(ids.pull_up, 1, 0, { reps: 9 })]),
    );
    await expectParity(user);
  });

  it('matches with a custom and an archived custom exercise', async () => {
    const user = await createTestUser();
    const [live, archived] = [await customExercise(user, false), await customExercise(user, false)];
    await postSession(
      user,
      payloadAt(hoursAgo(2), [aSet(live, 0, 40, { reps: 4 }), aSet(archived, 1, 60, { reps: 2 })]),
    );
    const archive = await user.client.rpc('set_custom_exercise_archived', { exercise_id: archived, archived: true });
    expect(archive.error).toBeNull();
    await customExercise(user, true);
    await expectParity(user);
  });

  it('matches and stays unchanged with a pinned and logged cardio exercise', async () => {
    const user = await createTestUser();
    await postSession(user, payloadAt(hoursAgo(2), [aSet(ids.barbell_bench_press, 0, 60, { reps: 3 })]));
    await pin(user, ids.back_squat, 0);
    const before = await webCollectionCounts(user.id);
    await pin(user, ids.running, 1);
    await postSession(
      user,
      payloadAt(hoursAgo(1), [aBout(ids.running, 0, { durationS: 1200, distanceM: 4000, effort: null })]),
    );
    await expectParity(user);
    expect(await webCollectionCounts(user.id)).toEqual(before);
  });

  it('matches for pins without sessions next to a logged lift', async () => {
    const user = await createTestUser();
    await setBodyweight(user, 75);
    await pin(user, ids.cable_crunch, 0);
    await pin(user, ids.pull_up, 1);
    await pin(user, ids.back_squat, 2);
    await postSession(user, payloadAt(hoursAgo(1), [aSet(ids.pull_up, 0, 0, { reps: 12 })]));
    await expectParity(user);
  });
});
