import { type QuestRows, questRowsSchema } from '../lib/quests/quest-rules.ts';
import { userCache } from './cache-first.ts';

export const OFFLINE_QUESTS_NOTICE = 'Offline: using your saved quests.';

export const questsCache = userCache<QuestRows>('gainscape.quests.v1.', questRowsSchema);
