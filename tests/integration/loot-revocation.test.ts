import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_LOOT } from '@domain/index.ts';
import {
  ageSession,
  builtInExerciseId,
  db,
  grantDrop,
  lootSnapshot,
  postFunction,
  rebuildCaches,
  type TestUser,
} from './local-stack.ts';
import {
  aBout,
  aSet,
  beyondEffortWindow,
  type BoutShape,
  DAY_MS,
  expectLedgerMatchesItems,
  HOUR_MS,
  localDateOf,
  payloadAt,
  postSession,
  rollsOf,
  type SetShape,
  startsOnOneLocalDay,
  trackedUsers,
} from './session-support.ts';

let benchId: string;
let squatId: string;

const { freshUser, checkAndClear } = trackedUsers(expectLedgerMatchesItems);

async function fillCaps(userId: string, localDate: string): Promise<void> {
  const [regular] = await db`select id from public.drop_tables where key = 'regular'`;
  const [rare] = await db`select id from public.drop_tables where key = 'rare'`;
  const rows = [
    ...[0, 1, 2, 3, 4].map((rollIndex) => ({ kind: 'regular', rollIndex, tableId: regular.id, chance: 0.1 })),
    ...[0, 1].map((rollIndex) => ({ kind: 'pr', rollIndex, tableId: rare.id, chance: 1 })),
  ].map((row) => ({
    user_id: userId,
    session_id: randomUUID(),
    set_id: randomUUID(),
    kind: row.kind,
    local_date: localDate,
    roll_index: row.rollIndex,
    drop_table_id: row.tableId,
    chance: row.chance,
    hit: false,
    loot_version: DEFAULT_LOOT.version,
  }));
  await db`insert into public.loot_rolls ${db(rows)}`;
}

async function edit(user: TestUser, session: { id: string }, sets: (SetShape | BoutShape)[], ifRevision = 0) {
  const response = await postFunction('edit-session', user.accessToken, {
    sessionId: session.id,
    ifRevision,
    notes: null,
    sets,
  });
  expect(response.status, response.rawBody).toBe(200);
  return response;
}

async function dropRow(dropId: string) {
  const [row] = await db`
    select id, set_id, item_id, quantity, source, revoked_at, revoke_reason, revoked_quantity
    from public.drops where id = ${dropId}`;
  return row;
}

async function heldQuantity(userId: string, itemId: string): Promise<number> {
  const [row] = await db`select quantity from public.user_items where user_id = ${userId} and item_id = ${itemId}`;
  return row.quantity;
}

async function storedDrops(sessionId: string) {
  const [row] = await db`select summary -> 'drops' as drops from public.sessions where id = ${sessionId}`;
  return row.drops as { dropId: string; source: string }[];
}

async function sessionOnCappedDay(user: TestUser, sets: SetShape[], start = startsOnOneLocalDay(1)[0]) {
  await fillCaps(user.id, localDateOf(start));
  const payload = payloadAt(start, sets);
  const response = await postSession(user, payload);
  expect(await db`select id from public.drops where session_id = ${payload.id}`).toEqual([]);
  return { payload, response };
}

async function prSessionWithDrops(user: TestUser) {
  await postSession(user, payloadAt(new Date(Date.now() - 2 * DAY_MS), [aSet(benchId, 0, 60)]));
  const { payload, response } = await sessionOnCappedDay(user, [aSet(benchId, 0, 80), aSet(squatId, 1, 100)]);
  expect(response.body.prs?.map((pr) => pr.exerciseId)).toEqual([benchId]);
  const prSet = payload.sets[0];
  const regular = await grantDrop(user.id, payload.id, prSet.id, 'grinder_scraps', 3, 'regular');
  const pr = await grantDrop(user.id, payload.id, prSet.id, 'forged_scraps', 2, 'pr');
  const other = await grantDrop(user.id, payload.id, payload.sets[1].id, 'rookie_belt', 1, 'regular');
  return { payload, prSet, regular, pr, other };
}

beforeAll(async () => {
  [benchId, squatId] = await Promise.all([builtInExerciseId('barbell_bench_press'), builtInExerciseId('back_squat')]);
});

afterEach(async () => {
  await checkAndClear();
});

afterAll(async () => {
  await db.end();
});

