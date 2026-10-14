import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { giveUserEverything, userRowCounts } from './account-support.ts';
import { admin, createTestUser, db, env, fetchFunction, TEST_PASSWORD, type TestUser } from './local-stack.ts';

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
    expect(exported.version).toBe(8);
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
    expect(exported.programs[0].days[0].exercises[0]).toMatchObject({
      progression: 'none',
      increment_kg: null,
      increment_lb: null,
    });
    const counts = await userRowCounts(owner.id);
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
    expect(exported.quests.inProgress).toEqual([
      expect.objectContaining({ quest: 'bench_apprentice', step_index: 0, step_progress: 0 }),
    ]);
    expect(exported.quests.completed).toEqual([
      expect.objectContaining({ quest: 'loose_limbs', quest_points: 1, xp: { mobility: 600 } }),
    ]);
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
    const counts = await userRowCounts(owner.id);
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
    expect((await userRowCounts(owner.id)).profiles).toBe(1);
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
    expect((await userRowCounts(owner.id)).profiles).toBe(1);
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
    expect((await userRowCounts(owner.id)).profiles).toBe(1);
  });

  it('deletes the account and every row it owned, leaving other users alone', async () => {
    const bystanderBefore = await userRowCounts(bystander.id);
    const catalogBefore = await sharedCatalogCounts();
    const ownedExerciseIds = (await db`select id from public.exercises where owner_user_id = ${owner.id}`).map(
      (row) => row.id as string,
    );
    const ownedProgramIds = (await db`select id from public.programs where owner_user_id = ${owner.id}`).map(
      (row) => row.id as string,
    );
    expect(ownedExerciseIds).toHaveLength(1);
    expect(ownedProgramIds.length).toBeGreaterThan(0);
    const ownerBefore = await userRowCounts(owner.id);
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

    const counts = await userRowCounts(owner.id);
    expect(Object.values(counts).every((count) => count === 0)).toBe(true);
    const [authRow] = await db`select count(*)::int as count from auth.users where id = ${owner.id}`;
    expect(authRow.count).toBe(0);
    expect(await rateLimitRows(owner.id)).toBe(0);
    const lookup = await admin.auth.admin.getUserById(owner.id);
    expect(lookup.data.user).toBeNull();
    expect(await userRowCounts(bystander.id)).toEqual(bystanderBefore);
    expect(await orphanedRows(ownedExerciseIds, ownedProgramIds)).toBe(0);
    expect(await sharedCatalogCounts()).toEqual(catalogBefore);
  });

  it('finds nothing to export for the deleted user, even with a still-unexpired token', async () => {
    const response = await post('export-data', owner.accessToken, {});
    expect(response.status).toBe(404);
  });
});
