import { type Query, QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ALWAYS_STALE_QUERY_ROOTS, HOME_QUERY_ROOTS } from '../../web/src/lib/query/query-freshness-rules.ts';
import type { QueryRoot } from '../../web/src/lib/query/queries.ts';
import type { Write } from '../../web/src/lib/query/writes.ts';

const server = vi.hoisted(() => ({
  collection: vi.fn(),
  weeklyGoal: vi.fn(),
  inventory: vi.fn(),
}));

vi.mock('../../web/src/lib/platform/supabase.ts', () => ({ supabase: {} }));
vi.mock('../../web/src/lib/collection/collection-data.ts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadCollectionCacheFirst: server.collection,
}));
vi.mock('../../web/src/lib/progress/weekly-goal.ts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchWeeklyGoalStatus: server.weeklyGoal,
}));
vi.mock('../../web/src/lib/collection/items.ts', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchInventory: server.inventory,
}));

const queries = await import('../../web/src/lib/query/queries.ts');
const { listenForBroadcastWrites, wrote } = await import('../../web/src/lib/query/writes.ts');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const FRIEND_ID = '22222222-2222-4222-8222-222222222222';
const SESSION_ID = 'session-1';
const SEEDED_AT = 1;
const CATALOG_ROOTS = ['skills', 'item-catalog'];
const WRITE_CHANNEL = 'gainscape.data-changes';
const DRAFT_CHANNEL = 'gainscape.drafts';

const ONE_WRITE_OF_EACH_KIND: Record<Write['change'], Write> = {
  'workout-changed': { change: 'workout-changed' },
  'profile-saved': {
    change: 'profile-saved',
    profile: { userId: USER_ID, update: (profile) => ({ ...profile, bodyweightKg: 80 }) },
  },
  'timezone-changed': {
    change: 'timezone-changed',
    profile: { userId: USER_ID, update: (profile) => ({ ...profile, timezone: 'UTC' }) },
  },
  'gear-changed': { change: 'gear-changed', userId: USER_ID, crafted: true },
  'exercise-saved': { change: 'exercise-saved' },
  'weekly-goal-saved': { change: 'weekly-goal-saved' },
  'lift-goals-saved': { change: 'lift-goals-saved' },
  'pins-changed': { change: 'pins-changed', userId: USER_ID },
  'quest-started': { change: 'quest-started' },
  'programs-changed': { change: 'programs-changed', userId: USER_ID },
  'program-published': { change: 'program-published', userId: USER_ID },
  'friend-removed': { change: 'friend-removed', friendId: FRIEND_ID },
  'account-reset': { change: 'account-reset' },
};

const EVERY_WRITE = Object.values(ONE_WRITE_OF_EACH_KIND);

type QueryFactory = (...args: string[]) => { queryKey: readonly unknown[] };

function keyOf(query: (typeof queries.EVERY_QUERY)[number]): readonly unknown[] {
  const options = typeof query === 'function' ? (query as unknown as QueryFactory)(USER_ID, USER_ID) : query;
  return options.queryKey;
}

const EVERY_KEY = queries.EVERY_QUERY.map(keyOf);
const EVERY_ROOT = [...new Set(EVERY_KEY.map((key) => key[0] as QueryRoot))];

function seeded(): QueryClient {
  const queryClient = new QueryClient();
  const seed = {
    loaded: { bodyweightKg: null, timezone: 'Europe/Stockholm', held: new Map() },
    fromCache: false,
    pages: [[{ id: SESSION_ID }, { id: 'session-2' }]],
    pageParams: [null],
  };
  for (const queryKey of [...EVERY_KEY, queries.friendProfileQuery(FRIEND_ID).queryKey])
    queryClient.setQueryData(queryKey, seed, { updatedAt: SEEDED_AT });
  return queryClient;
}

function queryAt(queryClient: QueryClient, queryKey: readonly unknown[]): Query | undefined {
  return queryClient.getQueryCache().find({ queryKey, exact: true });
}

function dropped(query: Query | undefined): boolean {
  return !query || query.state.isInvalidated || query.state.data === undefined;
}

function freshOrDropped(query: Query | undefined): boolean {
  return dropped(query) || query!.state.dataUpdatedAt > SEEDED_AT;
}

const channels: BroadcastChannel[] = [];
const stopListening: (() => void)[] = [];

function channel(name: string): BroadcastChannel {
  const opened = new BroadcastChannel(name);
  channels.push(opened);
  return opened;
}

function nextMessage(name: string): Promise<unknown> {
  const listener = channel(name);
  return new Promise((resolve) => listener.addEventListener('message', (event) => resolve(event.data), { once: true }));
}

function otherTab(): QueryClient {
  const queryClient = seeded();
  stopListening.push(listenForBroadcastWrites(queryClient));
  return queryClient;
}

