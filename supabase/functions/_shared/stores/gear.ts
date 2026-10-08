import type { Transaction } from '../db.ts';
import { type GearLoadout, gearLoadoutFromStored } from '../domain/index.ts';

export async function loadEquippedLoadout(tx: Transaction, userId: string): Promise<GearLoadout> {
  const rows = await tx`
    select l.slot::text as slot, i.tier::text as tier
    from public.user_loadout l
    join public.items i on i.id = l.item_id
    join public.user_items u on u.user_id = l.user_id and u.item_id = l.item_id
    where l.user_id = ${userId} and u.quantity >= 1`;
  return gearLoadoutFromStored(Object.fromEntries(rows.map((row) => [row.slot, row.tier]))) ?? {};
}
