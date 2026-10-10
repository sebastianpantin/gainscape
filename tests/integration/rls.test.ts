import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MAX_LEVEL, xpForLevel } from '@domain/index.ts';
import {
  anon,
  builtInExerciseId,
  createTestUser,
  db,
  grantDrop,
  postCompleteSession,
  postFunction,
  type TestUser,
} from './local-stack.ts';

let owner: TestUser;
let stranger: TestUser;
let ownerSessionId: string;
let deletedSessionId: string;
let benchId: string;

beforeAll(async () => {
  owner = await createTestUser();
  stranger = await createTestUser();
  benchId = await builtInExerciseId('barbell_bench_press');
  ownerSessionId = randomUUID();
  const endedAt = new Date();
  const response = await postCompleteSession(owner.accessToken, {
    id: ownerSessionId,
    startedAt: new Date(endedAt.getTime() - 30 * 60 * 1000).toISOString(),
    endedAt: endedAt.toISOString(),
    sets: [
      {
        id: randomUUID(),
        exerciseId: benchId,
        position: 0,
        weightKg: 60,
        reps: 8,
        effort: { type: 'level', level: 'hard' },
      },
    ],
  });
  expect(response.status).toBe(200);

  deletedSessionId = randomUUID();
  const doomedEnd = new Date(endedAt.getTime() - 60 * 60 * 1000);
  const doomed = await postCompleteSession(owner.accessToken, {
    id: deletedSessionId,
    startedAt: new Date(doomedEnd.getTime() - 30 * 60 * 1000).toISOString(),
    endedAt: doomedEnd.toISOString(),
    sets: [{ id: randomUUID(), exerciseId: benchId, position: 0, weightKg: 50, reps: 8, effort: null }],
  });
  expect(doomed.status).toBe(200);
  expect((await postFunction('delete-session', owner.accessToken, { sessionId: deletedSessionId })).status).toBe(200);
});

afterAll(async () => {
  await db.end();
});

describe('game tables reject client writes', () => {
  async function insertableRows(): Promise<Record<string, object>> {
    const [ownerSet] =
      await db`select id from public.sets where session_id = ${ownerSessionId} order by position limit 1`;
    const [uncreditedSkill] = await db`
      select id from public.skills
      where id not in (select skill_id from public.user_skills where user_id = ${owner.id})
        and id not in (select skill_id from public.set_skill_xp where set_id = ${ownerSet.id})
      order by sort_order limit 1`;
    const now = new Date().toISOString();
    return {
      sessions: {
        id: randomUUID(),
        user_id: owner.id,
        started_at: now,
        ended_at: now,
        local_date: '2026-09-28',
        timezone: 'UTC',
        balance_version: 1,
        derived_balance_version: 1,
        summary: {},
      },
      sets: {
        id: randomUUID(),
        session_id: ownerSessionId,
        user_id: owner.id,
        exercise_id: benchId,
        position: 99,
        weight_kg: 1,
        effective_load_kg: 1,
        reps: 1,
        rir: 0,
        rir_source: 'logged',
        effective_reps: 1,
        xp_awarded: 999,
      },
      set_skill_xp: { set_id: ownerSet.id, skill_id: uncreditedSkill.id, user_id: owner.id, xp: 999 },
      user_skills: { user_id: owner.id, skill_id: uncreditedSkill.id, xp: xpForLevel(MAX_LEVEL) },
    };
  }

  async function ownerRows(table: string) {
    return await db`select * from ${db('public.' + table)} where user_id = ${owner.id}`;
  }

  it.each(['sessions', 'sets', 'set_skill_xp', 'user_skills'])('insert into %s is denied', async (table) => {
    const rows = await insertableRows();
    const before = await ownerRows(table);
    const { error } = await owner.client.from(table).insert(rows[table]);
    expect(error?.code).toBe('42501');
    expect(await ownerRows(table)).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });

  it('update of user_skills xp is denied', async () => {
    await owner.client
      .from('user_skills')
      .update({ xp: xpForLevel(MAX_LEVEL) })
      .eq('user_id', owner.id);
    const [row] = await db`select max(xp)::int as xp from public.user_skills where user_id = ${owner.id}`;
    expect(row.xp).toBeLessThan(xpForLevel(MAX_LEVEL));
  });
});