describe('granted drops', () => {
  it('have the same shape as the rows a real roll writes', async () => {
    const user = await freshUser();
    await postSession(user, payloadAt(new Date(Date.now() - 2 * DAY_MS), [aSet(benchId, 0, 60)]));
    const [start] = startsOnOneLocalDay(1);
    const real = payloadAt(start, [aSet(benchId, 0, 80)]);
    await postSession(user, real);
    const [realDrop] = await db`select * from public.drops where session_id = ${real.id} and source = 'pr'`;
    const granted = await grantDrop(user.id, real.id, randomUUID(), 'forged_scraps', 2, 'pr');
    const [grantedDrop] = await db`select * from public.drops where id = ${granted.dropId}`;
    const [realRoll] = await db`select * from public.loot_rolls where id = ${realDrop.loot_roll_id}`;
    const [grantedRoll] = await db`select * from public.loot_rolls where id = ${granted.lootRollId}`;
    const shape = (row: Record<string, unknown>) =>
      Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? 'null' : typeof value]));
    expect(shape(grantedDrop)).toEqual(shape(realDrop));
    expect(shape(grantedRoll)).toEqual(shape(realRoll));
    expect(grantedRoll).toMatchObject({ kind: 'pr', hit: true, local_date: realRoll.local_date, roll_index: 1 });
    const ledgerFor = async (dropId: string) =>
      await db`select delta, reason from public.item_ledger where ref_id = ${dropId}`;
    expect(await ledgerFor(granted.dropId)).toEqual([{ delta: 2, reason: 'drop' }]);
    expect(await ledgerFor(realDrop.id)).toEqual([{ delta: realDrop.quantity, reason: 'drop' }]);
    expect((await storedDrops(real.id)).map((drop) => drop.dropId)).toContain(granted.dropId);
  });
});

describe('delete-session', () => {
  it('revokes every drop of the deleted session, debits the inventory and keeps rolls and luck', async () => {
    const user = await freshUser();
    const { payload } = await sessionOnCappedDay(user, [aSet(benchId, 0, 60), aSet(squatId, 1, 100)]);
    const granted = [
      await grantDrop(user.id, payload.id, payload.sets[0].id, 'grinder_scraps', 3),
      await grantDrop(user.id, payload.id, payload.sets[1].id, 'rookie_belt', 1),
      await grantDrop(user.id, payload.id, payload.sets[1].id, 'titan_scraps', 2, 'pr'),
    ];
    const firstObtained = await db`
      select item_id, first_obtained_at from public.user_items where user_id = ${user.id} order by item_id`;
    const rollsBefore = await rollsOf(user.id);
    const luckBefore = await db`select * from public.drop_luck where user_id = ${user.id}`;

    const response = await postFunction('delete-session', user.accessToken, { sessionId: payload.id });
    expect(response.status, response.rawBody).toBe(200);
    expect(response.body.revokedDrops?.map((drop) => drop.dropId)).toEqual(granted.map((drop) => drop.dropId));
    for (const drop of granted) {
      const row = await dropRow(drop.dropId);
      expect(row.revoke_reason).toBe('session_deleted');
      expect(row.revoked_quantity).toBe(row.quantity);
      expect(row.revoked_at).not.toBeNull();
      expect(await heldQuantity(user.id, drop.itemId)).toBe(0);
    }
    const revokes = await db`
      select ref_id, delta from public.item_ledger where user_id = ${user.id} and reason = 'revoke' order by id`;
    expect(revokes).toEqual(
      await Promise.all(
        granted.map(async (drop) => ({ ref_id: drop.dropId, delta: -(await dropRow(drop.dropId)).quantity })),
      ),
    );
    expect(
      await db`select item_id, first_obtained_at from public.user_items where user_id = ${user.id} order by item_id`,
    ).toEqual(firstObtained);
    expect(await rollsOf(user.id)).toEqual(rollsBefore);
    expect(await db`select * from public.drop_luck where user_id = ${user.id}`).toEqual(luckBefore);

    const retry = await postFunction('delete-session', user.accessToken, { sessionId: payload.id });
    expect(retry.status).toBe(200);
    expect(retry.body.revokedDrops).toEqual([]);
    expect(
      await db`select ref_id, delta from public.item_ledger where user_id = ${user.id} and reason = 'revoke' order by id`,
    ).toEqual(revokes);
  });

  it('revokes two drops of one item that was partly crafted away in drop order, down to zero', async () => {
    const user = await freshUser();
    const { payload } = await sessionOnCappedDay(user, [aSet(benchId, 0, 60), aSet(benchId, 1, 60)]);
    const first = await grantDrop(user.id, payload.id, payload.sets[0].id, 'grinder_scraps', 3);
    const second = await grantDrop(user.id, payload.id, payload.sets[1].id, 'grinder_scraps', 4);
    await db`
      insert into public.item_ledger (user_id, item_id, delta, reason, ref_id)
      values (${user.id}, ${first.itemId}, -2, 'craft_out', ${randomUUID()})`;
    await db`update public.user_items set quantity = 5 where user_id = ${user.id} and item_id = ${first.itemId}`;

    const response = await postFunction('delete-session', user.accessToken, { sessionId: payload.id });
    expect(response.status).toBe(200);
    expect(response.body.revokedDrops?.map((entry) => [entry.dropId, entry.quantity, entry.revokedQuantity])).toEqual([
      [first.dropId, 3, 3],
      [second.dropId, 4, 2],
    ]);
    expect((await dropRow(first.dropId)).revoked_quantity).toBe(3);
    expect((await dropRow(second.dropId)).revoked_quantity).toBe(2);
    expect(await heldQuantity(user.id, first.itemId)).toBe(0);
  });

  it('records a zero revocation without a ledger entry when the item is already gone', async () => {
    const user = await freshUser();
    const { payload } = await sessionOnCappedDay(user, [aSet(benchId, 0, 60)]);
    const drop = await grantDrop(user.id, payload.id, payload.sets[0].id, 'grinder_scraps', 8);
    await db`
      insert into public.item_ledger (user_id, item_id, delta, reason, ref_id)
      values (${user.id}, ${drop.itemId}, -8, 'craft_out', ${randomUUID()})`;
    await db`update public.user_items set quantity = 0 where user_id = ${user.id} and item_id = ${drop.itemId}`;

    const response = await postFunction('delete-session', user.accessToken, { sessionId: payload.id });
    expect(response.body.revokedDrops?.map((entry) => [entry.dropId, entry.revokedQuantity])).toEqual([
      [drop.dropId, 0],
    ]);
    expect(await dropRow(drop.dropId)).toMatchObject({ revoke_reason: 'session_deleted', revoked_quantity: 0 });
    expect(await db`select * from public.item_ledger where ref_id = ${drop.dropId} and reason = 'revoke'`).toEqual([]);
  });
});

