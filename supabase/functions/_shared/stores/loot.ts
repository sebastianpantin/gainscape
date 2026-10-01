import type { JsonValue, Transaction } from '../db.ts';
import {
  DEFAULT_LOOT,
  type DropSummary,
  type LootCandidate,
  type LootDayState,
  type LootEntry,
  lootRollKey,
  type LootTable,
  type LootTables,
  qualifies,
  revocationReason,
  type RevokeReason,
  rollSessionLoot,
  type RollKind,
} from '../domain/index.ts';
import { lootRngFor, lootSecret } from '../loot-seeds.ts';
import { syncSessionEvents } from './events.ts';

function sumByItem(entries: readonly (readonly [string, number])[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [itemId, quantity] of entries) totals.set(itemId, (totals.get(itemId) ?? 0) + quantity);
  return totals;
}

async function loadLootTables(tx: Transaction): Promise<LootTables> {
  const rows = await tx`
    select t.id as table_id, t.key as table_key, i.id as item_id, i.key as item_key,
           e.weight, e.min_quantity, e.max_quantity
    from public.drop_tables t
    join public.drop_entries e on e.drop_table_id = t.id
    join public.items i on i.id = e.item_id
    where t.key in ('regular', 'rare')
      and t.retired_at is null and i.retired_at is null
    order by t.key, i.key`;
  const tables = new Map<string, { id: string; key: string; entries: LootEntry[] }>();
  for (const row of rows) {
    const table = tables.get(row.table_key) ?? { id: row.table_id, key: row.table_key, entries: [] as LootEntry[] };
    table.entries.push({
      itemId: row.item_id,
      itemKey: row.item_key,
      weight: row.weight,
      minQuantity: row.min_quantity,
      maxQuantity: row.max_quantity,
    });
    tables.set(row.table_key, table);
  }
  const tableFor = (key: string): LootTable => {
    const table = tables.get(key);
    if (table === undefined) throw new Error(`drop table ${key} is missing or empty`);
    return table;
  };
  return { regular: tableFor('regular'), rare: tableFor('rare') };
}

async function loadLootDayState(
  tx: Transaction,
  userId: string,
  localDate: string,
  regularTableId: string,
  setIds: readonly string[],
): Promise<LootDayState> {
  const used = await tx`
    select kind, count(*)::int as count from public.loot_rolls
    where user_id = ${userId} and local_date = ${localDate}::date
    group by kind`;
  const usedOf = (kind: RollKind) => used.find((row) => row.kind === kind)?.count ?? 0;
  const [luck] = await tx`
    select dry_rolls from public.drop_luck where user_id = ${userId} and drop_table_id = ${regularTableId}`;
  const rolled = await tx`
    select set_id, kind from public.loot_rolls
    where user_id = ${userId} and set_id = any(${setIds as string[]}::uuid[])`;
  return {
    regularUsed: usedOf('regular'),
    prUsed: usedOf('pr'),
    dryRolls: luck?.dry_rolls ?? 0,
    alreadyRolled: new Set(rolled.map((row) => lootRollKey(row.set_id, row.kind))),
  };
}

async function refreshSummaryDrops(tx: Transaction, sessionIds: readonly string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  await tx`
    update public.sessions as target
    set summary = jsonb_set(target.summary, '{drops}', coalesce((
      select jsonb_agg(jsonb_build_object(
               'dropId', d.id, 'setId', d.set_id, 'itemId', d.item_id, 'itemKey', i.key,
               'quantity', d.quantity, 'source', d.source)
             order by st.position nulls last, d.source, d.id)
      from public.drops d
      join public.items i on i.id = d.item_id
      left join public.sets st on st.id = d.set_id
      where d.session_id = target.id and d.revoked_at is null), '[]'::jsonb))
    where target.id = any(${sessionIds as string[]}::uuid[])`;
}

