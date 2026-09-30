import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  builtInExerciseId,
  createTestUser,
  db,
  env,
  postCompleteSession,
  type TestUser,
} from './local-stack.ts';

const TEST_PASSWORD = 'correct-horse-battery';

const USER_TABLES: { table: string; column: string }[] = [
  { table: 'profiles', column: 'id' },
  { table: 'profile_private', column: 'user_id' },
  { table: 'sessions', column: 'user_id' },
  { table: 'sets', column: 'user_id' },
  { table: 'set_skill_xp', column: 'user_id' },
  { table: 'user_skills', column: 'user_id' },
  { table: 'exercise_maxes', column: 'user_id' },
  { table: 'rep_maxes', column: 'user_id' },
  { table: 'bodyweight_rep_records', column: 'user_id' },
  { table: 'pinned_exercises', column: 'user_id' },
  { table: 'exercises', column: 'owner_user_id' },
  { table: 'programs', column: 'owner_user_id' },
];

async function post(name: string, accessToken: string | null, body: unknown) {
  const response = await fetch(`${env.FUNCTIONS_URL}/${name}`, {
    method: 'POST',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      apikey: env.ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

async function logOneSession(user: TestUser): Promise<string> {
  const sessionId = randomUUID();
  const endedAt = new Date();
  const response = await postCompleteSession(user.accessToken, {
    id: sessionId,
    startedAt: new Date(endedAt.getTime() - 30 * 60 * 1000).toISOString(),
    endedAt: endedAt.toISOString(),
    sets: [
      {
        id: randomUUID(),
        exerciseId: await builtInExerciseId('barbell_bench_press'),
        position: 0,
        weightKg: 60,
        reps: 8,
        effort: { type: 'rpe', value: 8 },
      },
    ],
  });
  expect(response.status).toBe(200);
  return sessionId;
}

async function giveUserEverything(user: TestUser): Promise<void> {
  await logOneSession(user);
  const benchId = await builtInExerciseId('barbell_bench_press');
  const pin = await user.client.from('pinned_exercises').insert({ exercise_id: benchId, position: 0 });
  expect(pin.error).toBeNull();
  const exerciseId = randomUUID();
  const [shoulders] = await db`select id from public.skills where key = 'shoulders'`;
  const custom = await user.client.rpc('save_custom_exercise', {
    exercise: {
      id: exerciseId,
      name: `Landmine ${exerciseId.slice(0, 6)}`,
      loadType: 'external',
      equipment: 'other',
      shares: [{ skillId: shoulders.id, shareBp: 10000 }],
    },
  });
  expect(custom.error).toBeNull();
  const [template] = await db`select id from public.programs where owner_user_id is null limit 1`;
  const copy = await user.client.rpc('copy_program', { source_program_id: template.id, new_program_id: randomUUID() });
  expect(copy.error).toBeNull();
}

async function rowCounts(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { table, column } of USER_TABLES) {
    const [row] = await db`select count(*)::int as count from ${db('public.' + table)} where ${db(column)} = ${userId}`;
    counts[table] = row.count;
  }
  const [days] = await db`
    select count(*)::int as count from public.program_days d
    join public.programs p on p.id = d.program_id where p.owner_user_id = ${userId}`;
  const [dayExercises] = await db`
    select count(*)::int as count from public.program_day_exercises x
    join public.program_days d on d.id = x.day_id
    join public.programs p on p.id = d.program_id where p.owner_user_id = ${userId}`;
  counts.program_days = days.count;
  counts.program_day_exercises = dayExercises.count;
  return counts;
}

async function orphanedRows(exerciseIds: string[], programIds: string[]): Promise<number> {
  const [shares] =
    await db`select count(*)::int as count from public.exercise_skills where exercise_id = any(${exerciseIds})`;
  const [days] = await db`select count(*)::int as count from public.program_days where program_id = any(${programIds})`;
  return shares.count + days.count;
}

async function sharedCatalogCounts() {
  const [exercises] = await db`select count(*)::int as count from public.exercises where owner_user_id is null`;
  const [templates] = await db`select count(*)::int as count from public.programs where owner_user_id is null`;
  const [templateDays] = await db`
    select count(*)::int as count from public.program_days d join public.programs p on p.id = d.program_id
    where p.owner_user_id is null`;
  return { exercises: exercises.count, templates: templates.count, templateDays: templateDays.count };
}

let owner: TestUser;
let bystander: TestUser;

beforeAll(async () => {
  owner = await createTestUser();
  bystander = await createTestUser();
  await giveUserEverything(owner);
  await giveUserEverything(bystander);
});

afterAll(async () => {
  await db.end();
});

describe('export-data', () => {
  it('needs a signed-in user', async () => {
    const response = await post('export-data', null, {});
    expect(response.status).toBe(401);
  });

  it("exports the caller's own rows and nobody else's", async () => {
    const response = await post('export-data', owner.accessToken, {});
    expect(response.status).toBe(200);
    const exported = response.body;
    expect(exported.format).toBe('gainscape-export');
    expect(exported.userId).toBe(owner.id);
    expect(exported.profile.username).toBe(owner.username);
    expect(exported.account.email).toBe(`${owner.username}@example.test`);
    expect(exported.sessions).toHaveLength(1);
    expect(exported.sets).toHaveLength(1);
    expect(exported.sets[0].effort_input_type).toBe('rpe');
    expect(exported.pinnedExercises).toHaveLength(1);
    expect(exported.customExercises).toHaveLength(1);
    expect(exported.customExercises[0].shares).toEqual([{ skill: 'shoulders', share_bp: 10000 }]);
    expect(exported.programs.length).toBeGreaterThan(0);
    expect(exported.programs[0].days.length).toBeGreaterThan(0);
    const everyUserId = JSON.stringify(exported).match(new RegExp(bystander.id, 'g'));
    expect(everyUserId).toBeNull();
  });
});

describe('delete-account', () => {
  it('refuses when the typed username does not match', async () => {
    const response = await post('delete-account', owner.accessToken, {
      confirmUsername: bystander.username,
      password: TEST_PASSWORD,
    });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('confirmation_mismatch');
    const counts = await rowCounts(owner.id);
    expect(counts.profiles).toBe(1);
    expect(counts.sessions).toBe(1);
  });

  it('refuses when the password is wrong', async () => {
    const response = await post('delete-account', owner.accessToken, {
      confirmUsername: owner.username,
      password: 'not-the-password',
    });
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('wrong_password');
    expect((await rowCounts(owner.id)).profiles).toBe(1);
  });

  it('refuses a malformed body', async () => {
    const response = await post('delete-account', owner.accessToken, {});
    expect(response.status).toBe(422);
  });

  it('deletes the account and every row it owned, leaving other users alone', async () => {
    const bystanderBefore = await rowCounts(bystander.id);
    const catalogBefore = await sharedCatalogCounts();
    const ownedExerciseIds = (await db`select id from public.exercises where owner_user_id = ${owner.id}`).map(
      (row) => row.id as string,
    );
    const ownedProgramIds = (await db`select id from public.programs where owner_user_id = ${owner.id}`).map(
      (row) => row.id as string,
    );
    expect(ownedExerciseIds).toHaveLength(1);
    expect(ownedProgramIds.length).toBeGreaterThan(0);
    const response = await post('delete-account', owner.accessToken, {
      confirmUsername: owner.username.toUpperCase(),
      password: TEST_PASSWORD,
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ deleted: true });

    const counts = await rowCounts(owner.id);
    expect(Object.values(counts).every((count) => count === 0)).toBe(true);
    const [authRow] = await db`select count(*)::int as count from auth.users where id = ${owner.id}`;
    expect(authRow.count).toBe(0);
    const lookup = await admin.auth.admin.getUserById(owner.id);
    expect(lookup.data.user).toBeNull();
    expect(await rowCounts(bystander.id)).toEqual(bystanderBefore);
    expect(await orphanedRows(ownedExerciseIds, ownedProgramIds)).toBe(0);
    expect(await sharedCatalogCounts()).toEqual(catalogBefore);
  });

  it('finds nothing to export for the deleted user, even with a still-unexpired token', async () => {
    const response = await post('export-data', owner.accessToken, {});
    expect(response.status).toBe(404);
  });
});
