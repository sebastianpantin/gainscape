import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  type FeedExercise,
  feedEventsForSession,
  type ItemRarityRank,
  type LootTables,
  pickEntry,
} from '@domain/index.ts';
import {
  aBout,
  aSet,
  createCustomExercise,
  DAY_MS,
  hoursAgo,
  payloadAt,
  postSession,
  type SessionPayload,
  type SetShape,
  trackedUsers,
} from './session-support.ts';
import {
  builtInExerciseId,
  db,
  eventIds,
  eventsSnapshot,
  hmacRngFor,
  lootTablesFromDb,
  postFunction,
  rebuildCaches,
  setBodyweight,
  type TestUser,
} from './local-stack.ts';

let benchId: string;
let dipId: string;
let crunchId: string;
let legPressId: string;
let tables: LootTables;

function unrated(exerciseId: string, position: number, weightKg: number, reps: number): SetShape {
  return aSet(exerciseId, position, weightKg, { reps, effort: null });
}

async function storedEvents(userId: string, sessionId?: string) {
  return await db`
    select id, session_id, event_key, type, set_id, occurred_at, payload, updated_at
    from public.events
    where user_id = ${userId} and (${sessionId ?? null}::uuid is null or session_id = ${sessionId ?? null})
    order by event_key`;
}

async function storedLevelEvents(userId: string, sessionId?: string) {
  return (await storedEvents(userId, sessionId)).filter((event) => event.type === 'level_up');
}

async function editSession(user: TestUser, session: SessionPayload, sets: SetShape[]) {
  const [row] = await db`select revision from public.sessions where id = ${session.id}`;
  const response = await postFunction('edit-session', user.accessToken, {
    sessionId: session.id,
    ifRevision: row.revision,
    notes: session.notes,
    sets,
  });
  expect(response.status, response.rawBody).toBe(200);
  return response;
}

async function expectEventsMatchSummaries(userId: string): Promise<void> {
  const sessions = await db`select id, summary, ended_at from public.sessions where user_id = ${userId}`;
  const setRows = await db`
    select id, session_id, effective_load_kg::float
    from public.sets where user_id = ${userId} and not is_warmup`;
  const exerciseRows = await db`
    select id, owner_user_id, load_type from public.exercises
    where owner_user_id is null or owner_user_id = ${userId}`;
  const itemRows = await db`select id, rarity from public.items`;
  const exercises = new Map<string, FeedExercise>(
    exerciseRows.map((row) => [row.id, { builtIn: row.owner_user_id === null, loadType: row.load_type }]),
  );
  const rarity = new Map<string, ItemRarityRank>(itemRows.map((row) => [row.id, row.rarity]));
  const expected = sessions
    .flatMap((session) =>
      feedEventsForSession(
        session.summary,
        setRows
          .filter((set) => set.session_id === session.id)
          .map((set) => ({ id: set.id, effectiveLoadKg: set.effective_load_kg })),
        exercises,
        rarity,
      ).map((draft) => ({
        session_id: session.id,
        event_key: draft.key,
        type: draft.type,
        set_id: draft.setId,
        occurred_at: new Date(session.ended_at).toISOString(),
        payload: draft.payload,
      })),
    )
    .sort((a, b) => `${a.session_id}${a.event_key}`.localeCompare(`${b.session_id}${b.event_key}`));
  const stored = (await storedEvents(userId))
    .map((row) => ({
      session_id: row.session_id,
      event_key: row.event_key,
      type: row.type,
      set_id: row.set_id,
      occurred_at: new Date(row.occurred_at).toISOString(),
      payload: row.payload,
    }))
    .sort((a, b) => `${a.session_id}${a.event_key}`.localeCompare(`${b.session_id}${b.event_key}`));
  expect(stored).toEqual(expected);
}

const { freshUser, checkAndClear } = trackedUsers(expectEventsMatchSummaries);

function pickSetIdWhoseRareDropIs(
  user: TestUser,
  wanted: (rarity: ItemRarityRank) => boolean,
  rarity: Map<string, ItemRarityRank>,
) {
  const rngFor = hmacRngFor(user.id);
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const setId = randomUUID();
    const entry = pickEntry(tables.rare, rngFor(setId, 'pr').next());
    if (wanted(rarity.get(entry.itemId)!)) return { setId, itemId: entry.itemId, itemKey: entry.itemKey };
  }
  throw new Error('no set id found within 200 tries');
}

beforeAll(async () => {
  [benchId, dipId, crunchId, legPressId] = await Promise.all([
    builtInExerciseId('barbell_bench_press'),
    builtInExerciseId('weighted_dip'),
    builtInExerciseId('cable_crunch'),
    builtInExerciseId('leg_press'),
  ]);
  tables = await lootTablesFromDb();
});

