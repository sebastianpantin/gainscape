import { randomUUID } from 'node:crypto';
import { type Recipe } from '@domain/index.ts';
import { builtInExerciseId, db, grantDrop, type TestUser } from './local-stack.ts';
import { aSet, payloadAt, postSession } from './session-support.ts';

export async function quietSession(user: TestUser): Promise<string> {
  const benchId = await builtInExerciseId('barbell_bench_press');
  const payload = payloadAt(new Date(Date.now() - 60 * 60 * 1000), [aSet(benchId, 0, 40, { isWarmup: true })]);
  await postSession(user, payload);
  return payload.id;
}

export async function grant(user: TestUser, sessionId: string, items: Record<string, number>): Promise<string[]> {
  const dropIds: string[] = [];
  for (const [key, quantity] of Object.entries(items)) {
    if (quantity > 0) dropIds.push((await grantDrop(user.id, sessionId, randomUUID(), key, quantity)).dropId);
  }
  return dropIds;
}

export async function held(userId: string): Promise<Record<string, number>> {
  const rows = await db`
    select i.key, u.quantity from public.user_items u join public.items i on i.id = u.item_id
    where u.user_id = ${userId} order by i.key`;
  return Object.fromEntries(rows.map((row) => [row.key, row.quantity]));
}

export async function lootState(userId: string) {
  const [crafts, userItems, itemLedger, drops, lootRolls] = await Promise.all([
    db`select * from public.crafts where user_id = ${userId} order by id`,
    db`select * from public.user_items where user_id = ${userId} order by item_id`,
    db`select * from public.item_ledger where user_id = ${userId} order by id`,
    db`select * from public.drops where user_id = ${userId} order by id`,
    db`select * from public.loot_rolls where user_id = ${userId} order by id`,
  ]);
  return { crafts, userItems, itemLedger, drops, lootRolls };
}

export async function loadRecipe(key: string): Promise<Recipe> {
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

export function craft(user: TestUser, recipeId: string) {
  return user.client.rpc('craft', { recipe_id: recipeId });
}
