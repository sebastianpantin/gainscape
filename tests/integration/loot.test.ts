import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOT,
  type LootCandidate,
  type LootTables,
  pickEntry,
  quantityFor,
  rollSessionLoot,
} from '@domain/index.ts';
import {
  aSet,
  DAY_MS,
  HOUR_MS,
  localDateOf,
  payloadAt,
  postSession as post,
  rollsOf,
  startsOnOneLocalDay,
  TIMEZONE,
} from './loot-support.ts';
import {
  activeDropSummaries,
  builtInExerciseId,
  createTestUser,
  db,
  hmacRngFor,
  ledgerMismatches,
  lootSnapshot,
  lootTablesFromDb,
  postFunction,
  rebuildCaches,
  type TestUser,
} from './local-stack.ts';

async function lootCounts(userId: string) {
  const [counts] = await db`
    select (select count(*) from public.loot_rolls where user_id = ${userId})::int as loot_rolls,
           (select count(*) from public.drops where user_id = ${userId})::int as drops,
           (select count(*) from public.item_ledger where user_id = ${userId})::int as item_ledger,
           (select count(*) from public.user_items where user_id = ${userId})::int as user_items,
           (select count(*) from public.drop_luck where user_id = ${userId})::int as drop_luck`;
  return counts;
}

async function storedCandidates(sessionId: string): Promise<LootCandidate[]> {
  const rows = await db`
    select st.id, st.position, st.effective_reps, e.owner_user_id is null as built_in
    from public.sets st join public.exercises e on e.id = st.exercise_id
    where st.session_id = ${sessionId} order by st.position`;
  return rows.map((row) => ({
    setId: row.id,
    position: row.position,
    effectiveReps: row.effective_reps,
    personalRecord: false,
    builtIn: row.built_in,
  }));
}

const usersToCheck: string[] = [];

async function freshUser(): Promise<TestUser> {
  const user = await createTestUser(TIMEZONE);
  usersToCheck.push(user.id);
  return user;
}

let benchId: string;
let squatId: string;
let deadliftId: string;
let rowId: string;
let tables: LootTables;

beforeAll(async () => {
  [benchId, squatId, deadliftId, rowId] = await Promise.all([
    builtInExerciseId('barbell_bench_press'),
    builtInExerciseId('back_squat'),
    builtInExerciseId('deadlift'),
    builtInExerciseId('barbell_row'),
  ]);
  tables = await lootTablesFromDb();
});

afterAll(async () => {
  for (const userId of usersToCheck) expect(await ledgerMismatches(userId), userId).toEqual([]);
  await db.end();
});

describe('the roll pass through the stack', () => {
  it('writes exactly the rolls and drops the domain computes from the stored outputs and the secret', async () => {
    const user = await freshUser();
    const [start] = startsOnOneLocalDay(1);
    const payload = payloadAt(start, [
      aSet(benchId, 0, 40, { isWarmup: true }),
      aSet(benchId, 1, 50, { isWarmup: true }),
      aSet(benchId, 2, 60, { effort: { type: 'level', level: 'easy' } }),
      aSet(benchId, 3, 70),
      aSet(benchId, 4, 72.5),
      aSet(squatId, 5, 100, { effort: { type: 'level', level: 'near_failure' } }),
      aSet(squatId, 6, 100, { effort: null }),
    ]);
    const response = await post(user, payload);
    expect(response.body.prs).toEqual([]);

    const expected = rollSessionLoot(
      await storedCandidates(payload.id),
      tables,
      { regularUsed: 0, prUsed: 0, dryRolls: 0, alreadyRolled: new Set() },
      DEFAULT_LOOT,
      hmacRngFor(user.id),
    );
    expect(expected.rolls.length).toBe(3);
    const rolls = await rollsOf(user.id);
    expect(
      rolls.map((row) => ({
        setId: row.set_id,
        kind: row.kind,
        tableId: row.drop_table_id,
        rollIndex: row.roll_index,
        chance: row.chance,
        hit: row.hit,
      })),
    ).toEqual(
      expected.rolls.map((roll) => ({
        setId: roll.setId,
        kind: roll.kind,
        tableId: roll.tableId,
        rollIndex: roll.rollIndex,
        chance: roll.chance,
        hit: roll.hit,
      })),
    );
    expect(rolls.every((row) => row.local_date === localDateOf(start) && row.loot_version === 1)).toBe(true);

    const drops = await db`
      select set_id, item_id, quantity, source from public.drops where session_id = ${payload.id} order by set_id`;
    expect(drops).toEqual(
      expected.rolls
        .filter((roll) => roll.drop !== null)
        .map((roll) => ({
          set_id: roll.setId,
          item_id: roll.drop!.itemId,
          quantity: roll.drop!.quantity,
          source: roll.kind,
        }))
        .sort((a, b) => a.set_id.localeCompare(b.set_id)),
    );
    const [luck] = await db`select dry_rolls from public.drop_luck where user_id = ${user.id}`;
    expect(luck.dry_rolls).toBe(expected.dryRolls);
    expect(response.body.drops).toEqual(await activeDropSummaries(payload.id));
    const [stored] = await db`select summary -> 'drops' as drops from public.sessions where id = ${payload.id}`;
    expect(stored.drops).toEqual(response.body.drops);
  });
});

