import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  admin,
  builtInExerciseId,
  createTestUser,
  db,
  env,
  fetchFunction,
  grantDrop,
  postCompleteSession,
  postFunction,
  TEST_PASSWORD,
  type TestUser,
} from './local-stack.ts';
import { createCustomExercise } from './session-support.ts';

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
  { table: 'cardio_records', column: 'user_id' },
  { table: 'bodyweight_entries', column: 'user_id' },
  { table: 'pinned_exercises', column: 'user_id' },
  { table: 'exercise_notes', column: 'user_id' },
  { table: 'weekly_goals', column: 'user_id' },
  { table: 'exercises', column: 'owner_user_id' },
  { table: 'programs', column: 'owner_user_id' },
  { table: 'deleted_sessions', column: 'user_id' },
  { table: 'loot_rolls', column: 'user_id' },
  { table: 'drops', column: 'user_id' },
  { table: 'drop_luck', column: 'user_id' },
  { table: 'user_items', column: 'user_id' },
  { table: 'item_ledger', column: 'user_id' },
  { table: 'user_loadout', column: 'user_id' },
  { table: 'events', column: 'user_id' },
  { table: 'friendships', column: 'requester_id' },
  { table: 'friendships', column: 'addressee_id' },
  { table: 'crafts', column: 'user_id' },
  { table: 'reactions', column: 'user_id' },
];

async function post(name: string, accessToken: string | null, body: unknown) {
  const response = await fetchFunction(name, {
    method: 'POST',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      apikey: env.PUBLISHABLE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: JSON.parse(response.rawBody) };
}

async function logOneSession(user: TestUser, weightKg = 60): Promise<string> {
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
        weightKg,
        reps: 8,
        effort: { type: 'rpe', value: 8 },
      },
    ],
  });
  expect(response.status).toBe(200);
  return sessionId;
}

async function logRun(user: TestUser, hoursAgo: number, durationS: number): Promise<void> {
  const startedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
  const response = await postCompleteSession(user.accessToken, {
    id: randomUUID(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + durationS * 1000).toISOString(),
    sets: [
      {
        kind: 'cardio',
        id: randomUUID(),
        exerciseId: await builtInExerciseId('running'),
        position: 0,
        durationS,
        distanceM: 5000,
        interval: null,
        effort: null,
      },
    ],
  });
  expect(response.status).toBe(200);
}

async function giveUserEverything(user: TestUser): Promise<void> {
  await logRun(user, 6, 1800);
  const bodyweight = await user.client.from('profile_private').update({ bodyweight_kg: 82 }).eq('user_id', user.id);
  expect(bodyweight.error).toBeNull();
  const keptSessionId = await logOneSession(user);
  await logOneSession(user, 80);
  await grantDrop(user.id, keptSessionId, randomUUID(), 'scroll_pause_squat', 1, 'pr');
  await db`
    insert into public.drop_luck (user_id, drop_table_id, dry_rolls)
    select ${user.id}, id, 3 from public.drop_tables where key = 'regular'
    on conflict (user_id, drop_table_id) do nothing`;
  await grantDrop(user.id, keptSessionId, randomUUID(), 'rookie_belt', 1);
  await grantDrop(user.id, keptSessionId, randomUUID(), 'grinder_scraps', 8);
  const [recipe] = await db`select id from public.recipes where key = 'grinder_belt'`;
  const crafted = await user.client.rpc('craft', { recipe_id: recipe.id });
  expect(crafted.error).toBeNull();
  const equipped = await user.client.rpc('equip_gear', { slot: 'belt', item_id: crafted.data.itemId });
  expect(equipped.error).toBeNull();
  const removed = await postFunction('delete-session', user.accessToken, { sessionId: await logOneSession(user) });
  expect(removed.status).toBe(200);
  const benchId = await builtInExerciseId('barbell_bench_press');
  const pin = await user.client.from('pinned_exercises').insert({ exercise_id: benchId, position: 0 });
  expect(pin.error).toBeNull();
  const note = await user.client.rpc('save_exercise_note', { exercise_id: benchId, body: 'Seat 4' });
  expect(note.error).toBeNull();
  const goal = await user.client.rpc('set_weekly_session_goal', { goal: 3 });
  expect(goal.error).toBeNull();
  await createCustomExercise(user, { skillKey: 'shoulders' });
  const [template] = await db`select id from public.programs where owner_user_id is null limit 1`;
  const copy = await user.client.rpc('copy_program', { source_program_id: template.id, new_program_id: randomUUID() });
  expect(copy.error).toBeNull();
  const [requested, friend] = await Promise.all([createTestUser(), createTestUser()]);
  const outgoing = await user.client.rpc('send_friend_request', { username: requested.username });
  expect(outgoing.data).toMatchObject({ status: 'sent' });
  const incoming = await friend.client.rpc('send_friend_request', { username: user.username });
  expect(incoming.data).toMatchObject({ status: 'sent' });
  const accepted = await user.client.rpc('respond_friend_request', { requester_id: friend.id, accept: true });
  expect(accepted.data).toMatchObject({ status: 'accepted' });
  const friendSession = await logOneSession(friend);
  const [friendEvent] = await db`
    insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
    values (${friend.id}, ${friendSession}, 'level:back', 'level_up', now(), '{"skill": "back", "from": 9, "to": 10}')
    on conflict (session_id, event_key) do update set updated_at = now()
    returning id`;
  const gz = await user.client.rpc('set_gz', { event_id: friendEvent.id, given: true });
  expect(gz.data).toMatchObject({ gzCount: 1 });
}