describe('edit-session', () => {
  it('revokes the drop of a removed set and keeps the others', async () => {
    const user = await freshUser();
    const { payload } = await sessionOnCappedDay(user, [aSet(benchId, 0, 60), aSet(squatId, 1, 100)]);
    const kept = await grantDrop(user.id, payload.id, payload.sets[0].id, 'grinder_scraps', 3);
    const removed = await grantDrop(user.id, payload.id, payload.sets[1].id, 'rookie_belt', 1);
    expect((await storedDrops(payload.id)).map((drop) => drop.dropId)).toEqual([kept.dropId, removed.dropId]);

    const response = await edit(user, payload, [payload.sets[0]]);
    expect(response.body.revokedDrops?.map((drop) => drop.dropId)).toEqual([removed.dropId]);
    expect((await dropRow(removed.dropId)).revoke_reason).toBe('set_removed');
    expect((await dropRow(kept.dropId)).revoked_at).toBeNull();
    expect(response.body.summary?.drops.map((drop) => drop.dropId)).toEqual([kept.dropId]);
    expect((await storedDrops(payload.id)).map((drop) => drop.dropId)).toEqual([kept.dropId]);
  });

  it('revokes the drop of a bout edited below the cardio threshold', async () => {
    const user = await freshUser();
    const runId = await builtInExerciseId('running');
    const start = startsOnOneLocalDay(1)[0];
    await fillCaps(user.id, localDateOf(start));
    const payload = payloadAt(start, [aBout(runId, 0, { durationS: 600 })]);
    await postSession(user, payload);
    const drop = await grantDrop(user.id, payload.id, payload.sets[0].id, 'grinder_scraps', 2);
    const response = await edit(user, payload, [{ ...payload.sets[0], durationS: 540 }]);
    expect(response.body.revokedDrops?.map((revoked) => revoked.dropId)).toEqual([drop.dropId]);
    expect((await dropRow(drop.dropId)).revoke_reason).toBe('no_longer_qualifies');
  });

  it('revokes both drops of a set changed to beyond the effort window', async () => {
    const user = await freshUser();
    const { payload, prSet, regular, pr, other } = await prSessionWithDrops(user);
    const response = await edit(user, payload, [{ ...prSet, effort: beyondEffortWindow }, payload.sets[1]]);
    expect(response.body.revokedDrops?.map((drop) => [drop.dropId, drop.source])).toEqual([
      [regular.dropId, 'regular'],
      [pr.dropId, 'pr'],
    ]);
    expect((await dropRow(regular.dropId)).revoke_reason).toBe('no_longer_qualifies');
    expect((await dropRow(pr.dropId)).revoke_reason).toBe('no_longer_qualifies');
    expect((await dropRow(other.dropId)).revoked_at).toBeNull();
  });

  it('keeps drops rolled under an older loot version that the set no longer qualifies for', async () => {
    const user = await freshUser();
    const { payload } = await sessionOnCappedDay(user, [aSet(benchId, 0, 60), aSet(squatId, 1, 100)]);
    const olderVersion = DEFAULT_LOOT.version - 1;
    const legacy = await grantDrop(
      user.id,
      payload.id,
      payload.sets[0].id,
      'grinder_scraps',
      3,
      'regular',
      undefined,
      olderVersion,
    );
    const response = await edit(user, payload, [{ ...payload.sets[0], effort: beyondEffortWindow }, payload.sets[1]]);
    expect(response.body.revokedDrops).toEqual([]);
    expect((await dropRow(legacy.dropId)).revoked_at).toBeNull();
  });

  it('still revokes a drop rolled under an older loot version when its set is removed', async () => {
    const user = await freshUser();
    const { payload } = await sessionOnCappedDay(user, [aSet(benchId, 0, 60), aSet(squatId, 1, 100)]);
    const olderVersion = DEFAULT_LOOT.version - 1;
    const legacy = await grantDrop(
      user.id,
      payload.id,
      payload.sets[1].id,
      'rookie_belt',
      1,
      'regular',
      undefined,
      olderVersion,
    );
    await edit(user, payload, [payload.sets[0]]);
    expect((await dropRow(legacy.dropId)).revoke_reason).toBe('set_removed');
  });

  it('revokes only the PR drop when the PR set becomes lighter but stays hard', async () => {
    const user = await freshUser();
    const { payload, prSet, regular, pr } = await prSessionWithDrops(user);
    const response = await edit(user, payload, [{ ...prSet, weightKg: 60 }, payload.sets[1]]);
    expect(response.body.summary?.prs).toEqual([]);
    expect(response.body.revokedDrops?.map((drop) => drop.dropId)).toEqual([pr.dropId]);
    expect((await dropRow(pr.dropId)).revoke_reason).toBe('no_longer_qualifies');
    expect((await dropRow(regular.dropId)).revoked_at).toBeNull();
  });

  it('revokes the PR drop when the PR set moves to a custom exercise', async () => {
    const user = await freshUser();
    const customId = randomUUID();
    const [chest] = await db`select id from public.skills where key = 'chest'`;
    const saved = await user.client.rpc('save_custom_exercise', {
      exercise: {
        id: customId,
        name: 'Revoked Press',
        loadType: 'external',
        equipment: 'machine',
        shares: [{ skillId: chest.id, shareBp: 10000 }],
      },
    });
    expect(saved.error).toBeNull();
    await postSession(user, payloadAt(new Date(Date.now() - 3 * DAY_MS), [aSet(customId, 0, 40)]));
    const { payload, prSet, regular, pr } = await prSessionWithDrops(user);
    const response = await edit(user, payload, [{ ...prSet, exerciseId: customId }, payload.sets[1]]);
    expect(response.body.summary?.prs.map((record) => record.exerciseId)).toEqual([customId]);
    expect(response.body.revokedDrops?.map((drop) => drop.dropId)).toEqual([pr.dropId]);
    expect((await dropRow(pr.dropId)).revoke_reason).toBe('no_longer_qualifies');
    expect((await dropRow(regular.dropId)).revoked_at).toBeNull();
  });

  it('answers a no-op edit with no revoked drops', async () => {
    const user = await freshUser();
    const { payload } = await prSessionWithDrops(user);
    const response = await edit(user, payload, payload.sets);
    expect(response.body.revokedDrops).toEqual([]);
    expect(response.body.replayedSessionIds).toEqual([]);
  });
});

