import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { canCraft, type Recipe } from '@domain/index.ts';
import {
  anon,
  builtInExerciseId,
  db,
  grantDrop,
  postFunction,
  type TestUser,
  seedRateLimitHits,
} from './local-stack.ts';
import { aSet, expectLedgerMatchesItems, payloadAt, postSession, trackedUsers } from './session-support.ts';

let benchId: string;
let grinderBelt: Recipe;
const itemIds = new Map<string, string>();

const { freshUser, checkAndClear } = trackedUsers(expectLedgerMatchesItems);

async function quietSession(user: TestUser): Promise<string> {
  const payload = payloadAt(new Date(Date.now() - 60 * 60 * 1000), [aSet(benchId, 0, 40, { isWarmup: true })]);
  await postSession(user, payload);
  return payload.id;
}

async function grant(user: TestUser, sessionId: string, items: Record<string, number>): Promise<string[]> {
  const dropIds: string[] = [];
  for (const [key, quantity] of Object.entries(items)) {
    if (quantity > 0) dropIds.push((await grantDrop(user.id, sessionId, randomUUID(), key, quantity)).dropId);
  }
  return dropIds;
}

async function held(userId: string): Promise<Record<string, number>> {
  const rows = await db`
    select i.key, u.quantity from public.user_items u join public.items i on i.id = u.item_id
    where u.user_id = ${userId} order by i.key`;
  return Object.fromEntries(rows.map((row) => [row.key, row.quantity]));
}

async function lootState(userId: string) {
  const [crafts, userItems, itemLedger, drops, lootRolls] = await Promise.all([
    db`select * from public.crafts where user_id = ${userId} order by id`,
    db`select * from public.user_items where user_id = ${userId} order by item_id`,
    db`select * from public.item_ledger where user_id = ${userId} order by id`,
    db`select * from public.drops where user_id = ${userId} order by id`,
    db`select * from public.loot_rolls where user_id = ${userId} order by id`,
  ]);
  return { crafts, userItems, itemLedger, drops, lootRolls };
}

async function loadRecipe(key: string): Promise<Recipe> {
  const [row] = await db`
    select r.id, r.key, r.output_item_id, r.output_quantity,
           coalesce(jsonb_agg(jsonb_build_object('itemId', i.item_id, 'quantity', i.quantity) order by i.item_id)
             filter (where i.item_id is not null), '[]'::jsonb) as inputs
    from public.recipes r left join public.recipe_inputs i on i.recipe_id = r.id
    where r.key = ${key} group by r.id`;
  return {
    id: row.id,
    key: row.key,
    outputItemId: row.output_item_id,
    outputQuantity: row.output_quantity,
    inputs: row.inputs,
  };
}

function craft(user: TestUser, recipeId: string) {
  return user.client.rpc('craft', { recipe_id: recipeId });
}

beforeAll(async () => {
  benchId = await builtInExerciseId('barbell_bench_press');
  grinderBelt = await loadRecipe('grinder_belt');
  const rows = await db`select id, key from public.items`;
  for (const row of rows) itemIds.set(row.key, row.id);
});

afterEach(async () => {
  await checkAndClear();
});

afterAll(async () => {
  await db.end();
});

