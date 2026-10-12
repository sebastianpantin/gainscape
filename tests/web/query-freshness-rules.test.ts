import { describe, expect, it, vi } from 'vitest';
import {
  DATA_CHANGES,
  dataChangeOf,
  FRESH_FOR_MS,
  ALWAYS_STALE_QUERY_ROOTS,
  QUERY_ROOTS_CHANGED_BY,
  queryRootsToInvalidate,
  staleTimeFor,
} from '../../web/src/lib/query-freshness-rules.ts';

vi.mock('../../web/src/lib/supabase.ts', () => ({ supabase: {} }));

const queries = await import('../../web/src/lib/queries.ts');
const { standingQuery } = await import('../../web/src/lib/standing.ts');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const FRIEND_ID = '22222222-2222-4222-8222-222222222222';
const CATALOG_ROOTS = ['skills'];

const QUERY_ROOTS = [
  standingQuery(USER_ID),
  queries.profileQuery(USER_ID),
  queries.collectionQuery(USER_ID),
  queries.loadoutQuery(USER_ID),
  queries.itemsQuery(USER_ID),
  queries.skillsQuery,
  queries.friendsQuery(USER_ID),
  queries.feedQuery(USER_ID),
  queries.hiscoresQuery,
  queries.friendProfileQuery(FRIEND_ID),
  queries.profilePreviewQuery(USER_ID),
  queries.bodyweightTrendQuery(USER_ID),
  queries.exerciseProgressQuery(USER_ID, 'bench'),
  queries.programTemplatesQuery(USER_ID),
  queries.enrollChoicesQuery(USER_ID),
  queries.weeklyGoalQuery,
  queries.exerciseListQuery(USER_ID),
  queries.lastLoggedWeightsQuery(['bench']),
].map(({ queryKey }) => String(queryKey[0]));

function draftMessage(change: string) {
  return { userId: USER_ID, sessionId: 'session-1', updatedAt: 5, change };
}

describe('dataChangeOf', () => {
  it('reads a workout synced or deleted on the server from the draft channel as a workout change', () => {
    expect(dataChangeOf(draftMessage('synced'))).toBe('workout-changed');
    expect(dataChangeOf(draftMessage('deleted'))).toBe('workout-changed');
  });

  it('ignores draft edits and discards, which change nothing on the server', () => {
    expect(dataChangeOf(draftMessage('written'))).toBeNull();
    expect(dataChangeOf(draftMessage('discarded'))).toBeNull();
  });

  it('reads every change another tab announces', () => {
    for (const change of DATA_CHANGES) expect(dataChangeOf({ change })).toBe(change);
  });

  it('ignores anything else on the channels', () => {
    for (const message of [null, 'synced', 42, {}, { change: 'reloaded' }, { change: 7 }])
      expect(dataChangeOf(message)).toBeNull();
  });
});