afterEach(async () => {
  await checkAndClear();
});

afterAll(async () => {
  await db.end();
});

describe('PR events', () => {
  it('posts one PR for the heavier session, linked to its set and end time', async () => {
    const user = await freshUser();
    const baseline = payloadAt(hoursAgo(3), [aSet(benchId, 0, 60)]);
    const heavier = payloadAt(hoursAgo(1), [aSet(benchId, 0, 80)]);
    await postSession(user, baseline);
    await postSession(user, heavier);

    expect((await storedEvents(user.id, baseline.id)).filter((event) => event.type === 'pr')).toEqual([]);
    const prs = (await storedEvents(user.id, heavier.id)).filter((event) => event.type === 'pr');
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      event_key: `pr:${benchId}`,
      set_id: heavier.sets[0].id,
      payload: {
        exerciseId: benchId,
        kind: 'rep_max',
        reps: 5,
        loadKg: 80,
        previousLoadKg: 60,
        previousReps: null,
        totalLoadKg: null,
      },
    });
    expect(new Date(prs[0].occurred_at).toISOString()).toBe(heavier.endedAt);
  });

  it('reports the added weight and the total for bodyweight-plus', async () => {
    const user = await freshUser();
    await setBodyweight(user, 80);
    await postSession(user, payloadAt(hoursAgo(3), [aSet(dipId, 0, 10)]));
    const heavier = payloadAt(hoursAgo(1), [aSet(dipId, 0, 20)]);
    await postSession(user, heavier);
    const [pr] = (await storedEvents(user.id, heavier.id)).filter((event) => event.type === 'pr');
    expect(pr.payload).toMatchObject({ loadKg: 20, previousLoadKg: 10, totalLoadKg: 100 });
  });

  it('never judges a record against a later session', async () => {
    const user = await freshUser();
    const later = payloadAt(hoursAgo(1), [aSet(benchId, 0, 105)]);
    const earlier = payloadAt(hoursAgo(3), [aSet(benchId, 0, 100)]);
    await postSession(user, later);
    await postSession(user, earlier);
    expect((await storedEvents(user.id, earlier.id)).filter((event) => event.type === 'pr')).toEqual([]);
    const [pr] = (await storedEvents(user.id, later.id)).filter((event) => event.type === 'pr');
    expect(pr.payload).toMatchObject({ loadKg: 105, previousLoadKg: 100 });
  });

  it('keeps custom exercise PRs out of the feed', async () => {
    const user = await freshUser();
    const customId = await createCustomExercise(user);
    await postSession(user, payloadAt(hoursAgo(3), [aSet(customId, 0, 40)]));
    await postSession(user, payloadAt(hoursAgo(1), [aSet(customId, 0, 60)]));
    expect((await storedEvents(user.id)).filter((event) => event.type === 'pr')).toEqual([]);
  });

  it('posts nothing for a history-only session', async () => {
    const user = await freshUser();
    const old = payloadAt(new Date(Date.now() - 8 * DAY_MS), [aSet(benchId, 0, 100), aSet(crunchId, 1, 30)]);
    const response = await postSession(user, old);
    expect(response.body.historyOnly).toBe(true);
    expect(await storedEvents(user.id)).toEqual([]);
  });
});

describe('cardio PR events', () => {
  it('posts one flat PR event per record-setting bout, keyed and linked by the bout', async () => {
    const user = await freshUser();
    const runId = await builtInExerciseId('running');
    await postSession(user, payloadAt(hoursAgo(3), [aBout(runId, 0, { durationS: 1800, distanceM: 5000 })]));
    const longer = payloadAt(hoursAgo(1), [aBout(runId, 0, { durationS: 2160, distanceM: 6000 })]);
    await postSession(user, longer);
    const prs = (await storedEvents(user.id, longer.id)).filter((event) => event.type === 'pr');
    expect(prs).toHaveLength(1);
    expect(prs[0]).toMatchObject({
      event_key: `pr:${longer.sets[0].id}`,
      set_id: longer.sets[0].id,
      payload: {
        exerciseId: runId,
        kind: 'cardio',
        recordKinds: 'distance,duration',
        distanceM: 6000,
        previousDistanceM: 5000,
        paceSPerKm: null,
        previousPaceSPerKm: null,
        countedWorkS: 2160,
        previousCountedWorkS: 1800,
      },
    });
  });
});