async function deliveredTo(queryClient: QueryClient, channelName: string, ...messages: unknown[]): Promise<void> {
  const sender = channel(channelName);
  for (const message of messages) sender.postMessage(message);
  const last = messages.at(-1);
  await vi.waitFor(() => {
    const refreshed = queryClient
      .getQueryCache()
      .getAll()
      .some((query) => dropped(query));
    if (!refreshed) throw new Error(`no query refreshed after ${JSON.stringify(last)}`);
  });
}

async function writeInOneTabAndDeliver(write: Write) {
  const writingTab = seeded();
  const elsewhere = otherTab();
  const told = nextMessage(WRITE_CHANNEL);
  await wrote(writingTab, write);
  const message = await told;
  await deliveredTo(elsewhere, WRITE_CHANNEL, message);
  return { writingTab, elsewhere, message };
}

beforeEach(() => {
  server.collection.mockResolvedValue({ loaded: { pinned: ['bench'] }, fromCache: false });
  server.weeklyGoal.mockResolvedValue({ goal: 4, done: 1 });
  server.inventory.mockResolvedValue(new Map([['iron-helm', { itemId: 'iron-helm', quantity: 1 }]]));
});

afterEach(() => {
  for (const stop of stopListening.splice(0)) stop();
  for (const opened of channels.splice(0)) opened.close();
});

