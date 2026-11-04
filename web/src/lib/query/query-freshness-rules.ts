import { type QueryRoot } from './queries.ts';

export const FRESH_FOR_MS = 60_000;

export const HOME_FRESH_FOR_MS = 5 * FRESH_FOR_MS;

export const HOME_QUERY_ROOTS: readonly QueryRoot[] = [
  'loadout',
  'quests',
  'rarest-drop',
  'record-timeline',
  'last-workout-date',
];

export const ALWAYS_STALE_QUERY_ROOTS: readonly QueryRoot[] = [
  'friends',
  'feed',
  'hiscores',
  'friend-profile',
  'program-templates',
  'enroll-choices',
  'training-history',
];

function isSavedCopy(data: unknown): boolean {
  return (data as { fromCache?: unknown } | null | undefined)?.fromCache === true;
}

export function staleTimeFor(
  queryKey: readonly unknown[],
  data: unknown,
  { deviceOffline }: { deviceOffline: boolean },
): number {
  const root = queryKey[0] as QueryRoot;
  if (deviceOffline || isSavedCopy(data) || ALWAYS_STALE_QUERY_ROOTS.includes(root)) return 0;
  return HOME_QUERY_ROOTS.includes(root) ? HOME_FRESH_FOR_MS : FRESH_FOR_MS;
}