describe('level events', () => {
  it('re-derives level events when an earlier session syncs late', async () => {
    const [outOfOrder, inOrder] = [await freshUser(), await freshUser()];
    const earlyStart = hoursAgo(3);
    const lateStart = hoursAgo(1);
    const earlyFor = () => payloadAt(earlyStart, [aSet(crunchId, 0, 30, { reps: 8 })]);
    const lateFor = () => payloadAt(lateStart, [unrated(crunchId, 0, 30, 8)]);

    const early = earlyFor();
    const late = lateFor();
    await postSession(inOrder, early);
    expect(await storedLevelEvents(inOrder.id)).toEqual([]);
    await postSession(inOrder, late);
    const [levelUp] = await storedLevelEvents(inOrder.id, late.id);
    expect(levelUp).toMatchObject({
      event_key: 'level:core',
      type: 'level_up',
      set_id: null,
      payload: { skill: 'core', from: 6, to: 10 },
    });

    const lateFirst = lateFor();
    await postSession(outOfOrder, lateFirst);
    expect(await storedLevelEvents(outOfOrder.id)).toEqual([]);
    await postSession(outOfOrder, earlyFor());
    const [rederived] = await storedLevelEvents(outOfOrder.id, lateFirst.id);
    expect(rederived).toMatchObject({ type: 'level_up', payload: { skill: 'core', from: 6, to: 10 } });
    const levelKeysAndPayloads = async (userId: string) =>
      (await storedLevelEvents(userId)).map(({ event_key, payload }) => ({ event_key, payload }));
    expect(await levelKeysAndPayloads(outOfOrder.id)).toEqual(await levelKeysAndPayloads(inOrder.id));
  });
});

describe('stable event identity', () => {
  it('keeps ids and untouched rows across an out-of-order replay', async () => {
    const user = await freshUser();
    await postSession(user, payloadAt(hoursAgo(5), [aSet(benchId, 0, 60), aSet(crunchId, 1, 30, { reps: 8 })]));
    await postSession(user, payloadAt(hoursAgo(1), [aSet(benchId, 0, 80), unrated(crunchId, 1, 30, 8)]));
    const before = await storedEvents(user.id);
    const idsBefore = await eventIds(user.id);
    expect(before.length).toBeGreaterThan(0);

    await postSession(user, payloadAt(hoursAgo(3), [aSet(legPressId, 0, 100)]));
    const idsAfter = await eventIds(user.id);
    for (const [key, id] of idsBefore) {
      const shifted = key.replace(/^1:/, '2:');
      expect(idsAfter.get(key.startsWith('1:') ? shifted : key)).toBe(id);
    }
    const after = new Map((await storedEvents(user.id)).map((row) => [row.id, row]));
    for (const row of before) {
      const now = after.get(row.id)!;
      if (JSON.stringify(now.payload) === JSON.stringify(row.payload)) {
        expect(now.updated_at).toEqual(row.updated_at);
      }
    }
  });

  it('deletes the PR event when an edit removes the PR set, and keeps the level event', async () => {
    const user = await freshUser();
    await postSession(user, payloadAt(hoursAgo(3), [aSet(benchId, 0, 60), aSet(crunchId, 1, 30, { reps: 8 })]));
    const session = payloadAt(hoursAgo(1), [aSet(benchId, 0, 80), unrated(crunchId, 1, 30, 8)]);
    await postSession(user, session);
    const before = await storedEvents(user.id, session.id);
    const level = before.find((event) => event.event_key === 'level:core')!;
    expect(before.map((event) => event.event_key)).toEqual(expect.arrayContaining([`pr:${benchId}`, 'level:core']));

    await editSession(user, session, [{ ...session.sets[1], position: 0 }]);
    const after = await storedEvents(user.id, session.id);
    expect(after.find((event) => event.type === 'pr')).toBeUndefined();
    expect(after.find((event) => event.event_key === 'level:core')?.id).toBe(level.id);
  });

  it('keeps the PR event id when an edit changes the PR load', async () => {
    const user = await freshUser();
    await postSession(user, payloadAt(hoursAgo(3), [aSet(benchId, 0, 60)]));
    const session = payloadAt(hoursAgo(1), [aSet(benchId, 0, 80)]);
    await postSession(user, session);
    const [before] = (await storedEvents(user.id, session.id)).filter((event) => event.type === 'pr');

    await editSession(user, session, [{ ...session.sets[0], weightKg: 82.5 }]);
    const [after] = (await storedEvents(user.id, session.id)).filter((event) => event.type === 'pr');
    expect(after.id).toBe(before.id);
    expect(after.payload).toMatchObject({ loadKg: 82.5, previousLoadKg: 60 });
  });
});

