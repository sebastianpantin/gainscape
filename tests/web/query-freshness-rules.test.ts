import { describe, expect, it, vi } from 'vitest';
import {
  FRESH_FOR_MS,
  ALWAYS_STALE_QUERY_ROOTS,
  HOME_QUERY_ROOTS,
  HOME_FRESH_FOR_MS,
  staleTimeFor,
} from '../../web/src/lib/query/query-freshness-rules.ts';

vi.mock('../../web/src/lib/platform/supabase.ts', () => ({ supabase: {} }));

const queries = await import('../../web/src/lib/query/queries.ts');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const CATALOG_ROOTS = ['skills', 'item-catalog'];

type QueryFactory = (...args: string[]) => { queryKey: readonly unknown[] };

function rootOf(query: (typeof queries.EVERY_QUERY)[number]): string {
  const options = typeof query === 'function' ? (query as unknown as QueryFactory)(USER_ID, USER_ID) : query;
  return String(options.queryKey[0]);
}

const QUERY_ROOTS = queries.EVERY_QUERY.map(rootOf);

describe('EVERY_QUERY', () => {
  it('lists every query factory queries.ts exports, so no query can skip saying how it goes stale', () => {
    const exported = Object.entries(queries)
      .filter(([name]) => name.endsWith('Query'))
      .map(([, query]) => query);
    expect(exported.length).toBeGreaterThan(0);
    for (const query of exported) expect(queries.EVERY_QUERY).toContain(query);
  });

  it('loads every catalog through a query, so the reveal and session detail share one item catalog', () => {
    for (const root of CATALOG_ROOTS) expect(QUERY_ROOTS).toContain(root);
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

  it('keeps the reads only Train home adds fresh for longer, since a change on this device invalidates them', () => {
    expect(HOME_FRESH_FOR_MS).toBeGreaterThan(FRESH_FOR_MS);
    expect([...HOME_QUERY_ROOTS].sort()).toEqual([
      'last-workout-date',
      'loadout',
      'quests',
      'rarest-drop',
      'record-timeline',
    ]);
    for (const root of HOME_QUERY_ROOTS) {
      expect(staleTimeFor([root, USER_ID], live, online)).toBe(HOME_FRESH_FOR_MS);
      expect(ALWAYS_STALE_QUERY_ROOTS).not.toContain(root);
    }
  });

  it('still reloads the home reads offline or after a saved copy, like every other read', () => {
    for (const root of HOME_QUERY_ROOTS) {
      expect(staleTimeFor([root, USER_ID], live, { deviceOffline: true })).toBe(0);
      expect(staleTimeFor([root, USER_ID], { loaded: {}, fromCache: true, offline: true }, online)).toBe(0);
    }
  });

  it('refetches on every visit what other people change and what loads cache-first without saying so', () => {
    expect(ALWAYS_STALE_QUERY_ROOTS).toEqual(
      expect.arrayContaining(['friends', 'feed', 'hiscores', 'friend-profile', 'program-templates', 'enroll-choices']),
    );
    for (const root of ALWAYS_STALE_QUERY_ROOTS) expect(staleTimeFor([root, USER_ID], [], online)).toBe(0);
  });

  it('asks again on every Train visit whether a new user has trained, so the intro never follows a first workout', () => {
    expect(ALWAYS_STALE_QUERY_ROOTS).toContain('training-history');
  });
});
