import { type LastLoggedWeights } from '@domain/index.ts';
import { infiniteQueryOptions, type QueryClient, queryOptions } from '@tanstack/react-query';
import { type CacheFirstLoad } from '../../offline/cache-first.ts';
import { fetchBodyweightTrend } from '../progress/bodyweight-trend.ts';
import { fetchExercises, fetchSkills } from '../exercises/catalog.ts';
import { saveCachedExercises } from '../exercises/catalog-cache.ts';
import { type Skill } from '../exercises/catalog-rules.ts';
import { type Collection, loadCollectionCacheFirst } from '../collection/collection-data.ts';
import { collectionPercent, countCollection } from '../collection/collection-rules.ts';
import { fetchExerciseProgress } from '../progress/exercise-progress.ts';
import { fetchSessionPage } from '../history/history.ts';
import { HISTORY_PAGE_SIZE, type HistorySession, isUuid } from '../history/history-rules.ts';
import { fetchLoadout, fetchOwnedPets, loadItemsCacheFirst } from '../collection/items.ts';
import { fetchTrainingHistory } from '../profile/onboarding.ts';
import { loadProfileCacheFirst } from '../profile/profile.ts';
import { loadEnrollChoicesCacheFirst, loadProgramTemplatesCacheFirst } from '../programs/program-enrollment.ts';
import { fetchLastLoggedSets, type PublishedProgram, publishProgram } from '../programs/programs.ts';
import {
  FEED_PAGE_SIZE,
  fetchCollectionView,
  fetchFeedPage,
  fetchHiscores,
  fetchProfileView,
  type CollectionView,
  type ProfileView,
  listFriends,
} from '../social/social.ts';
import { FRESH_FOR_MS } from './query-freshness-rules.ts';
import { fetchRecentSets } from '../progress/recovery.ts';
import { type FeedCursor, feedCursor } from '../social/social-rules.ts';
import { fetchWeeklyGoalStatus } from '../progress/weekly-goal.ts';
import { loadQuestsCacheFirst } from '../quests/quests.ts';
import { type QuestLog } from '../quests/quest-rules.ts';

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

export function feedPreviewQuery(userId: string) {
  return queryOptions({
    queryKey: [...FEED_QUERY_PREFIX, userId, 'preview'] as const,
    queryFn: () => fetchFeedPage(null),
    staleTime: FRESH_FOR_MS,
  });
}

export function ownedPetsQuery(userId: string) {
  return queryOptions({
    queryKey: ['items', userId, 'pets'] as const,
    queryFn: () => fetchOwnedPets(userId),
  });
}

export function recentSetsQuery(userId: string) {
  return queryOptions({
    queryKey: ['history', userId, 'recent-sets'] as const,
    queryFn: () => fetchRecentSets(Date.now()),
  });
}

export function historyQuery(userId: string) {
  return infiniteQueryOptions({
    queryKey: ['history', userId] as const,
    queryFn: ({ pageParam }) => fetchSessionPage(pageParam),
    initialPageParam: null as HistorySession | null,
    getNextPageParam: (lastPage) => (lastPage.length === HISTORY_PAGE_SIZE ? lastPage.at(-1) : undefined),
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

export function trainingHistoryQuery(userId: string) {
  return queryOptions({
    queryKey: ['training-history', userId] as const,
    queryFn: () => fetchTrainingHistory(userId),
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
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

export async function publishForEnroll(
  queryClient: QueryClient,
  userId: string,
  programId: string,
  publish: (programId: string) => Promise<PublishedProgram> = publishProgram,
): Promise<PublishedProgram> {
  const published = await publish(programId);
  queryClient.removeQueries({ queryKey: enrollChoicesQuery(userId).queryKey });
  return published;
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

export function questsQuery(userId: string) {
  return queryOptions({ queryKey: ['quests', userId] as const, queryFn: () => loadQuestsCacheFirst(userId) });
}

function questPointsOf({ loaded }: CacheFirstLoad<QuestLog>): number {
  return loaded.questPoints;
}

export function questPointsQuery(userId: string) {
  return queryOptions({ ...questsQuery(userId), select: questPointsOf });
}