describe('session edit tables reject client writes', () => {
  async function tombstones() {
    return await db`select id, user_id, started_at, deleted_at from public.deleted_sessions where user_id = ${owner.id}`;
  }

  it('insert into deleted_sessions is denied', async () => {
    const before = await tombstones();
    const { error } = await owner.client
      .from('deleted_sessions')
      .insert({ id: randomUUID(), user_id: owner.id, started_at: new Date().toISOString() });
    expect(error).not.toBeNull();
    expect(await tombstones()).toEqual(before);
  });

  it('update of deleted_sessions is denied', async () => {
    const before = await tombstones();
    const { error } = await owner.client
      .from('deleted_sessions')
      .update({ started_at: new Date(0).toISOString() })
      .eq('id', deletedSessionId);
    expect(error).not.toBeNull();
    expect(await tombstones()).toEqual(before);
  });

  it('delete from deleted_sessions is denied', async () => {
    const before = await tombstones();
    const { error } = await owner.client.from('deleted_sessions').delete().eq('id', deletedSessionId);
    expect(error).not.toBeNull();
    expect(await tombstones()).toEqual(before);
    expect(before).toHaveLength(1);
  });

  it('update of sessions.revision is denied', async () => {
    const { error } = await owner.client.from('sessions').update({ revision: 99 }).eq('id', ownerSessionId);
    expect(error).not.toBeNull();
    const [row] = await db`select revision from public.sessions where id = ${ownerSessionId}`;
    expect(row.revision).toBe(0);
  });
});