describe('wrote', () => {
  it.each(EVERY_WRITE)('tells other tabs about $change', async (write) => {
    const { message } = await writeInOneTabAndDeliver(write);
    expect(message).toEqual({ change: write.change });
  });

  it.each(EVERY_WRITE)(
    'leaves nothing stale in the writing tab that other tabs refresh after $change',
    async (write) => {
      const { writingTab, elsewhere } = await writeInOneTabAndDeliver(write);
      const refreshedElsewhere = elsewhere
        .getQueryCache()
        .getAll()
        .filter((query) => dropped(query))
        .map((query) => query.queryKey);
      expect(refreshedElsewhere.length).toBeGreaterThan(0);
      const staleHere = refreshedElsewhere.filter((queryKey) => !freshOrDropped(queryAt(writingTab, queryKey)));
      expect(staleHere).toEqual([]);
    },
  );

  it('refreshes the What friends see preview in the pinning tab, since pinned lifts count toward its Collection share', async () => {
    const queryClient = seeded();
    await wrote(queryClient, { change: 'pins-changed', userId: USER_ID });
    expect(queryAt(queryClient, queries.profilePreviewQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(true);
    expect(queryClient.getQueryData(queries.collectionQuery(USER_ID).queryKey)).toEqual({
      loaded: { pinned: ['bench'] },
      fromCache: false,
    });
    expect(queryAt(queryClient, queries.collectionQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(false);
  });

  it('keeps a saved profile shown without a refetch, so a refetch begun before the save cannot undo it', async () => {
    const queryClient = seeded();
    await wrote(queryClient, ONE_WRITE_OF_EACH_KIND['profile-saved']);
    const profile = queryAt(queryClient, queries.profileQuery(USER_ID).queryKey);
    expect(profile?.state.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(queries.profileQuery(USER_ID).queryKey)?.loaded.bodyweightKg).toBe(80);
    for (const read of [queries.profilePreviewQuery(USER_ID), queries.bodyweightTrendQuery(USER_ID)])
      expect(queryAt(queryClient, read.queryKey)?.state.isInvalidated).toBe(true);
  });

  it('refetches the profile when a save brings no new profile, as after a username change', async () => {
    const queryClient = seeded();
    await wrote(queryClient, { change: 'profile-saved' });
    expect(queryAt(queryClient, queries.profileQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(true);
  });

  it('shows the weekly goal the server now has after a goal change', async () => {
    const queryClient = seeded();
    await wrote(queryClient, { change: 'weekly-goal-saved' });
    expect(queryClient.getQueryData(queries.weeklyGoalQuery.queryKey)).toEqual({ goal: 4, done: 1 });
    expect(queryAt(queryClient, queries.weeklyGoalQuery.queryKey)?.state.isInvalidated).toBe(false);
  });

  it('shows the crafted inventory on the Items tab and refreshes the loadout', async () => {
    const queryClient = seeded();
    await wrote(queryClient, { change: 'gear-changed', userId: USER_ID, crafted: true });
    const items = queryClient.getQueryData(queries.itemsQuery(USER_ID).queryKey);
    expect([...(items?.loaded.held.keys() ?? [])]).toEqual(['iron-helm']);
    expect(queryAt(queryClient, queries.itemsQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(false);
    expect(queryAt(queryClient, queries.loadoutQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(true);
  });

  it('leaves the held items alone on an equip, since equipping changes only the loadout', async () => {
    const queryClient = seeded();
    await wrote(queryClient, { change: 'gear-changed', userId: USER_ID });
    expect(queryAt(queryClient, queries.itemsQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(false);
    expect(queryAt(queryClient, queries.loadoutQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(true);
  });

  it('falls back to refreshing when the writing tab cannot load what changed, and says why', async () => {
    server.collection.mockRejectedValue(new Error('offline'));
    const queryClient = seeded();
    await expect(wrote(queryClient, { change: 'pins-changed', userId: USER_ID })).rejects.toThrow('offline');
    expect(queryAt(queryClient, queries.collectionQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(true);
    expect(queryAt(queryClient, queries.profilePreviewQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(true);
  });

  it('drops a deleted session from History at once and still refetches it, since later sessions are recomputed', async () => {
    const queryClient = seeded();
    await wrote(queryClient, { change: 'workout-changed', deleted: { userId: USER_ID, sessionId: SESSION_ID } });
    const { queryKey } = queries.historyQuery(USER_ID);
    expect(queryClient.getQueryData(queryKey)?.pages).toEqual([[{ id: 'session-2' }]]);
    expect(queryAt(queryClient, queryKey)?.state.isInvalidated).toBe(true);
  });

  it('refreshes every read Train home keeps longer after a workout, gear or quest change', async () => {
    const queryClient = seeded();
    await wrote(queryClient, { change: 'workout-changed' });
    for (const root of HOME_QUERY_ROOTS)
      for (const query of queryClient.getQueryCache().findAll({ queryKey: [root] }))
        expect(query.state.isInvalidated).toBe(true);
    const gear = seeded();
    await wrote(gear, { change: 'gear-changed', userId: USER_ID });
    expect(queryAt(gear, queries.loadoutQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(true);
    const quest = seeded();
    await wrote(quest, { change: 'quest-started' });
    expect(queryAt(quest, queries.questsQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(true);
  });

  it('drops the cached enroll choices after publishing, so the enroll screen loads the new version', async () => {
    const queryClient = seeded();
    await wrote(queryClient, { change: 'program-published', userId: USER_ID });
    expect(queryClient.getQueryData(queries.enrollChoicesQuery(USER_ID).queryKey)).toBeUndefined();
  });

  it('drops the friends list, the feed and the removed friend after removing a friend', async () => {
    const queryClient = seeded();
    await wrote(queryClient, { change: 'friend-removed', friendId: FRIEND_ID });
    for (const { queryKey } of [
      queries.friendsQuery(USER_ID),
      queries.feedQuery(USER_ID),
      queries.feedPreviewQuery(USER_ID),
      queries.friendProfileQuery(FRIEND_ID),
    ])
      expect(queryClient.getQueryData(queryKey)).toBeUndefined();
  });

  it('empties every query that holds account data after an account reset, in every tab, and keeps the catalogs', async () => {
    const { writingTab, elsewhere } = await writeInOneTabAndDeliver({ change: 'account-reset' });
    for (const tab of [writingTab, elsewhere])
      for (const queryKey of EVERY_KEY) {
        const data = tab.getQueryData(queryKey);
        if (CATALOG_ROOTS.includes(String(queryKey[0]))) expect(data).toBeDefined();
        else expect(data).toBeUndefined();
      }
  });

  it('says how every query goes stale: a write changes it, it refetches on every visit, or it is a catalog', async () => {
    const changedByAWrite = new Set<string>();
    for (const write of EVERY_WRITE.filter(({ change }) => change !== 'account-reset')) {
      const { elsewhere } = await writeInOneTabAndDeliver(write);
      for (const query of elsewhere.getQueryCache().getAll())
        if (dropped(query)) changedByAWrite.add(String(query.queryKey[0]));
    }
    const unaccounted = EVERY_ROOT.filter(
      (root) => !changedByAWrite.has(root) && !ALWAYS_STALE_QUERY_ROOTS.includes(root) && !CATALOG_ROOTS.includes(root),
    );
    expect(unaccounted).toEqual([]);
  });
});

describe('listenForBroadcastWrites', () => {
  it('refreshes every workout read when a workout syncs or is deleted from any tab', async () => {
    for (const change of ['synced', 'deleted']) {
      const tab = otherTab();
      await deliveredTo(tab, DRAFT_CHANNEL, { userId: USER_ID, sessionId: SESSION_ID, updatedAt: 5, change });
      expect(queryAt(tab, queries.historyQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(true);
      expect(queryAt(tab, queries.standingQuery(USER_ID).queryKey)?.state.isInvalidated).toBe(true);
    }
  });

  it('ignores draft edits and discards, and anything else on the channels', async () => {
    const tab = otherTab();
    const ignored = [
      { userId: USER_ID, sessionId: SESSION_ID, updatedAt: 5, change: 'written' },
      { userId: USER_ID, sessionId: SESSION_ID, updatedAt: 5, change: 'discarded' },
      null,
      'synced',
      42,
      {},
      { change: 'reloaded' },
    ];
    await deliveredTo(tab, DRAFT_CHANNEL, ...ignored, { change: 'quest-started' });
    const refreshed = tab
      .getQueryCache()
      .getAll()
      .filter((query) => dropped(query))
      .map((query) => query.queryKey[0]);
    expect(refreshed).toEqual(['quests']);
  });
});
