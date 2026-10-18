export const FRESH_FOR_MS = 60_000;

export const DATA_CHANGES = [
  'workout-changed',
  'profile-saved',
  'timezone-changed',
  'gear-changed',
  'exercise-saved',
  'weekly-goal-saved',
  'lift-goals-saved',
  'pins-changed',
  'quest-started',
  'programs-changed',
  'account-reset',
] as const;

export type DataChange = (typeof DATA_CHANGES)[number];

export const QUERY_ROOTS_CHANGED_BY: Record<DataChange, readonly string[]> = {
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
  ],
  'profile-saved': ['profile', 'profile-preview', 'bodyweight-trend', 'feed', 'hiscores'],
  'timezone-changed': ['profile', 'weekly-goal'],
  'gear-changed': ['loadout', 'items'],
  'exercise-saved': [
    'exercises',
    'collection',
    'enroll-choices',
    'exercise-progress',
    'lift-goals',
    'profile-preview',
    'history',
  ],
  'weekly-goal-saved': ['weekly-goal'],
  'lift-goals-saved': ['lift-goals'],
  'pins-changed': ['collection'],
  'quest-started': ['quests'],
  'programs-changed': ['programs'],
  'account-reset': [
    'standing',
    'strength',
    'programs',
    'profile',
    'collection',
    'loadout',
    'items',
    'friends',
    'feed',
    'hiscores',
    'friend-profile',
    'profile-preview',
    'bodyweight-trend',
    'exercise-progress',
    'program-templates',
    'enroll-choices',
    'weekly-goal',
    'lift-goals',
    'exercises',
    'last-logged-weights',
    'training-history',
    'history',
    'quests',
  ],
};

const ROOTS_THE_WRITING_TAB_UPDATES_ITSELF: Partial<Record<DataChange, readonly string[]>> = {
  'profile-saved': ['profile'],
  'timezone-changed': ['profile'],
  'gear-changed': ['items'],
  'weekly-goal-saved': ['weekly-goal'],
  'pins-changed': ['collection'],
};

export type ChangeOrigin = 'this-tab' | 'other-tab';

export function queryRootsToInvalidate(change: DataChange, origin: ChangeOrigin): readonly string[] {
  const roots = QUERY_ROOTS_CHANGED_BY[change];
  if (origin === 'other-tab') return roots;
  const updatedInPlace = ROOTS_THE_WRITING_TAB_UPDATES_ITSELF[change] ?? [];
  return roots.filter((root) => !updatedInPlace.includes(root));
}

export const QUERY_ROOTS_REFETCHED_FROM_THE_FIRST_PAGE: readonly string[] = ['history', 'feed'];

interface LoadedPages {
  pages: readonly unknown[];
  pageParams: readonly unknown[];
}

function isLoadedPages(data: unknown): data is LoadedPages {
  const candidate = data as Partial<LoadedPages> | null | undefined;
  return Array.isArray(candidate?.pages) && Array.isArray(candidate.pageParams);
}

export function keepFirstPage<Data>(data: Data): Data {
  if (!isLoadedPages(data) || data.pages.length <= 1) return data;
  return { ...data, pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) };
}

export const ALWAYS_STALE_QUERY_ROOTS: readonly string[] = [
  'friends',
  'feed',
  'hiscores',
  'friend-profile',
  'program-templates',
  'enroll-choices',
  'training-history',
];

const SERVER_WORKOUT_CHANGES = new Set(['synced', 'deleted']);

function isDataChange(value: unknown): value is DataChange {
  return (DATA_CHANGES as readonly unknown[]).includes(value);
}

export function dataChangeOf(message: unknown): DataChange | null {
  const change = (message as { change?: unknown } | null)?.change;
  if (isDataChange(change)) return change;
  return SERVER_WORKOUT_CHANGES.has(change as string) ? 'workout-changed' : null;
}

function isSavedCopy(data: unknown): boolean {
  return (data as { fromCache?: unknown } | null | undefined)?.fromCache === true;
}

export function staleTimeFor(
  queryKey: readonly unknown[],
  data: unknown,
  { deviceOffline }: { deviceOffline: boolean },
): number {
  if (deviceOffline || isSavedCopy(data) || ALWAYS_STALE_QUERY_ROOTS.includes(queryKey[0] as string)) return 0;
  return FRESH_FOR_MS;
}
