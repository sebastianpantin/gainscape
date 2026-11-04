import { hashKey, type QueryClient, type QueryKey, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { DRAFT_CHANNEL_NAME } from '../../offline/draft-session.ts';
import { updateItemsCache } from '../../offline/items-cache.ts';
import { fetchInventory, type LoadedItems } from '../collection/items.ts';
import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import { withoutHistorySession } from '../history/history-rules.ts';
import { openChannel } from '../platform/channel.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { patchSavedProfile, type ProfileUpdate } from '../profile/saved-profile.ts';
import { cachedPrograms } from '../programs/programs.ts';
import {
  collectionQuery,
  enrollChoicesQuery,
  FEED_QUERY_PREFIX,
  friendProfileQuery,
  FRIENDS_QUERY_PREFIX,
  historyQuery,
  itemsQuery,
  profileQuery,
  programsQuery,
  type QueryRoot,
  weeklyGoalQuery,
} from './queries.ts';

export type Write =
  | { change: 'workout-changed'; deleted?: { userId: string; sessionId: string } }
  | { change: 'profile-saved'; profile?: SavedProfile }
  | { change: 'timezone-changed'; profile: SavedProfile }
  | { change: 'gear-changed'; userId: string; crafted?: boolean }
  | { change: 'exercise-saved' }
  | { change: 'weekly-goal-saved' }
  | { change: 'lift-goals-saved' }
  | { change: 'pins-changed'; userId: string }
  | { change: 'quest-started' }
  | { change: 'programs-changed'; userId: string }
  | { change: 'program-published'; userId: string }
  | { change: 'friend-removed'; friendId: string }
  | { change: 'account-reset' };

interface SavedProfile {
  userId: string;
  update: ProfileUpdate;
}

type DataChange = Write['change'];

const CATALOG_ROOTS: readonly QueryRoot[] = ['skills', 'item-catalog'];

const ROOTS_CHANGED_BY: Record<Exclude<DataChange, 'account-reset'>, readonly QueryRoot[]> = {
  'workout-changed': [
    'history',
    'standing',
    'strength',
    'collection',
    'items',
    'loadout',
    'exercise-progress',
    'last-logged-weights',
    'weekly-goal',
    'lift-goals',
    'bodyweight-trend',
    'profile-preview',
    'feed',
    'hiscores',
    'quests',
    'training-days',
    'weekly-exercise-sets',
    'record-timeline',
    'loot-stats',
    'relative-strength',
    'dots-history',
    'rarest-drop',
    'last-workout-date',
  ],
  'profile-saved': [
    'profile',
    'profile-preview',
    'bodyweight-trend',
    'feed',
    'hiscores',
    'relative-strength',
    'dots-history',
  ],
  'timezone-changed': ['profile', 'weekly-goal', 'weekly-exercise-sets'],
  'gear-changed': ['loadout', 'items'],
  'exercise-saved': [
    'exercises',
    'collection',
    'enroll-choices',
    'exercise-progress',
    'lift-goals',
    'profile-preview',
    'history',
    'relative-strength',
    'dots-history',
  ],
  'weekly-goal-saved': ['weekly-goal'],
  'lift-goals-saved': ['lift-goals'],
  'pins-changed': ['collection', 'profile-preview'],
  'quest-started': ['quests'],
  'programs-changed': ['programs'],
  'program-published': ['enroll-choices'],
  'friend-removed': ['friends', 'feed', 'friend-profile'],
};

const WRITE_CHANNEL_NAME = 'gainscape.data-changes';
const SERVER_WORKOUT_CHANGES = new Set(['synced', 'deleted']);

let openedWriteChannel: BroadcastChannel | null | undefined;

function writeChannel(): BroadcastChannel | null {
  openedWriteChannel ??= openChannel(WRITE_CHANNEL_NAME);
  return openedWriteChannel;
}

function isDataChange(value: unknown): value is DataChange {
  return value === 'account-reset' || Object.hasOwn(ROOTS_CHANGED_BY, value as PropertyKey);
}

function dataChangeOf(message: unknown): DataChange | null {
  const change = (message as { change?: unknown } | null)?.change;
  if (typeof change !== 'string') return null;
  if (isDataChange(change)) return change;
  return SERVER_WORKOUT_CHANGES.has(change) ? 'workout-changed' : null;
}

async function refetchNow(queryClient: QueryClient, query: { queryKey: QueryKey }): Promise<QueryKey[]> {
  await queryClient.cancelQueries({ queryKey: query.queryKey, exact: true });
  await queryClient.fetchQuery({ ...query, staleTime: 0 });
  return [query.queryKey];
}

async function showCraftedInventory(queryClient: QueryClient, userId: string): Promise<QueryKey[]> {
  const held = await fetchInventory(userId);
  updateItemsCache(deviceStorage(), userId, (cache) => ({ ...cache, inventory: [...held.values()] }));
  const { queryKey } = itemsQuery(userId);
  await queryClient.cancelQueries({ queryKey, exact: true });
  const shown = queryClient.setQueryData<CacheFirstLoad<LoadedItems>>(
    queryKey,
    (current) => current && { ...current, loaded: { ...current.loaded, held } },
  );
  return shown ? [queryKey] : [];
}

function showSavedPrograms(queryClient: QueryClient, userId: string): void {
  const saved = cachedPrograms(userId);
  if (!saved) return;
  const { queryKey } = programsQuery(userId);
  void queryClient.cancelQueries({ queryKey });
  queryClient.setQueryData(queryKey, { loaded: saved, fromCache: false });
}

function showSavedProfile(queryClient: QueryClient, { userId, update }: SavedProfile): QueryKey[] {
  return patchSavedProfile(queryClient, userId, update) ? [profileQuery(userId).queryKey] : [];
}

async function showInThisTab(queryClient: QueryClient, write: Write): Promise<QueryKey[]> {
  switch (write.change) {
    case 'workout-changed':
      if (write.deleted) {
        const { userId, sessionId } = write.deleted;
        queryClient.setQueryData(historyQuery(userId).queryKey, (pages) => withoutHistorySession(pages, sessionId));
      }
      return [];
    case 'profile-saved':
    case 'timezone-changed':
      return write.profile ? showSavedProfile(queryClient, write.profile) : [];
    case 'gear-changed':
      return write.crafted ? showCraftedInventory(queryClient, write.userId) : [itemsQuery(write.userId).queryKey];
    case 'weekly-goal-saved':
      return refetchNow(queryClient, weeklyGoalQuery);
    case 'pins-changed':
      return refetchNow(queryClient, collectionQuery(write.userId));
    case 'programs-changed':
      showSavedPrograms(queryClient, write.userId);
      return [];
    case 'program-published':
      queryClient.removeQueries({ queryKey: enrollChoicesQuery(write.userId).queryKey });
      return [];
    case 'friend-removed':
      for (const queryKey of [FRIENDS_QUERY_PREFIX, FEED_QUERY_PREFIX, friendProfileQuery(write.friendId).queryKey])
        queryClient.removeQueries({ queryKey });
      return [];
    default:
      return [];
  }
}

async function refreshAfter(queryClient: QueryClient, change: DataChange, shown: readonly QueryKey[]): Promise<void> {
  if (change === 'account-reset')
    return queryClient.resetQueries({
      predicate: (query) => !CATALOG_ROOTS.includes(query.queryKey[0] as QueryRoot),
    });
  const shownHashes = new Set(shown.map((queryKey) => hashKey(queryKey)));
  await Promise.all(
    ROOTS_CHANGED_BY[change].map((root) =>
      queryClient.invalidateQueries({ queryKey: [root], predicate: (query) => !shownHashes.has(query.queryHash) }),
    ),
  );
}

export async function wrote(queryClient: QueryClient, write: Write): Promise<void> {
  writeChannel()?.postMessage({ change: write.change });
  const shown = await showInThisTab(queryClient, write).catch(async (error: unknown) => {
    await refreshAfter(queryClient, write.change, []);
    throw error;
  });
  await refreshAfter(queryClient, write.change, shown);
}

export function listenForBroadcastWrites(queryClient: QueryClient): () => void {
  const refreshOn = (event: MessageEvent<unknown>) => {
    const change = dataChangeOf(event.data);
    if (change) void refreshAfter(queryClient, change, []);
  };
  const drafts = openChannel(DRAFT_CHANNEL_NAME);
  const otherTabs = writeChannel();
  drafts?.addEventListener('message', refreshOn);
  otherTabs?.addEventListener('message', refreshOn);
  return () => {
    drafts?.close();
    otherTabs?.removeEventListener('message', refreshOn);
  };
}

export function useBroadcastWrites(): void {
  const queryClient = useQueryClient();
  useEffect(() => listenForBroadcastWrites(queryClient), [queryClient]);
}