describe('daily caps by the session local date', () => {
  it('rolls 5 regular rolls a day, none for a second session that day, and again for another day', async () => {
    const user = await freshUser();
    const [first, second] = startsOnOneLocalDay(2);
    const sevenSets = () => Array.from({ length: 7 }, (_, position) => aSet(benchId, position, 50 + position));
    const firstPayload = payloadAt(first, sevenSets());
    await post(user, firstPayload);
    const afterFirst = await rollsOf(user.id);
    expect(afterFirst.filter((row) => row.kind === 'regular').map((row) => row.roll_index)).toEqual([0, 1, 2, 3, 4]);
    expect(afterFirst.map((row) => row.set_id)).toEqual(firstPayload.sets.slice(0, 5).map((set) => set.id));

    await post(user, payloadAt(second, sevenSets()));
    expect(await rollsOf(user.id)).toEqual(afterFirst);

    const earlier = payloadAt(new Date(Date.now() - 2 * DAY_MS), sevenSets());
    await post(user, earlier);
    const earlierRolls = (await rollsOf(user.id)).filter((row) => row.session_id === earlier.id);
    expect(earlierRolls.filter((row) => row.kind === 'regular').map((row) => row.roll_index)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(earlierRolls.map((row) => row.local_date))).toEqual(
      new Set([localDateOf(new Date(earlier.startedAt))]),
    );
    expect(localDateOf(new Date(earlier.startedAt))).not.toBe(localDateOf(first));
  });

  it('keeps counting rolls from a deleted session, so relogging the same day rolls nothing', async () => {
    const user = await freshUser();
    const [first, second] = startsOnOneLocalDay(2);
    const doomed = payloadAt(
      first,
      Array.from({ length: 5 }, (_, position) => aSet(benchId, position, 60)),
    );
    await post(user, doomed);
    const rollsBefore = await rollsOf(user.id);
    expect(rollsBefore).toHaveLength(5);
    const luckBefore = await db`select * from public.drop_luck where user_id = ${user.id}`;

    expect((await postFunction('delete-session', user.accessToken, { sessionId: doomed.id })).status).toBe(200);
    await post(
      user,
      payloadAt(
        second,
        Array.from({ length: 5 }, (_, position) => aSet(benchId, position, 60)),
      ),
    );

    expect(await rollsOf(user.id)).toEqual(rollsBefore);
    expect(await db`select * from public.drop_luck where user_id = ${user.id}`).toEqual(luckBefore);
  });
});