describe('deleting sessions', () => {
  it('removes the deleted session events', async () => {
    const user = await freshUser();
    await postSession(user, payloadAt(hoursAgo(3), [aSet(benchId, 0, 60)]));
    const session = payloadAt(hoursAgo(1), [aSet(benchId, 0, 80)]);
    await postSession(user, session);
    expect((await storedEvents(user.id, session.id)).length).toBeGreaterThan(0);
    expect((await postFunction('delete-session', user.accessToken, { sessionId: session.id })).status).toBe(200);
    expect(await storedEvents(user.id, session.id)).toEqual([]);
  });

  it('drops the later PR event when its baseline session is deleted', async () => {
    const user = await freshUser();
    const baseline = payloadAt(hoursAgo(3), [aSet(benchId, 0, 60)]);
    const session = payloadAt(hoursAgo(1), [aSet(benchId, 0, 80)]);
    await postSession(user, baseline);
    await postSession(user, session);
    expect((await storedEvents(user.id, session.id)).some((event) => event.type === 'pr')).toBe(true);
    expect((await postFunction('delete-session', user.accessToken, { sessionId: baseline.id })).status).toBe(200);
    expect((await storedEvents(user.id, session.id)).some((event) => event.type === 'pr')).toBe(false);
  });
});

describe('backfill through rebuild-caches', () => {
  it('recreates deleted events exactly and keeps ids on a second rebuild', async () => {
    const user = await freshUser();
    const customId = await createCustomExercise(user);
    await postSession(
      user,
      payloadAt(hoursAgo(5), [aSet(benchId, 0, 60), aSet(crunchId, 1, 30, { reps: 8 }), aSet(customId, 2, 40)]),
    );
    await postSession(
      user,
      payloadAt(hoursAgo(1), [aSet(benchId, 0, 80), unrated(crunchId, 1, 30, 8), aSet(customId, 2, 50)]),
    );
    await postSession(user, payloadAt(new Date(Date.now() - 8 * DAY_MS), [aSet(benchId, 0, 120)]));
    const before = await eventsSnapshot(user.id);
    expect(before.map((event) => event.type)).toEqual(expect.arrayContaining(['pr', 'level_up']));

    await db`delete from public.events where user_id = ${user.id}`;
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await eventsSnapshot(user.id)).toEqual(before);

    const ids = await eventIds(user.id);
    expect((await rebuildCaches(user.id)).status).toBe(200);
    expect(await eventIds(user.id)).toEqual(ids);
  });
});

describe('drop events', () => {
  it('posts rare PR drops, skips uncommon ones, and removes a revoked drop', async () => {
    const itemRows = await db`select id, rarity from public.items`;
    const rarity = new Map<string, ItemRarityRank>(itemRows.map((row) => [row.id, row.rarity]));
    const lucky = await freshUser();
    const chosen = pickSetIdWhoseRareDropIs(lucky, (tier) => tier === 'rare', rarity);

    await postSession(lucky, payloadAt(hoursAgo(3), [aSet(benchId, 0, 60)]));
    const prSession = payloadAt(hoursAgo(1), [{ ...aSet(benchId, 0, 80), id: chosen.setId }]);
    await postSession(lucky, prSession);
    const [prDrop] = await db`select id, quantity from public.drops where set_id = ${chosen.setId} and source = 'pr'`;
    const dropEvents = (await storedEvents(lucky.id, prSession.id)).filter((event) => event.type === 'drop');
    expect(dropEvents).toContainEqual(
      expect.objectContaining({
        event_key: `drop:${prDrop.id}`,
        payload: {
          dropId: prDrop.id,
          itemId: chosen.itemId,
          itemKey: chosen.itemKey,
          quantity: prDrop.quantity,
          source: 'pr',
        },
      }),
    );

    const unlucky = await freshUser();
    const plain = pickSetIdWhoseRareDropIs(unlucky, (tier) => tier === 'uncommon', rarity);
    await postSession(unlucky, payloadAt(hoursAgo(3), [aSet(benchId, 0, 60)]));
    await postSession(unlucky, payloadAt(hoursAgo(1), [{ ...aSet(benchId, 0, 80), id: plain.setId }]));
    const unluckyEvents = await storedEvents(unlucky.id);
    expect(unluckyEvents.filter((event) => event.type === 'drop' && event.payload.source === 'pr')).toEqual([]);

    await editSession(lucky, prSession, [{ ...prSession.sets[0], weightKg: 55 }]);
    const after = await storedEvents(lucky.id, prSession.id);
    expect(after.find((event) => event.event_key === `drop:${prDrop.id}`)).toBeUndefined();
    expect(after.find((event) => event.type === 'pr')).toBeUndefined();
  });
});
