import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { builtInExerciseId, createTestUser, db, postCompleteSession, type TestUser } from './local-stack.ts';

let skillIds: Record<string, string>;

beforeAll(async () => {
  const rows = await db`select id, key from public.skills`;
  skillIds = Object.fromEntries(rows.map((row) => [row.key, row.id]));
});

afterAll(async () => {
  await db.end();
});

function customExercise(overrides: Record<string, unknown> = {}) {
  return {
    id: randomUUID(),
    name: `Landmine ${randomUUID().slice(0, 8)}`,
    loadType: 'external',
    equipment: 'other',
    shares: [
      { skillId: skillIds.shoulders, shareBp: 6000 },
      { skillId: skillIds.chest, shareBp: 4000 },
    ],
    ...overrides,
  };
}

async function save(user: TestUser, exercise: unknown) {
  return user.client.rpc('save_custom_exercise', { exercise });
}

async function setArchived(user: TestUser, exerciseId: string, archived: boolean) {
  return user.client.rpc('set_custom_exercise_archived', { exercise_id: exerciseId, archived });
}

async function ownedExerciseCount(userId: string): Promise<number> {
  const [row] = await db`select count(*)::int as count from public.exercises where owner_user_id = ${userId}`;
  return row.count;
}

function finishedSession(exerciseId: string, weightKg = 40) {
  const endedAt = new Date();
  return {
    id: randomUUID(),
    startedAt: new Date(endedAt.getTime() - 30 * 60 * 1000).toISOString(),
    endedAt: endedAt.toISOString(),
    sets: [{ id: randomUUID(), exerciseId, position: 0, weightKg, reps: 8, effort: { type: 'level', level: 'hard' } }],
  };
}

describe('save_custom_exercise creates', () => {
  it('stores an owned exercise with a null key and its shares, hidden from other users', async () => {
    const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    const exercise = customExercise();
    const { data, error } = await save(owner, exercise);
    expect(error).toBeNull();
    expect(data).toBe(exercise.id);

    const [row] = await db`select owner_user_id, key, name, load_type, equipment from public.exercises
                           where id = ${exercise.id}`;
    expect(row).toEqual({
      owner_user_id: owner.id,
      key: null,
      name: exercise.name,
      load_type: 'external',
      equipment: 'other',
    });
    const shares = await db`select skill_id, share_bp from public.exercise_skills where exercise_id = ${exercise.id}
                            order by share_bp desc`;
    expect(shares).toEqual([
      { skill_id: skillIds.shoulders, share_bp: 6000 },
      { skill_id: skillIds.chest, share_bp: 4000 },
    ]);

    const visible = await stranger.client.from('exercises').select('id').eq('id', exercise.id);
    const visibleShares = await stranger.client
      .from('exercise_skills')
      .select('skill_id')
      .eq('exercise_id', exercise.id);
    expect(visible.data).toEqual([]);
    expect(visibleShares.data).toEqual([]);
  });

  it('treats an identical retry of a create as a no-op', async () => {
    const user = await createTestUser();
    const exercise = customExercise();
    expect((await save(user, exercise)).error).toBeNull();
    expect((await save(user, exercise)).error).toBeNull();
    expect(await ownedExerciseCount(user.id)).toBe(1);
  });

  it('refuses the 101st custom exercise', async () => {
    const user = await createTestUser();
    await db.begin(async (tx) => {
      for (let index = 0; index < 100; index++) {
        const id = randomUUID();
        await tx`insert into public.exercises (id, name, load_type, equipment, owner_user_id)
                 values (${id}, ${`Bulk ${index}`}, 'external', 'other', ${user.id})`;
        await tx`insert into public.exercise_skills (exercise_id, skill_id, share_bp)
                 values (${id}, ${skillIds.chest}, 10000)`;
      }
    });
    const { error } = await save(user, customExercise());
    expect(error?.message).toBe('too_many_custom_exercises');
    expect(await ownedExerciseCount(user.id)).toBe(100);
  });
});