async function rowCounts(userId: string): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const { table, column } of USER_TABLES) {
    const [row] = await db`select count(*)::int as count from ${db('public.' + table)} where ${db(column)} = ${userId}`;
    const shared = USER_TABLES.filter((entry) => entry.table === table).length > 1;
    counts[shared ? `${table}.${column}` : table] = row.count;
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

async function rateLimitRows(userId: string): Promise<number> {
  const [row] = await db`select count(*)::int as count from private.rate_limit_hits where subject = ${userId}`;
  return row.count;
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
    expect(exported.version).toBe(6);
    expect(exported.sessions).toHaveLength(3);
    expect(exported.deletedSessions).toHaveLength(1);
    expect(exported.sets).toHaveLength(3);
    expect(exported.sets.filter((set: { effort_input_type: string }) => set.effort_input_type === 'rpe')).toHaveLength(
      2,
    );
    expect(exported.pinnedExercises).toHaveLength(1);
    expect(exported.exerciseNotes).toHaveLength(1);
    expect(exported.exerciseNotes[0].body).toBe('Seat 4');
    expect(exported.customExercises).toHaveLength(1);
    expect(exported.customExercises[0].shares).toEqual([{ skill: 'shoulders', share_bp: 10000 }]);
    expect(exported.programs.length).toBeGreaterThan(0);
    expect(exported.programs[0].days.length).toBeGreaterThan(0);
    const counts = await rowCounts(owner.id);
    expect(exported.lootRolls).toHaveLength(counts.loot_rolls);
    expect(exported.drops).toHaveLength(counts.drops);
    expect(exported.dropLuck).toHaveLength(counts.drop_luck);
    expect(exported.userItems).toHaveLength(counts.user_items);
    expect(exported.itemLedger).toHaveLength(counts.item_ledger);
    expect(exported.userLoadout).toEqual([
      expect.objectContaining({ slot: 'belt', item_id: expect.any(String), equipped_at: expect.any(String) }),
    ]);
    expect(counts.user_loadout).toBe(1);
    expect(exported).not.toHaveProperty('userUnlocks');
    expect(exported.events).toHaveLength(counts.events);
    expect(exported.cardioRecords).toHaveLength(counts.cardio_records);
    expect(counts.cardio_records).toBeGreaterThan(0);
    expect(exported.bodyweightEntries).toEqual([
      { logged_on: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), bodyweight_kg: 82, updated_at: expect.any(String) },
    ]);
    expect(exported.weeklyGoals).toEqual([
      { effective_from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), goal: 3, updated_at: expect.any(String) },
    ]);
    expect(exported.crafts).toHaveLength(1);
    expect(exported.reactionsGiven).toHaveLength(1);
    expect(Object.keys(exported.reactionsGiven[0]).sort()).toEqual(['created_at', 'event_id']);
    expect(
      exported.friendships.map((row: { direction: string; status: string }) => `${row.direction}:${row.status}`).sort(),
    ).toEqual(['incoming:accepted', 'outgoing:pending']);
    expect(Object.keys(exported.friendships[0]).sort()).toEqual(
      ['createdAt', 'direction', 'otherUserId', 'otherUsername', 'respondedAt', 'status'].sort(),
    );
    expect(exported.events.some((event: { type: string }) => event.type === 'pr')).toBe(true);
    expect(exported.drops.some((drop: { source: string }) => drop.source === 'pr')).toBe(true);
    const everyUserId = JSON.stringify(exported).match(new RegExp(bystander.id, 'g'));
    expect(everyUserId).toBeNull();
  });
});