describe('craft', () => {
  it('debits the inputs and credits the output exactly once', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), { rookie_belt: 1, grinder_scraps: 10 });

    const { data, error } = await craft(user, grinderBelt.id);
    expect(error).toBeNull();
    const [row] = await db`select id from public.crafts where user_id = ${user.id}`;
    expect(data).toEqual({ craftId: row.id, itemId: itemIds.get('grinder_belt'), quantity: 1, equippedSlot: null });
    expect(await held(user.id)).toEqual({ grinder_belt: 1, grinder_scraps: 2, rookie_belt: 0 });
    expect(
      await db`
        select i.key, l.delta, l.reason from public.item_ledger l join public.items i on i.id = l.item_id
        where l.user_id = ${user.id} and l.ref_id = ${row.id} order by l.reason, i.key`,
    ).toEqual([
      { key: 'grinder_belt', delta: 1, reason: 'craft_in' },
      { key: 'grinder_scraps', delta: -8, reason: 'craft_out' },
      { key: 'rookie_belt', delta: -1, reason: 'craft_out' },
    ]);
    const [first] = await db`
      select first_obtained_at from public.user_items where user_id = ${user.id} and item_id = ${itemIds.get('rookie_belt')!}`;
    expect(first.first_obtained_at).not.toBeNull();
  });

  it('adds to an output that is already held', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), { rookie_belt: 2, grinder_scraps: 16 });
    expect((await craft(user, grinderBelt.id)).error).toBeNull();
    const second = await craft(user, grinderBelt.id);
    expect(second.error).toBeNull();
    expect(second.data.quantity).toBe(2);
    expect(await held(user.id)).toEqual({ grinder_belt: 2, grinder_scraps: 0, rookie_belt: 0 });
  });

  it('refuses short inputs with the shortfall and changes nothing', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), { grinder_scraps: 7 });
    const before = await lootState(user.id);

    const { data, error } = await craft(user, grinderBelt.id);
    expect(data).toBeNull();
    expect(error?.message).toBe('insufficient_items');
    expect(error?.code).toBe('23514');
    expect(JSON.parse(error!.details)).toEqual(
      [
        { itemId: itemIds.get('grinder_scraps'), have: 7, need: 8 },
        { itemId: itemIds.get('rookie_belt'), have: 0, need: 1 },
      ].sort((a, b) => a.itemId!.localeCompare(b.itemId!)),
    );
    expect(await lootState(user.id)).toEqual(before);
  });

  it('refuses an unknown, a retired and an input-less recipe', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), {
      titan_gloves: 1,
      mythic_gloves: 1,
      mythic_scraps: 8,
      ascendant_scraps: 8,
    });
    const before = await lootState(user.id);

    const unknown = await craft(user, randomUUID());
    expect(unknown.error?.message).toBe('unknown_recipe');
    expect(unknown.error?.code).toBe('22023');

    const retired = await loadRecipe('mythic_gloves');
    await db`update public.recipes set retired_at = now() where id = ${retired.id}`;
    try {
      expect((await craft(user, retired.id)).error?.message).toBe('unknown_recipe');
    } finally {
      await db`update public.recipes set retired_at = null where id = ${retired.id}`;
    }

    const inputless = await loadRecipe('ascendant_gloves');
    await db`delete from public.recipe_inputs where recipe_id = ${inputless.id}`;
    try {
      expect((await craft(user, inputless.id)).error?.message).toBe('unknown_recipe');
    } finally {
      await db`
        insert into public.recipe_inputs ${db(
          inputless.inputs.map((input) => ({
            recipe_id: inputless.id,
            item_id: input.itemId,
            quantity: input.quantity,
          })),
        )}`;
    }
    expect(await lootState(user.id)).toEqual(before);
  });

  it('refuses a recipe whose output item is retired', async () => {
    const user = await freshUser();
    const recipe = await loadRecipe('titan_shoes');
    await grant(user, await quietSession(user), { forged_shoes: 1, titan_scraps: 6 });
    const before = await lootState(user.id);
    await db`update public.items set retired_at = now() where id = ${recipe.outputItemId}`;
    try {
      expect((await craft(user, recipe.id)).error?.message).toBe('unknown_recipe');
    } finally {
      await db`update public.items set retired_at = null where id = ${recipe.outputItemId}`;
    }
    expect(await lootState(user.id)).toEqual(before);
    expect((await craft(user, recipe.id)).error).toBeNull();
  });

  it('is not executable by anon', async () => {
    const { error } = await anon.rpc('craft', { recipe_id: grinderBelt.id });
    expect(error?.code).toBe('42501');
  });

  it("only ever touches the caller's own rows", async () => {
    const owner = await freshUser();
    const other = await freshUser();
    await grant(owner, await quietSession(owner), { rookie_belt: 1, grinder_scraps: 8 });
    const ownerBefore = await lootState(owner.id);

    const { error } = await craft(other, grinderBelt.id);
    expect(error?.message).toBe('insufficient_items');
    expect(await lootState(owner.id)).toEqual(ownerBefore);
    expect(await lootState(other.id)).toMatchObject({ crafts: [], userItems: [], itemLedger: [] });
  });
});

describe('craft and the loadout', () => {
  async function loadout(userId: string) {
    return await db`
      select l.slot::text, i.key from public.user_loadout l join public.items i on i.id = l.item_id
      where l.user_id = ${userId} order by l.slot`;
  }

  it('equips the output in the slot of the last equipped copy it spent', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), { rookie_belt: 1, grinder_scraps: 8 });
    const equipped = await user.client.rpc('equip_gear', { slot: 'belt', item_id: itemIds.get('rookie_belt') });
    expect(equipped.error).toBeNull();

    const { data, error } = await craft(user, grinderBelt.id);
    expect(error).toBeNull();
    expect(data.equippedSlot).toBe('belt');
    expect(await loadout(user.id)).toEqual([{ slot: 'belt', key: 'grinder_belt' }]);
  });

  it('keeps the equipped item when a spare copy is spent', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), { rookie_belt: 2, grinder_scraps: 8 });
    const equipped = await user.client.rpc('equip_gear', { slot: 'belt', item_id: itemIds.get('rookie_belt') });
    expect(equipped.error).toBeNull();

    const { data, error } = await craft(user, grinderBelt.id);
    expect(error).toBeNull();
    expect(data.equippedSlot).toBeNull();
    expect(await loadout(user.id)).toEqual([{ slot: 'belt', key: 'rookie_belt' }]);
  });

  it('ignores a retired equipped item in get_loadout and in the session bonus', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), { ascendant_belt: 1 });
    const beltId = itemIds.get('ascendant_belt')!;
    const equipped = await user.client.rpc('equip_gear', { slot: 'belt', item_id: beltId });
    expect(equipped.error).toBeNull();
    const squatId = await builtInExerciseId('back_squat');
    const session = payloadAt(new Date(Date.now() - 30 * 60 * 1000), [aSet(squatId, 0, 100), aSet(squatId, 1, 100)]);

    await db`update public.items set retired_at = now() where id = ${beltId}`;
    try {
      const shown = await user.client.rpc('get_loadout', { target: user.id });
      expect(shown.error).toBeNull();
      expect(shown.data.slots).toEqual([]);
      await postSession(user, session);
    } finally {
      await db`update public.items set retired_at = null where id = ${beltId}`;
    }

    const [stored] = await db`select gear_loadout, summary from public.sessions where id = ${session.id}`;
    expect(stored.gear_loadout).toEqual({});
    expect(stored.summary.gearBonusBySkill).toEqual({});
  });
});