describe('save_custom_exercise rejects malformed input', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });

  const cases: [string, () => unknown][] = [
    ['shares as a string', () => customExercise({ shares: 'x' })],
    ['a string shareBp', () => customExercise({ shares: [{ skillId: skillIds.chest, shareBp: '5000' }] })],
    ['a numeric id', () => customExercise({ id: 42 })],
    ['a root array', () => [customExercise()]],
    ['an unknown load type', () => customExercise({ loadType: 'kettlebell' })],
    ['a non-uuid skillId', () => customExercise({ shares: [{ skillId: 'chest', shareBp: 10000 }] })],
    [
      'shares summing to 9999',
      () =>
        customExercise({
          shares: [
            { skillId: skillIds.shoulders, shareBp: 5999 },
            { skillId: skillIds.chest, shareBp: 4000 },
          ],
        }),
    ],
    [
      'a duplicate skill',
      () =>
        customExercise({
          shares: [
            { skillId: skillIds.chest, shareBp: 5000 },
            { skillId: skillIds.chest, shareBp: 5000 },
          ],
        }),
    ],
    [
      'seven shares',
      () =>
        customExercise({
          shares: Array.from({ length: 7 }, () => ({ skillId: randomUUID(), shareBp: 1000 })),
        }),
    ],
    ['an unknown skill', () => customExercise({ shares: [{ skillId: randomUUID(), shareBp: 10000 }] })],
    ['a whitespace-only name', () => customExercise({ name: '\t\n' })],
    ['a name with a control character', () => customExercise({ name: 'My\u0007Press' })],
    [
      'a fractional shareBp',
      () =>
        customExercise({
          shares: [
            { skillId: skillIds.shoulders, shareBp: 5000.5 },
            { skillId: skillIds.chest, shareBp: 4999.5 },
          ],
        }),
    ],
    ['an unknown equipment value', () => customExercise({ equipment: 'kettlebell' })],
    ['an empty shares array', () => customExercise({ shares: [] })],
  ];

  it.each(cases)('rejects %s with nothing written', async (_label, build) => {
    const { error } = await save(user, build());
    expect(error?.message).toBe('invalid_exercise');
    expect(await ownedExerciseCount(user.id)).toBe(0);
  });
});

describe('custom exercise names', () => {
  it('refuses a case-insensitive duplicate, including an archived one', async () => {
    const user = await createTestUser();
    const original = customExercise({ name: 'My Press' });
    expect((await save(user, original)).error).toBeNull();
    expect((await save(user, customExercise({ name: 'my press' }))).error?.message).toBe('name_taken');

    expect((await setArchived(user, original.id, true)).error).toBeNull();
    expect((await save(user, customExercise({ name: 'my press' }))).error?.message).toBe('name_taken');
    expect(await ownedExerciseCount(user.id)).toBe(1);
  });

  it('trims surrounding whitespace, including tabs and newlines, before comparing names', async () => {
    const user = await createTestUser();
    const original = customExercise({ name: 'My Press' });
    expect((await save(user, original)).error).toBeNull();
    expect((await save(user, customExercise({ name: '\tmy press\n' }))).error?.message).toBe('name_taken');
    const padded = customExercise({ name: '\n Cable Press\t' });
    expect((await save(user, padded)).error).toBeNull();
    const [row] = await db`select name from public.exercises where id = ${padded.id}`;
    expect(row.name).toBe('Cable Press');
  });

  it("allows a built-in exercise's name", async () => {
    const user = await createTestUser();
    expect((await save(user, customExercise({ name: 'Barbell Bench Press' }))).error).toBeNull();
  });
});

describe('custom exercise ownership', () => {
  it("refuses to update another user's exercise or a built-in", async () => {
    const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    const exercise = customExercise();
    await save(owner, exercise);

    expect((await save(stranger, { ...exercise, name: 'Stolen' })).error?.message).toBe('exercise_not_found');
    const benchId = await builtInExerciseId('barbell_bench_press');
    expect((await save(stranger, customExercise({ id: benchId }))).error?.message).toBe('exercise_not_found');
    expect((await setArchived(stranger, exercise.id, true)).error?.message).toBe('exercise_not_found');
    const [row] = await db`select name, archived_at from public.exercises where id = ${exercise.id}`;
    expect(row).toEqual({ name: exercise.name, archived_at: null });
  });

  it('denies direct inserts into exercises and exercise_skills', async () => {
    const user = await createTestUser();
    const id = randomUUID();
    const exerciseInsert = await user.client
      .from('exercises')
      .insert({ id, name: 'Direct', load_type: 'external', equipment: 'other', owner_user_id: user.id });
    const shareInsert = await user.client
      .from('exercise_skills')
      .insert({ exercise_id: await builtInExerciseId('barbell_bench_press'), skill_id: skillIds.core, share_bp: 1 });
    expect(exerciseInsert.error).not.toBeNull();
    expect(shareInsert.error).not.toBeNull();
    expect(await ownedExerciseCount(user.id)).toBe(0);
  });
});

