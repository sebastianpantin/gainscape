import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { canCraft, type Recipe } from '@domain/index.ts';
import { anon, db, postFunction, seedRateLimitHits } from './local-stack.ts';
import { craft, grant, held, loadRecipe, lootState, quietSession } from './crafting-support.ts';
import { expectLedgerMatchesItems, trackedUsers } from './session-support.ts';

let grinderBelt: Recipe;
const itemIds = new Map<string, string>();

const { freshUser, checkAndClear } = trackedUsers(expectLedgerMatchesItems);

beforeAll(async () => {
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
