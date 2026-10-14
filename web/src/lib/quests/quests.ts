import type { QuestProgress } from '@domain/quests.ts';
import { type CacheFirstLoad, isDeviceOffline, loadCacheFirstWhenOffline } from '../../offline/cache-first.ts';
import { questsCache } from '../../offline/quests-cache.ts';
import { REQUEST_TIMEOUT_MS } from '../platform/auth-restore.ts';
import { invokeAsOwner } from '../platform/function-client.ts';
import type { InvokeOutcome } from '../platform/function-client-rules.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';
import {
  QUEST_COLUMNS,
  QUEST_COMPLETION_COLUMNS,
  QUEST_PROGRESS_COLUMNS,
  questExerciseIds,
  type QuestLog,
  questLogFrom,
  type QuestRow,
  type QuestRows,
  toCatalogQuest,
} from './quest-rules.ts';

async function fetchExerciseNames(exerciseIds: string[]): Promise<Record<string, string>> {
  if (exerciseIds.length === 0) return {};
  const { data, error } = await supabase.from('exercises').select('id,name').in('id', exerciseIds);
  if (error) throw error;
  return Object.fromEntries(data.map((row) => [row.id, row.name]));
}

async function fetchQuestRows(userId: string): Promise<QuestRows> {
  const [quests, progress, completions] = await Promise.all([
    supabase.from('quests').select(QUEST_COLUMNS).order('sort_order'),
    supabase.from('quest_progress').select(QUEST_PROGRESS_COLUMNS).eq('user_id', userId),
    supabase.from('quest_completions').select(QUEST_COMPLETION_COLUMNS).eq('user_id', userId).order('completed_at'),
  ]);
  if (quests.error) throw quests.error;
  if (progress.error) throw progress.error;
  if (completions.error) throw completions.error;
  const questRows = quests.data as QuestRow[];
  const exerciseNames = await fetchExerciseNames(
    questExerciseIds(questRows.flatMap((row) => toCatalogQuest(row) ?? [])),
  );
  const rows = { quests: questRows, progress: progress.data, completions: completions.data, exerciseNames };
  questsCache.save(deviceStorage(), userId, rows);
  return rows;
}

export async function loadQuestsCacheFirst(userId: string): Promise<CacheFirstLoad<QuestLog>> {
  const load = await loadCacheFirstWhenOffline(
    isDeviceOffline,
    () => questsCache.read(deviceStorage(), userId),
    () => fetchQuestRows(userId),
  );
  return { ...load, loaded: questLogFrom(load.loaded) };
}

export function startQuest(userId: string, questId: string): Promise<InvokeOutcome<QuestProgress>> {
  return invokeAsOwner<QuestProgress>(userId, 'start-quest', { questId }, REQUEST_TIMEOUT_MS);
}