describe('custom exercises after logging', () => {
  let user: TestUser;
  let exercise: ReturnType<typeof customExercise>;
  let sessionXp: object[];

  beforeAll(async () => {
    user = await createTestUser();
    exercise = customExercise();
    await save(user, exercise);
    const response = await postCompleteSession(user.accessToken, finishedSession(exercise.id));
    expect(response.status).toBe(200);
    sessionXp = await db`select set_id, skill_id, xp from public.set_skill_xp where user_id = ${user.id}
                         order by set_id, skill_id`;
  });

  it('locks the shares', async () => {
    const { error } = await save(user, {
      ...exercise,
      shares: [{ skillId: skillIds.shoulders, shareBp: 10000 }],
    });
    expect(error?.message).toBe('shares_locked');
  });

  it('locks the load type', async () => {
    expect((await save(user, { ...exercise, loadType: 'bodyweight_plus' })).error?.message).toBe('load_type_locked');
  });

  it('still allows a rename and leaves the logged XP unchanged', async () => {
    expect((await save(user, { ...exercise, name: 'Renamed Landmine' })).error).toBeNull();
    const [row] = await db`select name from public.exercises where id = ${exercise.id}`;
    expect(row.name).toBe('Renamed Landmine');
    const xpAfter = await db`select set_id, skill_id, xp from public.set_skill_xp where user_id = ${user.id}
                             order by set_id, skill_id`;
    expect(xpAfter).toEqual(sessionXp);
  });
});

describe('archiving custom exercises', () => {
  it('accepts archived exercises in complete-session and blocks new pins until unarchived', async () => {
    const user = await createTestUser();
    const exercise = customExercise();
    await save(user, exercise);
    expect((await setArchived(user, exercise.id, true)).error).toBeNull();

    const response = await postCompleteSession(user.accessToken, finishedSession(exercise.id));
    expect(response.status).toBe(200);

    const blockedPin = await user.client.from('pinned_exercises').insert({ exercise_id: exercise.id, position: 0 });
    expect(blockedPin.error).not.toBeNull();

    expect((await setArchived(user, exercise.id, false)).error).toBeNull();
    const allowedPin = await user.client.from('pinned_exercises').insert({ exercise_id: exercise.id, position: 0 });
    expect(allowedPin.error).toBeNull();
  });
});

describe('archive flag validation', () => {
  it('rejects a null archived flag instead of unarchiving', async () => {
    const user = await createTestUser();
    const exercise = customExercise();
    await save(user, exercise);
    await setArchived(user, exercise.id, true);
    const { error } = await user.client.rpc('set_custom_exercise_archived', {
      exercise_id: exercise.id,
      archived: null,
    });
    expect(error?.message).toBe('invalid_exercise');
    const [row] = await db`select archived_at from public.exercises where id = ${exercise.id}`;
    expect(row.archived_at).not.toBeNull();
  });
});

describe('archived exercises of other users', () => {
  it("returns 422 from complete-session for another user's archived exercise", async () => {
    const [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    const exercise = customExercise();
    await save(owner, exercise);
    await setArchived(owner, exercise.id, true);
    const response = await postCompleteSession(stranger.accessToken, finishedSession(exercise.id));
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('unknown_exercise');
  });
});

describe('reorder_pins', () => {
  let owner: TestUser;
  let stranger: TestUser;
  let pinIds: string[];

  async function positions(userId: string) {
    const rows = await db`select exercise_id, position from public.pinned_exercises where user_id = ${userId}
                          order by position`;
    return rows.map((row) => [row.exercise_id, row.position]);
  }

  beforeAll(async () => {
    [owner, stranger] = await Promise.all([createTestUser(), createTestUser()]);
    pinIds = await Promise.all(['back_squat', 'deadlift', 'barbell_row'].map(builtInExerciseId));
    for (const [index, exerciseId] of pinIds.entries()) {
      const { error } = await owner.client
        .from('pinned_exercises')
        .insert({ exercise_id: exerciseId, position: index * 5 });
      expect(error).toBeNull();
    }
  });

  it('renumbers every pin 0..n-1 in the given order', async () => {
    const order = [pinIds[2], pinIds[0], pinIds[1]];
    expect((await owner.client.rpc('reorder_pins', { exercise_ids: order })).error).toBeNull();
    expect(await positions(owner.id)).toEqual(order.map((exerciseId, index) => [exerciseId, index]));
  });

  it('refuses a missing or foreign exercise id', async () => {
    const before = await positions(owner.id);
    const missing = await owner.client.rpc('reorder_pins', { exercise_ids: pinIds.slice(0, 2) });
    const foreign = await owner.client.rpc('reorder_pins', { exercise_ids: [...pinIds.slice(0, 2), randomUUID()] });
    const duplicated = await owner.client.rpc('reorder_pins', { exercise_ids: [pinIds[0], pinIds[0], pinIds[1]] });
    expect(missing.error?.message).toBe('invalid_pins');
    expect(foreign.error?.message).toBe('invalid_pins');
    expect(duplicated.error?.message).toBe('invalid_pins');
    expect(await positions(owner.id)).toEqual(before);
  });

  it("never touches another user's pins", async () => {
    const before = await positions(owner.id);
    const { error } = await stranger.client.rpc('reorder_pins', { exercise_ids: [...pinIds].reverse() });
    expect(error?.message).toBe('invalid_pins');
    expect((await stranger.client.rpc('reorder_pins', { exercise_ids: [] })).error).toBeNull();
    expect(await positions(owner.id)).toEqual(before);
  });
});