describe('QUERY_ROOTS_CHANGED_BY', () => {
  it('refreshes every screen a finished, edited or deleted workout changes', () => {
    expect(QUERY_ROOTS_CHANGED_BY['workout-changed']).toEqual(
      expect.arrayContaining([
        'standing',
        'collection',
        'items',
        'loadout',
        'exercise-progress',
        'last-logged-weights',
        'weekly-goal',
        'bodyweight-trend',
        'profile-preview',
        'feed',
        'hiscores',
      ]),
    );
  });

  it('refreshes the profile, its friend preview and the bodyweight trend after a profile save', () => {
    expect(QUERY_ROOTS_CHANGED_BY['profile-saved']).toEqual(
      expect.arrayContaining(['profile', 'profile-preview', 'bodyweight-trend']),
    );
  });

  it('refreshes the weekly goal weeks after a time zone change', () => {
    expect(QUERY_ROOTS_CHANGED_BY['timezone-changed']).toContain('weekly-goal');
  });

  it('refreshes the loadout and the items after equipping, unequipping or crafting gear', () => {
    expect(QUERY_ROOTS_CHANGED_BY['gear-changed']).toEqual(expect.arrayContaining(['loadout', 'items']));
  });

  it('refreshes the weekly goal after a goal change and the Log tab after pinning', () => {
    expect(QUERY_ROOTS_CHANGED_BY['weekly-goal-saved']).toContain('weekly-goal');
    expect(QUERY_ROOTS_CHANGED_BY['pins-changed']).toContain('collection');
  });

  it('refreshes every exercise list and the Log tab after a custom exercise is saved or archived', () => {
    expect(QUERY_ROOTS_CHANGED_BY['exercise-saved']).toEqual(
      expect.arrayContaining(['exercises', 'collection', 'enroll-choices', 'exercise-progress']),
    );
  });

  it('names only real query keys', () => {
    for (const roots of Object.values(QUERY_ROOTS_CHANGED_BY))
      for (const root of roots) expect(QUERY_ROOTS).toContain(root);
    for (const root of ALWAYS_STALE_QUERY_ROOTS) expect(QUERY_ROOTS).toContain(root);
  });

  it('accounts for every query: changed by an event here, always refetched, or a catalog', () => {
    const accounted = new Set([
      ...Object.values(QUERY_ROOTS_CHANGED_BY).flat(),
      ...ALWAYS_STALE_QUERY_ROOTS,
      ...CATALOG_ROOTS,
    ]);
    for (const root of QUERY_ROOTS) expect(accounted).toContain(root);
  });
});

describe('queryRootsToInvalidate', () => {
  it('leaves out what the writing tab already put into its cache, so a refetch cannot undo an optimistic write', () => {
    expect(queryRootsToInvalidate('profile-saved', 'this-tab')).not.toContain('profile');
    expect(queryRootsToInvalidate('profile-saved', 'this-tab')).toContain('profile-preview');
    expect(queryRootsToInvalidate('weekly-goal-saved', 'this-tab')).toEqual([]);
    expect(queryRootsToInvalidate('pins-changed', 'this-tab')).toEqual([]);
  });

  it('refreshes everything the change touched in another tab', () => {
    for (const change of DATA_CHANGES)
      expect(queryRootsToInvalidate(change, 'other-tab')).toEqual(QUERY_ROOTS_CHANGED_BY[change]);
  });

  it('refreshes every workout root in this tab too, since the draft engine writes no query', () => {
    expect(queryRootsToInvalidate('workout-changed', 'this-tab')).toEqual(QUERY_ROOTS_CHANGED_BY['workout-changed']);
  });
});

describe('staleTimeFor', () => {
  const live = { loaded: { level: 3 }, fromCache: false };
  const online = { deviceOffline: false };

  it('keeps live data of this user fresh for a while so a tab switch does not refetch', () => {
    expect(staleTimeFor(['standing', USER_ID], live, online)).toBe(FRESH_FOR_MS);
    expect(staleTimeFor(['weekly-goal'], [], online)).toBe(FRESH_FOR_MS);
  });

  it('refetches a saved copy on the next visit so a load that fell back to the cache is retried', () => {
    expect(staleTimeFor(['standing', USER_ID], { loaded: {}, fromCache: true, offline: true }, online)).toBe(0);
    expect(
      staleTimeFor(['profile', USER_ID], { loaded: {}, fromCache: true, offline: false, problem: 'x' }, online),
    ).toBe(0);
  });

  it('reloads while the device is offline so a screen shows its saved copy and offline state', () => {
    expect(staleTimeFor(['items', USER_ID], live, { deviceOffline: true })).toBe(0);
  });

  it('refetches on every visit what other people change and what loads cache-first without saying so', () => {
    expect(ALWAYS_STALE_QUERY_ROOTS).toEqual(
      expect.arrayContaining(['friends', 'feed', 'hiscores', 'friend-profile', 'program-templates', 'enroll-choices']),
    );
    for (const root of ALWAYS_STALE_QUERY_ROOTS) expect(staleTimeFor([root, USER_ID], [], online)).toBe(0);
  });
});