describe('PR rolls', () => {
  it('gives a baseline none and a heavier session exactly one guaranteed rare drop', async () => {
    const user = await freshUser();
    const [baseline, heavier] = startsOnOneLocalDay(2);
    await post(user, payloadAt(baseline, [aSet(benchId, 0, 60)]));
    expect((await rollsOf(user.id)).filter((row) => row.kind === 'pr')).toEqual([]);

    const prSession = payloadAt(heavier, [aSet(benchId, 0, 80)]);
    const response = await post(user, prSession);
    expect(response.body.prs).toHaveLength(1);
    const prRolls = (await rollsOf(user.id)).filter((row) => row.kind === 'pr');
    expect(prRolls).toHaveLength(1);
    expect(prRolls[0]).toMatchObject({ hit: true, chance: 1, drop_table_id: tables.rare.id, roll_index: 0 });
    const prDrops = await db`
      select item_id from public.drops where session_id = ${prSession.id} and source = 'pr'`;
    expect(prDrops).toHaveLength(1);
    expect(tables.rare.entries.map((entry) => entry.itemId)).toContain(prDrops[0].item_id);
  });

  it('caps PR rolls at 2 a day across exercises', async () => {
    const user = await freshUser();
    await post(
      user,
      payloadAt(new Date(Date.now() - 2 * DAY_MS), [
        aSet(benchId, 0, 60),
        aSet(squatId, 1, 80),
        aSet(deadliftId, 2, 100),
      ]),
    );
    const [today] = startsOnOneLocalDay(1);
    const prSession = payloadAt(today, [aSet(benchId, 0, 70), aSet(squatId, 1, 90), aSet(deadliftId, 2, 110)]);
    const response = await post(user, prSession);
    expect(response.body.prs).toHaveLength(3);
    const prRolls = (await rollsOf(user.id)).filter((row) => row.kind === 'pr' && row.session_id === prSession.id);
    expect(prRolls.map((row) => row.set_id)).toEqual(prSession.sets.slice(0, 2).map((set) => set.id));
  });

  it('gives a custom-exercise PR a regular roll only', async () => {
    const user = await freshUser();
    const customId = randomUUID();
    const [chest] = await db`select id from public.skills where key = 'chest'`;
    const saved = await user.client.rpc('save_custom_exercise', {
      exercise: {
        id: customId,
        name: 'Loot Press',
        loadType: 'external',
        equipment: 'machine',
        shares: [{ skillId: chest.id, shareBp: 10000 }],
      },
    });
    expect(saved.error).toBeNull();
    const [baseline, heavier] = startsOnOneLocalDay(2);
    await post(user, payloadAt(baseline, [aSet(customId, 0, 40)]));
    const prSession = payloadAt(heavier, [aSet(customId, 0, 60)]);
    const response = await post(user, prSession);
    expect(response.body.prs).toHaveLength(1);
    const rolls = (await rollsOf(user.id)).filter((row) => row.session_id === prSession.id);
    expect(rolls.map((row) => row.kind)).toEqual(['regular']);
  });
});

describe('sessions that never roll', () => {
  it('stores a history-only session with no rolls', async () => {
    const user = await freshUser();
    const response = await post(
      user,
      payloadAt(new Date(Date.now() - 8 * DAY_MS), [aSet(benchId, 0, 60), aSet(benchId, 1, 60)]),
    );
    expect(response.body.historyOnly).toBe(true);
    expect(response.body.drops).toEqual([]);
    expect(await lootCounts(user.id)).toEqual({ loot_rolls: 0, drops: 0, item_ledger: 0, user_items: 0, drop_luck: 0 });
  });

  it('answers a retry with the stored body and rolls nothing new', async () => {
    const user = await freshUser();
    const [start] = startsOnOneLocalDay(1);
    const payload = payloadAt(start, [aSet(benchId, 0, 60), aSet(benchId, 1, 60), aSet(benchId, 2, 60)]);
    const first = await post(user, payload);
    const countsAfterFirst = await lootCounts(user.id);
    expect(countsAfterFirst.loot_rolls).toBe(3);
    const retry = await post(user, payload);
    expect(retry.rawBody).toBe(first.rawBody);
    expect(await lootCounts(user.id)).toEqual(countsAfterFirst);
  });

  it('gives unrated cold-start sets no rolls', async () => {
    const user = await freshUser();
    const [start] = startsOnOneLocalDay(1);
    await post(
      user,
      payloadAt(start, [aSet(benchId, 0, 60, { effort: null }), aSet(squatId, 1, 90, { effort: null })]),
    );
    expect((await lootCounts(user.id)).loot_rolls).toBe(0);
  });
});

