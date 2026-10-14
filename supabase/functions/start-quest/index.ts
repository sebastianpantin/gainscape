import { z } from 'npm:zod@4.6.5';
import { sql } from '../_shared/db.ts';
import { type QuestProgress, questStartProblems } from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serveAuthenticated } from '../_shared/serve-authenticated.ts';
import { lowerUuid, parseOr422 } from '../_shared/session-payload.ts';
import { loadSkillXp } from '../_shared/stores/history.ts';
import { insertQuestProgress, loadCompletedQuestIds, loadQuest, loadQuestProgress } from '../_shared/stores/quests.ts';
import { lockUser } from '../_shared/stores/sessions.ts';

const startQuestSchema = z.object({ questId: lowerUuid }).strict();

type StartQuestPayload = z.infer<typeof startQuestSchema>;

function parseStartQuestPayload(body: unknown): StartQuestPayload {
  return parseOr422(startQuestSchema, body);
}

async function startQuest(userId: string, { questId }: StartQuestPayload): Promise<QuestProgress> {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);
    const stored = await loadQuest(tx, questId);
    if (stored === null) throw new HttpError(404, 'quest_not_found');
    const progress = await loadQuestProgress(tx, userId);
    const started = progress.find((entry) => entry.questId === questId);
    if (started !== undefined) return started;
    if (stored.retired) throw new HttpError(404, 'quest_not_found');
    const completedQuestIds = await loadCompletedQuestIds(tx, userId);
    if (completedQuestIds.includes(questId)) throw new HttpError(409, 'quest_completed');

    await takeRateLimit(tx, 'quest_start_hour', userId);
    const missing = questStartProblems(stored.quest, {
      skillXp: await loadSkillXp(tx, userId),
      completedQuestIds,
      startedQuestIds: progress.map((entry) => entry.questId),
    });
    if (missing.length > 0) throw new HttpError(409, 'quest_requirements_not_met', { missing });
    return await insertQuestProgress(tx, userId, questId);
  });
}

serveAuthenticated(parseStartQuestPayload, startQuest);
