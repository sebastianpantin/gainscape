import { z } from 'zod';
import type { QuestRows } from '../lib/quests/quest-rules.ts';
import { userCache } from './cache-first.ts';

export const OFFLINE_QUESTS_NOTICE = 'Offline: using your saved quests.';

const numeric = z.union([z.number(), z.string()]);

const questRowsSchema = z.object({
  quests: z.array(
    z.object({
      id: z.string(),
      key: z.string(),
      name: z.string(),
      description: z.string(),
      quest_points: z.number(),
      sort_order: z.number(),
      definition: z.unknown(),
      retired_at: z.string().nullable(),
    }),
  ),
  progress: z.array(
    z.object({ quest_id: z.string(), started_at: z.string(), step_index: z.number(), step_progress: numeric }),
  ),
  completions: z.array(z.object({ quest_id: z.string(), completed_at: z.string(), quest_points: z.number() })),
  exerciseNames: z.record(z.string(), z.string()),
});

export const questsCache = userCache<QuestRows>('gainscape.quests.v1.', questRowsSchema as z.ZodType<QuestRows>);
