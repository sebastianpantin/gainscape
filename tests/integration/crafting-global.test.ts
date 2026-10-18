import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { builtInExerciseId, db } from './local-stack.ts';
import { craft, grant, loadRecipe, lootState, quietSession } from './crafting-support.ts';
import { aSet, expectLedgerMatchesItems, payloadAt, postSession, trackedUsers } from './session-support.ts';

const { freshUser, checkAndClear } = trackedUsers(expectLedgerMatchesItems);

afterEach(async () => {
  await checkAndClear();
});

afterAll(async () => {
  await db.end();
});

describe('craft against a retired catalog row', () => {
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

  it('ignores a retired equipped item in get_loadout and in the session bonus', async () => {
    const user = await freshUser();
    await grant(user, await quietSession(user), { ascendant_belt: 1 });
    const [{ id: beltId }] = await db`select id from public.items where key = 'ascendant_belt'`;
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