export async function rollNewSessionLoot(
  tx: Transaction,
  userId: string,
  sessionId: string,
  candidates: readonly LootCandidate[],
): Promise<void> {
  const secret = lootSecret();
  const [session] = await tx`select local_date::text as local_date from public.sessions where id = ${sessionId}`;
  const tables = await loadLootTables(tx);
  const dayState = await loadLootDayState(
    tx,
    userId,
    session.local_date,
    tables.regular.id,
    candidates.map((candidate) => candidate.setId),
  );
  const seedRequests = candidates.flatMap((candidate) =>
    (['regular', 'pr'] as const)
      .filter(
        (kind) =>
          qualifies(kind, candidate, DEFAULT_LOOT) && !dayState.alreadyRolled.has(lootRollKey(candidate.setId, kind)),
      )
      .map((kind) => ({ setId: candidate.setId, kind })),
  );
  const rngFor = await lootRngFor(secret, userId, seedRequests);
  const { rolls, dryRolls } = rollSessionLoot(candidates, tables, dayState, DEFAULT_LOOT, rngFor);
  if (rolls.length > 0) {
    const rollRows = rolls.map((roll) => ({
      user_id: userId,
      session_id: sessionId,
      set_id: roll.setId,
      kind: roll.kind,
      local_date: session.local_date,
      roll_index: roll.rollIndex,
      drop_table_id: roll.tableId,
      chance: roll.chance,
      hit: roll.hit,
      loot_version: DEFAULT_LOOT.version,
    }));
    const insertedRolls = await tx`insert into public.loot_rolls ${tx(rollRows)} returning id, set_id, kind`;
    const rollIdOf = new Map(insertedRolls.map((row) => [lootRollKey(row.set_id, row.kind), row.id as string]));

    const hits = rolls.filter((roll) => roll.drop !== null);
    if (hits.length > 0) {
      const dropRows = hits.map((roll) => ({
        user_id: userId,
        loot_roll_id: rollIdOf.get(lootRollKey(roll.setId, roll.kind))!,
        session_id: sessionId,
        set_id: roll.setId,
        item_id: roll.drop!.itemId,
        quantity: roll.drop!.quantity,
        source: roll.kind,
      }));
      const drops = await tx`insert into public.drops ${tx(dropRows)} returning id, item_id, quantity`;
      await tx`
        insert into public.item_ledger ${tx(
          drops.map((drop) => ({
            user_id: userId,
            item_id: drop.item_id,
            delta: drop.quantity,
            reason: 'drop',
            ref_id: drop.id,
          })),
        )}`;
      const totals = sumByItem(drops.map((drop) => [drop.item_id, drop.quantity]));
      await tx`
        insert into public.user_items ${tx(
          [...totals].map(([itemId, quantity]) => ({ user_id: userId, item_id: itemId, quantity })),
        )}
        on conflict (user_id, item_id) do update
        set quantity = public.user_items.quantity + excluded.quantity, updated_at = now()`;
      await tx`
        insert into public.user_unlocks (user_id, exercise_id, item_id, source_drop_id)
        select ${userId}, i.grants_exercise_id, i.id, d.id
        from public.drops d join public.items i on i.id = d.item_id
        where d.id = any(${drops.map((drop) => drop.id as string)}::uuid[]) and i.kind = 'scroll'
        order by d.created_at, d.id
        on conflict (user_id, exercise_id) do nothing`;
    }

    if (rolls.some((roll) => roll.kind === 'regular')) {
      await tx`
        insert into public.drop_luck (user_id, drop_table_id, dry_rolls)
        values (${userId}, ${tables.regular.id}, ${dryRolls})
        on conflict (user_id, drop_table_id) do update set dry_rolls = excluded.dry_rolls, updated_at = now()`;
    }
  }
  await refreshSummaryDrops(tx, [sessionId]);
  await syncSessionEvents(tx, userId, [sessionId]);
}

export type ActiveDrop = DropSummary & { sessionId: string; lootVersion: number };

async function loadActiveDrops(tx: Transaction, userId: string, sessionIds: readonly string[]): Promise<ActiveDrop[]> {
  if (sessionIds.length === 0) return [];
  const rows = await tx`
    select d.id, d.session_id, d.set_id, d.item_id, i.key as item_key, d.quantity, d.source, r.loot_version
    from public.drops d
    join public.items i on i.id = d.item_id
    join public.loot_rolls r on r.id = d.loot_roll_id
    where d.user_id = ${userId} and d.revoked_at is null and d.session_id = any(${sessionIds as string[]}::uuid[])
    order by d.created_at, d.id`;
  return rows.map((row) => ({
    dropId: row.id,
    sessionId: row.session_id,
    setId: row.set_id,
    itemId: row.item_id,
    itemKey: row.item_key,
    quantity: row.quantity,
    source: row.source,
    lootVersion: row.loot_version,
  }));
}