describe('out-of-order sync', () => {
  it('revokes a later PR drop that an earlier, heavier session now beats', async () => {
    const user = await freshUser();
    const [s2Start] = startsOnOneLocalDay(1);
    const s0 = payloadAt(new Date(s2Start.getTime() - 50 * HOUR_MS), [aSet(benchId, 0, 60)]);
    await postSession(user, s0);
    const { payload: s2, response: s2Response } = await sessionOnCappedDay(user, [aSet(benchId, 0, 100)], s2Start);
    expect(s2Response.body.prs).toHaveLength(1);
    const s2Pr = await grantDrop(user.id, s2.id, s2.sets[0].id, 'forged_scraps', 2, 'pr');
    expect((await storedDrops(s2.id)).map((drop) => drop.dropId)).toEqual([s2Pr.dropId]);

    const s1 = payloadAt(new Date(s2Start.getTime() - 26 * HOUR_MS), [aSet(benchId, 0, 105)]);
    expect(localDateOf(new Date(s1.startedAt))).not.toBe(localDateOf(s2Start));
    const s1Response = await postSession(user, s1);

    expect(await dropRow(s2Pr.dropId)).toMatchObject({ revoke_reason: 'no_longer_qualifies', revoked_quantity: 2 });
    expect(await storedDrops(s2.id)).toEqual([]);
    const s1Rolls = (await rollsOf(user.id)).filter((row) => row.session_id === s1.id);
    expect(s1Rolls.map((row) => [row.kind, row.local_date])).toEqual(
      expect.arrayContaining([['pr', localDateOf(new Date(s1.startedAt))]]),
    );
    expect(s1Rolls.find((row) => row.kind === 'pr')?.hit).toBe(true);
    expect(s1Response.body.drops?.filter((drop) => drop.source === 'pr')).toHaveLength(1);
  });
});