describe('craft rate limit', () => {
  it('refuses the 31st craft in a minute and keeps the materials', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), { rookie_belt: 1, grinder_scraps: 8 });
    await seedRateLimitHits('craft_minute', user.id, 30);
    const { error } = await craft(user, grinderBelt.id);
    expect(error?.code).toBe('PT429');
    expect(JSON.parse(error!.details)).toMatchObject({ bucket: 'craft_minute' });
    expect(await held(user.id)).toEqual({ grinder_scraps: 8, rookie_belt: 1 });
  });
});

describe('races', () => {
  it('lets only one of two concurrent crafts spend the same inputs', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), { rookie_belt: 1, grinder_scraps: 8 });

    const results = await Promise.all([craft(user, grinderBelt.id), craft(user, grinderBelt.id)]);
    expect(results.filter((result) => result.error === null)).toHaveLength(1);
    expect(results.map((result) => result.error?.message).filter(Boolean)).toEqual(['insufficient_items']);
    expect(await held(user.id)).toEqual({ grinder_belt: 1, grinder_scraps: 0, rookie_belt: 0 });
    expect(await db`select id from public.crafts where user_id = ${user.id}`).toHaveLength(1);
  });

  it('serializes a craft with a delete that revokes one of its inputs', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), { rookie_belt: 1, grinder_scraps: 8 });
    const doomed = await quietSession(user);
    const [scrapDrop] = await grant(user, doomed, { grinder_scraps: 8 });

    const [crafted, deleted] = await Promise.all([
      craft(user, grinderBelt.id),
      postFunction('delete-session', user.accessToken, { sessionId: doomed }),
    ]);
    expect(crafted.error).toBeNull();
    expect(deleted.status, deleted.rawBody).toBe(200);
    expect(deleted.body.revokedDrops?.map((drop) => drop.dropId)).toEqual([scrapDrop]);
    expect(await held(user.id)).toEqual({ grinder_belt: 1, grinder_scraps: 0, rookie_belt: 0 });
    const [drop] = await db`select revoked_quantity from public.drops where id = ${scrapDrop}`;
    expect(drop.revoked_quantity).toBe(8);
  });
});

describe('revoking crafted-away inputs', () => {
  it('clamps the revocation at zero and keeps the crafted output', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), { rookie_belt: 1 });
    const doomed = await quietSession(user);
    const [scrapDrop] = await grant(user, doomed, { grinder_scraps: 8 });
    expect((await craft(user, grinderBelt.id)).error).toBeNull();

    const deleted = await postFunction('delete-session', user.accessToken, { sessionId: doomed });
    expect(deleted.status, deleted.rawBody).toBe(200);
    const [drop] = await db`select revoke_reason, revoked_quantity from public.drops where id = ${scrapDrop}`;
    expect(drop).toEqual({ revoke_reason: 'session_deleted', revoked_quantity: 0 });
    expect(await db`select id from public.item_ledger where user_id = ${user.id} and reason = 'revoke'`).toEqual([]);
    expect(await held(user.id)).toEqual({ grinder_belt: 1, grinder_scraps: 0, rookie_belt: 0 });
  });
});

describe('canCraft', () => {
  const inventories: Record<string, number>[] = [
    {},
    { rookie_belt: 1 },
    { grinder_scraps: 8 },
    { rookie_belt: 1, grinder_scraps: 7 },
    { rookie_belt: 1, grinder_scraps: 8 },
    { rookie_belt: 1, grinder_scraps: 9 },
    { rookie_belt: 3, grinder_scraps: 30 },
    { rookie_chalk: 1, grinder_scraps: 8 },
    { grinder_belt: 1, grinder_scraps: 8 },
    { rookie_belt: 1, tempered_scraps: 8, grinder_scraps: 2 },
  ];

  it.each(inventories.map((inventory, index) => [index, inventory] as const))(
    'agrees with the RPC on inventory %i',
    async (_index, inventory) => {
      const user = await freshUser();
      await grant(user, await quietSession(user), inventory);
      const expected = canCraft(
        grinderBelt,
        new Map(Object.entries(inventory).map(([key, quantity]) => [itemIds.get(key)!, quantity])),
      );
      const { error } = await craft(user, grinderBelt.id);
      expect(error === null).toBe(expected);
      if (!expected) expect(error?.message).toBe('insufficient_items');
    },
  );
});
