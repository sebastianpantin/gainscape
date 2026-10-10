import { type LastLoggedWeights } from '@domain/index.ts';
import { infiniteQueryOptions, queryOptions } from '@tanstack/react-query';
import { type CacheFirstLoad } from '../offline/cache-first.ts';
import { fetchBodyweightTrend } from './bodyweight-trend.ts';
import { fetchExercises, fetchSkills } from './catalog.ts';
import { saveCachedExercises } from './catalog-cache.ts';
import { type Skill } from './catalog-rules.ts';
import { type Collection, loadCollectionCacheFirst } from './collection-data.ts';
import { collectionPercent, countCollection } from './collection-rules.ts';
import { fetchExerciseProgress } from './exercise-progress.ts';
import { isUuid } from './history-rules.ts';
import { fetchLoadout, loadItemsCacheFirst } from './items.ts';
import { loadProfileCacheFirst } from './profile.ts';
import { loadEnrollChoicesCacheFirst, loadProgramTemplatesCacheFirst } from './program-enrollment.ts';
import { fetchLastLoggedSets } from './programs.ts';
import {
  FEED_PAGE_SIZE,
  fetchCollectionView,
  fetchFeedPage,
  fetchHiscores,
  fetchProfileView,
  type CollectionView,
  type ProfileView,
  listFriends,
} from './social.ts';
import { type FeedCursor, feedCursor } from './social-rules.ts';
import { fetchWeeklyGoalStatus } from './weekly-goal.ts';

export const FRIENDS_QUERY_PREFIX = ['friends'] as const;
export const FEED_QUERY_PREFIX = ['feed'] as const;

export function profileQuery(userId: string) {
  return queryOptions({
    queryKey: ['profile', userId] as const,
    queryFn: ({ signal }) => loadProfileCacheFirst(userId, signal),
  });
}

export function collectionQuery(userId: string) {
  return queryOptions({ queryKey: ['collection', userId] as const, queryFn: () => loadCollectionCacheFirst(userId) });
}

function completionPercent({ loaded }: CacheFirstLoad<Collection>): number {
  const { filledSlots, totalSlots } = countCollection(loaded.exercises, loaded.data).completion;
  return collectionPercent(filledSlots, totalSlots);
}

export function collectionPercentQuery(userId: string) {
  return queryOptions({ ...collectionQuery(userId), select: completionPercent });
}

export function loadoutQuery(userId: string) {
  return queryOptions({ queryKey: ['loadout', userId] as const, queryFn: () => fetchLoadout(userId) });
}

export function itemsQuery(userId: string) {
  return queryOptions({
    queryKey: ['items', userId] as const,
    queryFn: ({ signal }) => loadItemsCacheFirst(userId, signal),
  });
}

export const skillsQuery = queryOptions({ queryKey: ['skills'] as const, queryFn: fetchSkills });

export function friendsQuery(userId: string) {
  return queryOptions({ queryKey: [...FRIENDS_QUERY_PREFIX, userId] as const, queryFn: listFriends });
}

export function feedQuery(userId: string) {
  return infiniteQueryOptions({
    queryKey: [...FEED_QUERY_PREFIX, userId] as const,
    queryFn: ({ pageParam }) => fetchFeedPage(pageParam),
    initialPageParam: null as FeedCursor | null,
    getNextPageParam: (lastPage) => {
      const lastItem = lastPage.at(-1);
      return lastItem && lastPage.length >= FEED_PAGE_SIZE ? feedCursor(lastItem) : undefined;
    },
  });
}

export const hiscoresQuery = queryOptions({ queryKey: ['hiscores'] as const, queryFn: fetchHiscores });

export interface FriendProfileLoad {
  skills: Skill[];
  profile: ProfileView;
  collection: CollectionView;
}

export function friendProfileQuery(friendId: string) {
  return queryOptions({
    queryKey: ['friend-profile', friendId] as const,
    queryFn: async (): Promise<FriendProfileLoad | null> => {
      const [skills, profile, collection] = await Promise.all([
        fetchSkills(),
        fetchProfileView(friendId),
        fetchCollectionView(friendId),
      ]);
      return profile && collection ? { skills, profile, collection } : null;
    },
    enabled: isUuid(friendId),
  });
}

export function profilePreviewQuery(userId: string) {
  return queryOptions({
    queryKey: ['profile-preview', userId] as const,
    queryFn: async () => {
      const [skills, profile] = await Promise.all([fetchSkills(), fetchProfileView(userId)]);
      if (!profile) throw new Error('Your profile could not be loaded.');
      return { skills, profile };
    },
  });
}

export function bodyweightTrendQuery(userId: string) {
  return queryOptions({
    queryKey: ['bodyweight-trend', userId] as const,
    queryFn: ({ signal }) => fetchBodyweightTrend(userId, signal),
  });
}

export function exerciseProgressQuery(userId: string, exerciseId: string) {
  return queryOptions({
    queryKey: ['exercise-progress', userId, exerciseId] as const,
    queryFn: ({ signal }) => fetchExerciseProgress(userId, exerciseId, signal),
  });
}

export function programTemplatesQuery(userId: string) {
  return queryOptions({
    queryKey: ['program-templates', userId] as const,
    queryFn: () => loadProgramTemplatesCacheFirst(userId),
  });
}

export function enrollChoicesQuery(userId: string) {
  return queryOptions({
    queryKey: ['enroll-choices', userId] as const,
    queryFn: () => loadEnrollChoicesCacheFirst(userId),
  });
}

export const weeklyGoalQuery = queryOptions({
  queryKey: ['weekly-goal'] as const,
  queryFn: ({ signal }) => fetchWeeklyGoalStatus(signal),
});

export function exerciseListQuery(userId: string) {
  return queryOptions({
    queryKey: ['exercises', userId, 'all'] as const,
    queryFn: async () => {
      const exercises = await fetchExercises({ includeArchived: true });
      saveCachedExercises(localStorage, userId, exercises);
      return exercises;
    },
  });
}

export function lastLoggedWeightsQuery(exerciseIds: readonly string[]) {
  return queryOptions({
    queryKey: ['last-logged-weights', ...exerciseIds] as const,
    queryFn: async (): Promise<LastLoggedWeights> => {
      const lastSets = await fetchLastLoggedSets([...exerciseIds]);
      return Object.fromEntries([...lastSets].map(([id, set]) => [id, set.weightKg]));
    },
    enabled: exerciseIds.length > 0,
  });
}