describe('inventory', () => {
  it('sums two drops of one item in one session into one user_items row', async () => {
    const user = await freshUser();
    const rngFor = hmacRngFor(user.id);
    const hitsByItem = new Map<string, { setId: string; quantity: number }[]>();
    let pair: { setId: string; quantity: number }[] | undefined;
    for (let attempt = 0; attempt < 5000 && pair === undefined; attempt += 1) {
      const setId = randomUUID();
      const rng = rngFor(setId, 'regular');
      if (rng.next() >= DEFAULT_LOOT.baseChance) continue;
      const entry = pickEntry(tables.regular, rng.next());
      const quantity = quantityFor(entry, rng.next());
      const hits = [...(hitsByItem.get(entry.itemId) ?? []), { setId, quantity }];
      hitsByItem.set(entry.itemId, hits);
      if (hits.length === 2) pair = hits;
    }
    expect(pair).toBeDefined();
    const [start] = startsOnOneLocalDay(1);
    const payload = payloadAt(start, [
      { ...aSet(benchId, 0, 60), id: pair![0].setId },
      { ...aSet(benchId, 1, 60), id: pair![1].setId },
    ]);
    await post(user, payload);

    const drops = await db`select item_id, quantity from public.drops where session_id = ${payload.id}`;
    expect(drops).toHaveLength(2);
    expect(drops[0].item_id).toBe(drops[1].item_id);
    const items = await db`select item_id, quantity from public.user_items where user_id = ${user.id}`;
    expect(items).toEqual([{ item_id: drops[0].item_id, quantity: pair![0].quantity + pair![1].quantity }]);
    const ledger = await db`select delta, reason from public.item_ledger where user_id = ${user.id} order by id`;
    expect(ledger).toEqual(pair!.map((hit) => ({ delta: hit.quantity, reason: 'drop' })));
  });

  it('keeps user_items equal to the ledger, with first_obtained_at at the first entry', async () => {
    expect(usersToCheck.length).toBeGreaterThan(0);
    for (const userId of usersToCheck) {
      expect(await ledgerMismatches(userId)).toEqual([]);
      const late = await db`
        select u.item_id from public.user_items u
        where u.user_id = ${userId} and u.first_obtained_at <> (
          select min(l.created_at) from public.item_ledger l
          where l.user_id = u.user_id and l.item_id = u.item_id and l.delta > 0)`;
      expect(late).toEqual([]);
    }
  });
});

describe('scrolls', () => {
  it('unlocks the variation when a PR roll drops its scroll', async () => {
    const user = await freshUser();
    const rngFor = hmacRngFor(user.id);
    const scrolls = await db`select id, key, grants_exercise_id from public.items where kind = 'scroll'`;
    const scrollById = new Map(scrolls.map((row) => [row.id as string, row]));
    let chosen: { setId: string; itemId: string } | undefined;
    for (let attempt = 0; attempt < 200 && chosen === undefined; attempt += 1) {
      const setId = randomUUID();
      const entry = pickEntry(tables.rare, rngFor(setId, 'pr').next());
      if (scrollById.has(entry.itemId)) chosen = { setId, itemId: entry.itemId };
    }
    expect(chosen).toBeDefined();
    const scroll = scrollById.get(chosen!.itemId)!;

    const [baseline, heavier, after] = startsOnOneLocalDay(3);
    await post(user, payloadAt(baseline, [aSet(benchId, 0, 60)]));
    const prSession = payloadAt(heavier, [{ ...aSet(benchId, 0, 80), id: chosen!.setId }]);
    const response = await post(user, prSession);
    expect(response.body.drops?.filter((drop) => drop.source === 'pr')).toEqual([
      expect.objectContaining({ setId: chosen!.setId, itemId: scroll.id, itemKey: scroll.key, quantity: 1 }),
    ]);

    const unlocks =
      await db`select exercise_id, item_id, source_drop_id from public.user_unlocks where user_id = ${user.id}`;
    const [scrollDrop] = await db`select id from public.drops where set_id = ${chosen!.setId} and source = 'pr'`;
    expect(unlocks).toEqual([
      { exercise_id: scroll.grants_exercise_id, item_id: scroll.id, source_drop_id: scrollDrop.id },
    ]);
    const visible = await user.client.from('exercises').select('id').eq('id', scroll.grants_exercise_id);
    expect(visible.data).toEqual([{ id: scroll.grants_exercise_id }]);

    await post(user, payloadAt(after, [aSet(scroll.grants_exercise_id, 0, 50)]));
  });
});