describe('revocation is final and edits never roll', () => {
  it('keeps a drop revoked after the set qualifies again, with no new roll', async () => {
    const user = await freshUser();
    await postSession(user, payloadAt(new Date(Date.now() - 2 * DAY_MS), [aSet(benchId, 0, 60)]));
    const [start] = startsOnOneLocalDay(1);
    const session = payloadAt(start, [aSet(benchId, 0, 80)]);
    await postSession(user, session);
    const [prDrop] = await db`select id from public.drops where session_id = ${session.id} and source = 'pr'`;
    const rollsBefore = await rollsOf(user.id);

    await edit(user, session, [{ ...session.sets[0], weightKg: 50 }]);
    expect((await dropRow(prDrop.id)).revoke_reason).toBe('no_longer_qualifies');
    const restored = await edit(user, session, session.sets, 1);
    expect(restored.body.summary?.prs).toHaveLength(1);
    expect(restored.body.revokedDrops).toEqual([]);
    expect((await dropRow(prDrop.id)).revoke_reason).toBe('no_longer_qualifies');
    expect(await rollsOf(user.id)).toEqual(rollsBefore);
    expect(restored.body.summary?.drops.some((drop) => drop.dropId === prDrop.id)).toBe(false);
  });

  it('never rolls for a qualifying PR set added by an edit', async () => {
    const user = await freshUser();
    await postSession(user, payloadAt(new Date(Date.now() - 2 * DAY_MS), [aSet(benchId, 0, 60)]));
    const [start] = startsOnOneLocalDay(1);
    const session = payloadAt(start, [aSet(benchId, 0, 50)]);
    await postSession(user, session);
    const added = aSet(benchId, 1, 90);
    const response = await edit(user, session, [...session.sets, added]);
    expect(response.body.summary?.prs).toHaveLength(1);
    expect(await db`select * from public.loot_rolls where set_id = ${added.id}`).toEqual([]);
  });
});

describe('neighbours and rebuild', () => {
  it('leaves a drop in a session older than 7 days untouched by an edit of a later session', async () => {
    const user = await freshUser();
    const { payload: old } = await sessionOnCappedDay(user, [aSet(benchId, 0, 100)]);
    const oldDrop = await grantDrop(user.id, old.id, old.sets[0].id, 'grinder_scraps', 3);
    await ageSession(old.id, '8 days');
    const before = await dropRow(oldDrop.dropId);

    const [start] = startsOnOneLocalDay(1);
    const later = payloadAt(start, [aSet(benchId, 0, 60)]);
    await postSession(user, later);
    const response = await edit(user, later, [{ ...later.sets[0], effort: beyondEffortWindow }]);
    expect(response.body.replayedSessionIds).not.toContain(old.id);
    expect(await dropRow(oldDrop.dropId)).toEqual(before);
    expect(before.revoked_at).toBeNull();
  });

  it('rebuilds caches without touching drops, revoked or not', async () => {
    const user = await freshUser();
    const { payload, prSet } = await prSessionWithDrops(user);
    await edit(user, payload, [{ ...prSet, weightKg: 50 }, payload.sets[1]]);
    const before = await lootSnapshot(user.id);
    expect(before.drops.some((drop) => drop.revoked_at !== null)).toBe(true);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await lootSnapshot(user.id)).toEqual(before);
  });
});