describe('export-data and declined requests', () => {
  it('shows a declined outgoing request as pending and leaves out a withdrawn one', async () => {
    const [requester, addressee] = await Promise.all([createTestUser(), createTestUser()]);
    await requester.client.rpc('send_friend_request', { username: addressee.username });
    const declined = await addressee.client.rpc('respond_friend_request', {
      requester_id: requester.id,
      accept: false,
    });
    expect(declined.data).toMatchObject({ status: 'declined' });

    const exported = await post('export-data', requester.accessToken, {});
    expect(exported.status).toBe(200);
    expect(exported.body.friendships).toEqual([
      expect.objectContaining({
        otherUserId: addressee.id,
        direction: 'outgoing',
        status: 'pending',
        respondedAt: null,
      }),
    ]);
    const addresseeExport = await post('export-data', addressee.accessToken, {});
    expect(addresseeExport.body.friendships).toEqual([
      expect.objectContaining({ otherUserId: requester.id, direction: 'incoming', status: 'declined' }),
    ]);

    expect((await requester.client.rpc('remove_friend', { other_id: addressee.id })).error).toBeNull();
    const afterWithdraw = await post('export-data', requester.accessToken, {});
    expect(afterWithdraw.body.friendships).toEqual([]);
  });

  it('exports a re-sent request the same way whether it was declined or still pending', async () => {
    const [requester, decliner, ignorer] = await Promise.all([createTestUser(), createTestUser(), createTestUser()]);
    for (const target of [decliner, ignorer]) {
      await requester.client.rpc('send_friend_request', { username: target.username });
    }
    await decliner.client.rpc('respond_friend_request', { requester_id: requester.id, accept: false });
    const [first] = await db`select created_at from public.friendships where requester_id = ${requester.id} limit 1`;
    const declinerBefore = await post('export-data', decliner.accessToken, {});
    for (const target of [decliner, ignorer]) {
      expect((await requester.client.rpc('remove_friend', { other_id: target.id })).error).toBeNull();
      const resent = await requester.client.rpc('send_friend_request', { username: target.username });
      expect(resent.data).toMatchObject({ status: 'sent', friend: { userId: target.id } });
    }

    const exported = await post('export-data', requester.accessToken, {});
    const shape = (row: Record<string, unknown>) => ({
      ...row,
      otherUserId: null,
      otherUsername: null,
      createdAt: null,
    });
    const byTarget = new Map(
      exported.body.friendships.map((row: Record<string, unknown>) => [row.otherUserId as string, row]),
    );
    const declinedRow = byTarget.get(decliner.id) as Record<string, unknown>;
    const pendingRow = byTarget.get(ignorer.id) as Record<string, unknown>;
    expect(shape(declinedRow)).toEqual(shape(pendingRow));
    expect(declinedRow).toMatchObject({ direction: 'outgoing', status: 'pending', respondedAt: null });
    expect(Date.parse(declinedRow.createdAt as string)).toBeGreaterThan(new Date(first.created_at).getTime());
    const declinerAfter = await post('export-data', decliner.accessToken, {});
    expect(declinerAfter.body.friendships).toEqual(declinerBefore.body.friendships);
    expect(declinerAfter.body.friendships[0]).toMatchObject({ direction: 'incoming', status: 'declined' });
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
    expect(counts.sessions).toBe(3);
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
    expect(response.body.error).toBe('invalid_payload');
  });

  it('refuses a body with an unknown key', async () => {
    const response = await post('delete-account', owner.accessToken, {
      confirmUsername: owner.username,
      password: TEST_PASSWORD,
      keepData: true,
    });
    expect(response.status).toBe(422);
    expect(response.body.error).toBe('invalid_payload');
    expect((await rowCounts(owner.id)).profiles).toBe(1);
  });

  it('refuses a body that is not JSON', async () => {
    const response = await fetchFunction('delete-account', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${owner.accessToken}`,
        apikey: env.PUBLISHABLE_KEY,
        'Content-Type': 'application/json',
      },
      body: '{',
    });
    expect(response.status, response.rawBody).toBe(400);
    expect(JSON.parse(response.rawBody).error).toBe('invalid_json');
    expect((await rowCounts(owner.id)).profiles).toBe(1);
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
    const ownerBefore = await rowCounts(owner.id);
    for (const table of [
      'loot_rolls',
      'drops',
      'drop_luck',
      'user_items',
      'item_ledger',
      'events',
      'crafts',
      'reactions',
      'friendships.requester_id',
      'friendships.addressee_id',
    ]) {
      expect(ownerBefore[table], table).toBeGreaterThan(0);
    }
    expect(await rateLimitRows(owner.id)).toBeGreaterThan(0);
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
    expect(await rateLimitRows(owner.id)).toBe(0);
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