describe('immutability', () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await freshUser();
    const [start] = startsOnOneLocalDay(1);
    await post(
      user,
      payloadAt(
        start,
        Array.from({ length: 5 }, (_, position) => aSet(rowId, position, 60)),
      ),
    );
    await db`
      insert into public.item_ledger (user_id, item_id, delta, reason, ref_id)
      select ${user.id}, id, 1, 'drop', gen_random_uuid() from public.items where key = 'plate_crab'`;
    await db`
      insert into public.user_items (user_id, item_id, quantity)
      select ${user.id}, id, 1 from public.items where key = 'plate_crab'
      on conflict (user_id, item_id) do update set quantity = public.user_items.quantity + 1`;
  });

  it('rejects updating or deleting a loot roll', async () => {
    const before = await rollsOf(user.id);
    await expect(db`update public.loot_rolls set hit = true where user_id = ${user.id}`).rejects.toThrow('append_only');
    await expect(db`delete from public.loot_rolls where user_id = ${user.id}`).rejects.toThrow('append_only');
    expect(await rollsOf(user.id)).toEqual(before);
    expect(before).toHaveLength(5);
  });

  it('rejects updating or deleting a ledger entry', async () => {
    const before = await db`select * from public.item_ledger where user_id = ${user.id} order by id`;
    await expect(db`update public.item_ledger set delta = 100 where user_id = ${user.id}`).rejects.toThrow(
      'append_only',
    );
    await expect(db`delete from public.item_ledger where user_id = ${user.id}`).rejects.toThrow('append_only');
    expect(await db`select * from public.item_ledger where user_id = ${user.id} order by id`).toEqual(before);
    expect(before.length).toBeGreaterThan(0);
  });

  it('rejects truncating the loot rolls or the ledger', async () => {
    const [rollsBefore] = await db`select count(*)::int as count from public.loot_rolls`;
    const [ledgerBefore] = await db`select count(*)::int as count from public.item_ledger`;
    await expect(db`truncate public.loot_rolls cascade`).rejects.toThrow('append_only');
    await expect(db`truncate public.item_ledger`).rejects.toThrow('append_only');
    expect((await db`select count(*)::int as count from public.loot_rolls`)[0]).toEqual(rollsBefore);
    expect((await db`select count(*)::int as count from public.item_ledger`)[0]).toEqual(ledgerBefore);
    expect(rollsBefore.count).toBeGreaterThan(0);
  });
});

describe('rebuild', () => {
  it('never touches loot', async () => {
    const user = await freshUser();
    const [start] = startsOnOneLocalDay(1);
    await post(user, payloadAt(new Date(Date.now() - 3 * DAY_MS), [aSet(benchId, 0, 60), aSet(squatId, 1, 80)]));
    await post(user, payloadAt(start, [aSet(benchId, 0, 70), aSet(squatId, 1, 90), aSet(benchId, 2, 70)]));
    const before = await lootSnapshot(user.id);
    expect(before.lootRolls.length).toBeGreaterThan(0);
    const rebuilt = await rebuildCaches(user.id);
    expect(rebuilt.status).toBe(200);
    expect(await lootSnapshot(user.id)).toEqual(before);
  });
});

describe('out-of-order sync', () => {
  it('rolls only for the late session, on its own local date, and never for the sessions it replays', async () => {
    const user = await freshUser();
    const [start] = startsOnOneLocalDay(1);
    const later = payloadAt(start, [aSet(benchId, 0, 60)]);
    await post(user, later);
    const rollsBefore = await rollsOf(user.id);
    const earlier = payloadAt(new Date(Date.now() - 30 * HOUR_MS), [aSet(benchId, 0, 60), aSet(benchId, 1, 60)]);
    await post(user, earlier);
    const rolls = await rollsOf(user.id);
    expect(rolls.filter((row) => row.session_id === later.id)).toEqual(rollsBefore);
    expect(rolls.filter((row) => row.session_id === earlier.id).map((row) => row.set_id)).toEqual(
      earlier.sets.map((set) => set.id),
    );
  });
});