export interface Revocation {
  drop: ActiveDrop;
  reason: RevokeReason;
}

export type RevokedActiveDrop = ActiveDrop & { revokedQuantity: number };

async function revokeDrops(
  tx: Transaction,
  userId: string,
  revocations: readonly Revocation[],
): Promise<RevokedActiveDrop[]> {
  if (revocations.length === 0) return [];
  const itemIds = [...new Set(revocations.map(({ drop }) => drop.itemId))];
  const held = await tx`
    select item_id, quantity from public.user_items
    where user_id = ${userId} and item_id = any(${itemIds}::uuid[])
    order by item_id
    for update`;
  const balance = new Map(held.map((row) => [row.item_id as string, row.quantity as number]));
  const updates = revocations.map(({ drop, reason }) => {
    const available = balance.get(drop.itemId) ?? 0;
    const revokedQuantity = Math.min(drop.quantity, available);
    balance.set(drop.itemId, available - revokedQuantity);
    return { id: drop.dropId, item_id: drop.itemId, reason, revoked_quantity: revokedQuantity };
  });
  const revoked = await tx`
    update public.drops as target
    set revoked_at = now(), revoke_reason = derived.reason, revoked_quantity = derived.revoked_quantity
    from jsonb_to_recordset(${tx.json(updates as unknown as JsonValue)}) as derived (
      id uuid,
      reason public.revoke_reason,
      revoked_quantity int
    )
    where target.id = derived.id and target.user_id = ${userId} and target.revoked_at is null
    returning target.id`;
  const revokedIds = new Set(revoked.map((row) => row.id as string));
  const revokedDrops = revocations.flatMap(({ drop }, index) =>
    revokedIds.has(drop.dropId) ? [{ ...drop, revokedQuantity: updates[index].revoked_quantity }] : [],
  );
  const debited = updates.filter((update) => revokedIds.has(update.id) && update.revoked_quantity > 0);
  if (debited.length === 0) return revokedDrops;
  await tx`
    insert into public.item_ledger ${tx(
      debited.map((update) => ({
        user_id: userId,
        item_id: update.item_id,
        delta: -update.revoked_quantity,
        reason: 'revoke',
        ref_id: update.id,
      })),
    )}`;
  const totals = sumByItem(debited.map((update) => [update.item_id, update.revoked_quantity]));
  await tx`
    update public.user_items as target
    set quantity = target.quantity - derived.amount, updated_at = now()
    from jsonb_to_recordset(${tx.json([...totals].map(([item_id, amount]) => ({ item_id, amount })) as unknown as JsonValue)})
      as derived (item_id uuid, amount int)
    where target.user_id = ${userId} and target.item_id = derived.item_id`;
  return revokedDrops;
}

export async function revokeDisqualifiedDrops(
  tx: Transaction,
  userId: string,
  current: readonly (LootCandidate & { sessionId: string })[],
  replayedSessionIds: readonly string[],
  deletedSessionIds: readonly string[],
): Promise<RevokedActiveDrop[]> {
  const active = await loadActiveDrops(tx, userId, [...replayedSessionIds, ...deletedSessionIds]);
  const currentBySetId = new Map(current.map((candidate) => [`${candidate.sessionId}:${candidate.setId}`, candidate]));
  const deleted = new Set(deletedSessionIds);
  const revocations = active.flatMap((drop) => {
    const reason = revocationReason(
      drop.source,
      currentBySetId.get(`${drop.sessionId}:${drop.setId}`),
      deleted.has(drop.sessionId),
      DEFAULT_LOOT,
      drop.lootVersion,
    );
    return reason === null ? [] : [{ drop, reason }];
  });
  const revoked = await revokeDrops(tx, userId, revocations);
  await refreshSummaryDrops(tx, replayedSessionIds);
  return revoked;
}