describe('users only see their own data', () => {
  it("hides another user's deleted sessions", async () => {
    const { data, error } = await stranger.client.from('deleted_sessions').select('id');
    expect(error).toBeNull();
    expect(data).toEqual([]);
    const own = await owner.client.from('deleted_sessions').select('id');
    expect(own.data).toEqual([{ id: deletedSessionId }]);
  });

  it("hides another user's sets", async () => {
    const { data, error } = await stranger.client.from('sets').select('id').eq('user_id', owner.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it("hides another user's private profile", async () => {
    const { data, error } = await stranger.client.from('profile_private').select('*').eq('user_id', owner.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('shows the owner their own sets', async () => {
    const { data } = await owner.client.from('sets').select('id');
    expect(data).toHaveLength(1);
  });
});

describe('profile protections', () => {
  it('rejects changing your own username', async () => {
    const { error } = await owner.client.from('profiles').update({ username: 'renamed_user' }).eq('id', owner.id);
    expect(error).not.toBeNull();
    const [row] = await db`select username from public.profiles where id = ${owner.id}`;
    expect(row.username).toBe(owner.username);
  });

  it('allows changing your display name', async () => {
    const { error } = await owner.client.from('profiles').update({ display_name: 'Iron Owner' }).eq('id', owner.id);
    expect(error).toBeNull();
  });
});

describe('events', () => {
  async function ownerEvents() {
    return await db`select * from public.events where user_id = ${owner.id} order by id`;
  }

  it('has no client select, even for the owner', async () => {
    const { error } = await owner.client.from('events').select('id');
    expect(error?.code).toBe('42501');
  });

  it('denies client insert, update and delete', async () => {
    await db`
      insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
      values (${owner.id}, ${ownerSessionId}, 'level:chest', 'level_up', now(), '{"skill": "chest"}')
      on conflict (session_id, event_key) do nothing`;
    const before = await ownerEvents();
    expect(before.length).toBeGreaterThan(0);
    const inserted = await owner.client.from('events').insert({
      user_id: owner.id,
      session_id: ownerSessionId,
      event_key: 'level:legs',
      type: 'level_99',
      occurred_at: new Date().toISOString(),
      payload: { skill: 'legs', from: 98, to: 99 },
    });
    expect(inserted.error?.code).toBe('42501');
    const updated = await owner.client.from('events').update({ payload: {} }).eq('user_id', owner.id);
    expect(updated.error?.code).toBe('42501');
    const deleted = await owner.client.from('events').delete().eq('user_id', owner.id);
    expect(deleted.error?.code).toBe('42501');
    expect(await ownerEvents()).toEqual(before);
  });
});

describe('friendships', () => {
  async function pairRows() {
    return await db`
      select * from public.friendships
      where requester_id in (${owner.id}, ${stranger.id}) or addressee_id in (${owner.id}, ${stranger.id})
      order by requester_id`;
  }

  it('denies client insert, update and delete, even of own rows', async () => {
    const sent = await owner.client.rpc('send_friend_request', { username: stranger.username });
    expect(sent.error).toBeNull();
    const before = await pairRows();
    expect(before).toHaveLength(1);

    const inserted = await stranger.client
      .from('friendships')
      .insert({ requester_id: stranger.id, addressee_id: owner.id, status: 'accepted' });
    expect(inserted.error?.code).toBe('42501');
    const updated = await stranger.client
      .from('friendships')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('requester_id', owner.id);
    expect(updated.error?.code).toBe('42501');
    const deleted = await owner.client.from('friendships').delete().eq('requester_id', owner.id);
    expect(deleted.error?.code).toBe('42501');
    const read = await owner.client.from('friendships').select('*');
    expect(read.error?.code).toBe('42501');
    expect(await pairRows()).toEqual(before);

    expect((await owner.client.rpc('remove_friend', { other_id: stranger.id })).error).toBeNull();
  });
});

describe('reactions', () => {
  it('denies client select, insert, update and delete', async () => {
    const [event] = await db`
      insert into public.events (user_id, session_id, event_key, type, occurred_at, payload)
      values (${owner.id}, ${ownerSessionId}, 'level:arms', 'level_up', now(), '{"skill": "arms"}')
      on conflict (session_id, event_key) do update set updated_at = now()
      returning id`;
    await db`insert into public.reactions (event_id, user_id) values (${event.id}, ${stranger.id}) on conflict do nothing`;
    const snapshot = () => db`select * from public.reactions where event_id = ${event.id} order by user_id`;
    const before = await snapshot();
    expect(before).toHaveLength(1);

    expect((await stranger.client.from('reactions').select('*')).error?.code).toBe('42501');
    expect((await owner.client.from('reactions').insert({ event_id: event.id, user_id: owner.id })).error?.code).toBe(
      '42501',
    );
    expect(
      (
        await stranger.client
          .from('reactions')
          .update({ created_at: new Date(0).toISOString() })
          .eq('event_id', event.id)
      ).error?.code,
    ).toBe('42501');
    expect((await stranger.client.from('reactions').delete().eq('event_id', event.id)).error?.code).toBe('42501');
    expect(await snapshot()).toEqual(before);
  });
});

describe('function execution rights', () => {
  it('lets anonymous visitors check username availability', async () => {
    const { data, error } = await anon.rpc('username_available', { candidate: 'nobody_has_this' });
    expect(error).toBeNull();
    expect(data).toBe(true);
  });

  it('reports taken usernames as unavailable', async () => {
    const { data } = await anon.rpc('username_available', { candidate: owner.username });
    expect(data).toBe(false);
  });

  it('revokes default privileges so future public objects are not auto-granted', async () => {
    const rows = await db`
      select defaclobjtype as object_type, defaclacl::text as acl
      from pg_default_acl a join pg_namespace n on n.oid = a.defaclnamespace
      join pg_roles r on r.oid = a.defaclrole
      where n.nspname = 'public' and r.rolname = 'postgres'`;
    for (const row of rows) {
      expect(row.acl, `default ACL for ${row.object_type}`).not.toMatch(/(^|[{,])(anon|authenticated)=/);
    }
  });

  it('grants anon execute on username_available only', async () => {
    const rows = await db`
      select n.nspname || '.' || p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute')`;
    expect(rows.map((row) => row.name)).toEqual(['public.username_available']);
  });

  it('grants authenticated execute only on the allowlisted functions', async () => {
    const rows = await db`
      select p.proname as name
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and has_function_privilege('authenticated', p.oid, 'execute')
      order by p.proname`;
    expect(rows.map((row) => row.name)).toEqual([
      'adjust_enrollment',
      'change_username',
      'copy_program',
      'craft',
      'delete_program',
      'end_enrollment',
      'enroll_program',
      'enrollment_facts',
      'equip_gear',
      'exercise_strength_state',
      'get_collection',
      'get_feed',
      'get_hiscores',
      'get_loadout',
      'get_profile',
      'last_logged_sets',
      'list_friends',
      'recent_lift_sets',
      'remove_friend',
      'reorder_pins',
      'respond_friend_request',
      'save_custom_exercise',
      'save_exercise_note',
      'save_program',
      'send_friend_request',
      'set_custom_exercise_archived',
      'set_gz',
      'set_timezone',
      'set_weekly_session_goal',
      'unequip_gear',
      'username_available',
      'weekly_goal_weeks',
      'workout_bodyweights',
    ]);
  });
});

describe('item catalog tables', () => {
  const catalogTables = ['challenges', 'items', 'drop_tables', 'drop_entries', 'recipes', 'recipe_inputs'];

  const everyRowColumn: Record<string, string> = {
    challenges: 'id',
    items: 'id',
    drop_tables: 'id',
    drop_entries: 'item_id',
    recipes: 'id',
    recipe_inputs: 'item_id',
  };

  async function snapshotOf(table: string) {
    return await db.unsafe(`select * from public.${table} order by 1, 2`);
  }

  async function sampleRows() {
    const [item] = await db`select * from public.items where key = 'plate_crab'`;
    const [table] = await db`select * from public.drop_tables where key = 'rare'`;
    const [recipe] = await db`select * from public.recipes where key = 'grinder_belt'`;
    return { item, table, recipe };
  }

  it.each(catalogTables)('insert into %s is denied', async (table) => {
    const { item, table: dropTable, recipe } = await sampleRows();
    const rowsByTable: Record<string, object> = {
      challenges: { id: randomUUID(), key: 'free_xp', name: 'Free XP', kind: 'volume', definition: {} },
      items: { ...item, id: randomUUID(), key: 'forged_crown', name: 'Forged crown' },
      drop_tables: { id: randomUUID(), key: 'jackpot', name: 'Jackpot' },
      drop_entries: {
        drop_table_id: dropTable.id,
        item_id: recipe.output_item_id,
        weight: 1000000,
        min_quantity: 1,
        max_quantity: 1,
      },
      recipes: { id: randomUUID(), key: 'free_crab', output_item_id: item.id, output_quantity: 1 },
      recipe_inputs: { recipe_id: recipe.id, item_id: item.id, quantity: 1 },
    };
    const before = await snapshotOf(table);
    const { error } = await owner.client.from(table).insert(rowsByTable[table]);
    expect(error).not.toBeNull();
    expect(await snapshotOf(table)).toEqual(before);
  });

  it.each(catalogTables)('update of %s is denied', async (table) => {
    const updates: Record<string, object> = {
      challenges: { name: 'Free XP' },
      items: { name: 'Free loot' },
      drop_tables: { name: 'Free loot' },
      drop_entries: { weight: 1000000 },
      recipes: { output_quantity: 1000 },
      recipe_inputs: { quantity: 1 },
    };
    const before = await snapshotOf(table);
    const { error } = await owner.client.from(table).update(updates[table]).not(everyRowColumn[table], 'is', null);
    expect(error?.code).toBe('42501');
    expect(await snapshotOf(table)).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });

  it.each(catalogTables)('delete from %s is denied', async (table) => {
    const before = await snapshotOf(table);
    const { error } = await owner.client.from(table).delete().not(everyRowColumn[table], 'is', null);
    expect(error?.code).toBe('42501');
    expect(await snapshotOf(table)).toEqual(before);
  });

  it('lets any signed-in user read the catalog tables', async () => {
    for (const table of catalogTables) {
      const [{ total }] = await db`select count(*)::int as total from ${db('public.' + table)}`;
      const { count, error } = await stranger.client.from(table).select('*', { count: 'exact', head: true });
      expect(error, table).toBeNull();
      expect(count, table).toBe(total);
      expect(total, table).toBeGreaterThan(0);
    }
  });

  it('shows every built-in variation, including the 6 former scroll variations, to a new user and hides another user custom exercise, shares and pin', async () => {
    const [newcomer, author] = await Promise.all([createTestUser(), createTestUser()]);
    const variations = await db`
      select key from public.exercises where owner_user_id is null and variation_of_id is not null order by key`;
    const { data: visibleVariations } = await newcomer.client
      .from('exercises')
      .select('key')
      .not('variation_of_id', 'is', null)
      .order('key');
    expect(visibleVariations).toEqual(variations.map(({ key }) => ({ key })));
    expect(visibleVariations).toEqual(
      expect.arrayContaining(
        ['dead_stop_row', 'deficit_deadlift', 'pause_bench_press', 'pause_squat', 'spider_curl', 'z_press'].map(
          (key) => ({ key }),
        ),
      ),
    );

    const [pauseSquat] = await db`select id from public.exercises where key = 'pause_squat'`;
    const pin = await newcomer.client.from('pinned_exercises').insert({ exercise_id: pauseSquat.id, position: 0 });
    expect(pin.error).toBeNull();

    const customId = randomUUID();
    await db.begin(async (tx) => {
      await tx`
        insert into public.exercises (id, owner_user_id, name, load_type, equipment)
        values (${customId}, ${author.id}, 'Secret press', 'external', 'other')`;
      await tx`
        insert into public.exercise_skills (exercise_id, skill_id, share_bp)
        select ${customId}, id, 10000 from public.skills where key = 'chest'`;
    });
    expect((await newcomer.client.from('exercises').select('id').eq('id', customId)).data).toEqual([]);
    expect((await newcomer.client.from('exercise_skills').select('skill_id').eq('exercise_id', customId)).data).toEqual(
      [],
    );
    const hiddenPin = await newcomer.client.from('pinned_exercises').insert({ exercise_id: customId, position: 1 });
    expect(hiddenPin.error).not.toBeNull();
    expect(await db`select exercise_id from public.pinned_exercises where user_id = ${newcomer.id}`).toEqual([
      { exercise_id: pauseSquat.id },
    ]);
  });

  it('shows every built-in exercise', async () => {
    const { data } = await stranger.client.from('exercises').select('id').is('owner_user_id', null);
    const [{ count }] = await db`select count(*)::int as count from public.exercises where owner_user_id is null`;
    expect(data).toHaveLength(count);
  });
});

describe('loot tables', () => {
  const lootTables = ['loot_rolls', 'drops', 'drop_luck', 'user_items', 'item_ledger'];
  let granted: Awaited<ReturnType<typeof grantDrop>>;
  let regularTableId: string;

  beforeAll(async () => {
    granted = await grantDrop(owner.id, ownerSessionId, randomUUID(), 'grinder_scraps', 3);
    [{ id: regularTableId }] = await db`select id from public.drop_tables where key = 'regular'`;
    await db`
      insert into public.drop_luck (user_id, drop_table_id, dry_rolls)
      select ${owner.id}, id, 2 from public.drop_tables where key = 'regular'
      on conflict (user_id, drop_table_id) do nothing`;
  });

  async function ownerRows(table: string) {
    return await db.unsafe(`select * from public.${table} where user_id = $1 order by 1, 2`, [owner.id]);
  }

  function rowFor(table: string): object {
    const rows: Record<string, object> = {
      loot_rolls: {
        user_id: owner.id,
        session_id: ownerSessionId,
        set_id: randomUUID(),
        kind: 'pr',
        local_date: '2026-09-28',
        roll_index: 50,
        drop_table_id: regularTableId,
        chance: 1,
        hit: true,
        loot_version: 1,
      },
      drops: {
        user_id: owner.id,
        loot_roll_id: granted.lootRollId,
        session_id: ownerSessionId,
        set_id: randomUUID(),
        item_id: granted.itemId,
        quantity: 1000,
        source: 'pr',
      },
      drop_luck: { user_id: owner.id, drop_table_id: regularTableId, dry_rolls: 0 },
      user_items: { user_id: owner.id, item_id: granted.itemId, quantity: 1000 },
      item_ledger: { user_id: owner.id, item_id: granted.itemId, delta: 1000, reason: 'drop', ref_id: randomUUID() },
    };
    return rows[table];
  }

  const updates: Record<string, object> = {
    loot_rolls: { hit: false },
    drops: { quantity: 1000 },
    drop_luck: { dry_rolls: 0 },
    user_items: { quantity: 1000 },
    item_ledger: { delta: 1000 },
  };

  it.each(lootTables)('insert into %s is denied', async (table) => {
    const before = await ownerRows(table);
    const { error } = await owner.client.from(table).insert(rowFor(table));
    expect(error).not.toBeNull();
    expect(await ownerRows(table)).toEqual(before);
  });

  it.each(lootTables)('update of %s is denied', async (table) => {
    const before = await ownerRows(table);
    const { error } = await owner.client.from(table).update(updates[table]).eq('user_id', owner.id);
    expect(error?.code).toBe('42501');
    expect(await ownerRows(table)).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });

  it.each(lootTables)('delete from %s is denied', async (table) => {
    const before = await ownerRows(table);
    const { error } = await owner.client.from(table).delete().eq('user_id', owner.id);
    expect(error?.code).toBe('42501');
    expect(await ownerRows(table)).toEqual(before);
  });

  it.each(lootTables.filter((table) => table !== 'drop_luck'))("hides another user's %s", async (table) => {
    const theirs = await stranger.client.from(table).select('user_id').eq('user_id', owner.id);
    expect(theirs.error).toBeNull();
    expect(theirs.data).toEqual([]);
    const own = await owner.client.from(table).select('user_id');
    expect(own.error).toBeNull();
    expect((own.data ?? []).length).toBe((await ownerRows(table)).length);
    expect((own.data ?? []).length).toBeGreaterThan(0);
  });

  it('grants nobody a read of drop_luck', async () => {
    for (const user of [owner, stranger]) {
      const { error } = await user.client.from('drop_luck').select('dry_rolls');
      expect(error?.code).toBe('42501');
    }
  });
});

describe('crafts', () => {
  let recipeId: string;

  beforeAll(async () => {
    [{ id: recipeId }] = await db`select id from public.recipes where key = 'grinder_belt'`;
    await grantDrop(owner.id, ownerSessionId, randomUUID(), 'rookie_belt', 1);
    await grantDrop(owner.id, ownerSessionId, randomUUID(), 'grinder_scraps', 8);
    const crafted = await owner.client.rpc('craft', { recipe_id: recipeId });
    expect(crafted.error).toBeNull();
  });

  async function ownerCrafts() {
    return await db`select * from public.crafts where user_id = ${owner.id} order by id`;
  }

  it('insert into crafts is denied', async () => {
    const before = await ownerCrafts();
    const { error } = await owner.client.from('crafts').insert({ user_id: owner.id, recipe_id: recipeId });
    expect(error).not.toBeNull();
    expect(await ownerCrafts()).toEqual(before);
  });

  it('update of crafts is denied', async () => {
    const before = await ownerCrafts();
    const { error } = await owner.client.from('crafts').update({ recipe_id: recipeId }).eq('user_id', owner.id);
    expect(error?.code).toBe('42501');
    expect(await ownerCrafts()).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });

  it('delete from crafts is denied', async () => {
    const before = await ownerCrafts();
    const { error } = await owner.client.from('crafts').delete().eq('user_id', owner.id);
    expect(error?.code).toBe('42501');
    expect(await ownerCrafts()).toEqual(before);
  });

  it("hides another user's crafts", async () => {
    const theirs = await stranger.client.from('crafts').select('id').eq('user_id', owner.id);
    expect(theirs.error).toBeNull();
    expect(theirs.data).toEqual([]);
    const own = await owner.client.from('crafts').select('id');
    expect(own.data?.length).toBe((await ownerCrafts()).length);
  });

  it('refuses anon a craft', async () => {
    const { error } = await anon.rpc('craft', { recipe_id: recipeId });
    expect(error).not.toBeNull();
    expect(await ownerCrafts()).toHaveLength(1);
  });
});

describe('user_loadout', () => {
  let user: TestUser;
  let rookieBeltId: string;
  let rookieGlovesId: string;

  beforeAll(async () => {
    user = await createTestUser();
    [{ id: rookieBeltId }] = await db`select id from public.items where key = 'rookie_belt'`;
    [{ id: rookieGlovesId }] = await db`select id from public.items where key = 'rookie_gloves'`;
    await grantDrop(user.id, ownerSessionId, randomUUID(), 'rookie_belt', 1);
    await grantDrop(user.id, ownerSessionId, randomUUID(), 'rookie_gloves', 1);
    const equipped = await user.client.rpc('equip_gear', { slot: 'belt', item_id: rookieBeltId });
    expect(equipped.error).toBeNull();
  });

  async function loadoutRows() {
    return await db`select * from public.user_loadout where user_id = ${user.id} order by slot`;
  }

  it('insert into user_loadout is denied', async () => {
    const before = await loadoutRows();
    const { error } = await user.client
      .from('user_loadout')
      .insert({ user_id: user.id, slot: 'gloves', item_id: rookieGlovesId });
    expect(error?.code).toBe('42501');
    expect(await loadoutRows()).toEqual(before);
  });

  it('update of user_loadout is denied', async () => {
    const before = await loadoutRows();
    const { error } = await user.client.from('user_loadout').update({ item_id: rookieGlovesId }).eq('user_id', user.id);
    expect(error?.code).toBe('42501');
    expect(await loadoutRows()).toEqual(before);
    expect(before).toHaveLength(1);
  });

  it('delete from user_loadout is denied', async () => {
    const before = await loadoutRows();
    const { error } = await user.client.from('user_loadout').delete().eq('user_id', user.id);
    expect(error?.code).toBe('42501');
    expect(await loadoutRows()).toEqual(before);
  });

  it("hides another user's loadout", async () => {
    const theirs = await stranger.client.from('user_loadout').select('slot').eq('user_id', user.id);
    expect(theirs.error).toBeNull();
    expect(theirs.data).toEqual([]);
    expect((await user.client.from('user_loadout').select('slot')).data).toEqual([{ slot: 'belt' }]);
  });

  it('refuses anon an equip', async () => {
    const { error } = await anon.rpc('equip_gear', { slot: 'gloves', item_id: rookieGlovesId });
    expect(error).not.toBeNull();
    expect(await loadoutRows()).toHaveLength(1);
  });
});
