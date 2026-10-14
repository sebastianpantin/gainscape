import { type DbRow, isoTimestamp, type JsonValue, type Transaction } from '../db.ts';
import {
  type BalanceConfig,
  type QuestCompletion,
  questCompletedEvent,
  type QuestDefinition,
  questDefinitionFromStored,
  type QuestProgress,
  questsAfterSession,
  type ReplayedSession,
  type SessionKey,
  type SkillXpGrant,
} from '../domain/index.ts';
import { logUnexpectedError } from '../http.ts';
import { loadCatalog } from './catalog.ts';
import { insertQuestEvent } from './events.ts';
import { loadSkillXp } from './history.ts';

interface StoredQuest {
  quest: QuestDefinition;
  retired: boolean;
}

interface QuestRow {
  id: string;
  key: string;
  name: string;
  quest_points: number;
  definition: unknown;
  retired_at: string | null;
}

function storedQuestFromRow(row: QuestRow): StoredQuest | null {
  const identity = { questId: row.id, key: row.key, name: row.name, questPoints: row.quest_points };
  try {
    return { quest: questDefinitionFromStored(identity, row.definition), retired: row.retired_at !== null };
  } catch (error) {
    logUnexpectedError(new Error(`skipping quest ${row.key}: its stored definition cannot be read`, { cause: error }));
    return null;
  }
}

async function loadQuests(tx: Transaction): Promise<StoredQuest[]> {
  const rows = await tx<QuestRow[]>`
    select id, key, name, quest_points, definition, retired_at from public.quests order by sort_order, id`;
  return rows.flatMap((row) => storedQuestFromRow(row) ?? []);
}

export async function loadQuest(tx: Transaction, questId: string): Promise<StoredQuest | null> {
  const [row] = await tx<QuestRow[]>`
    select id, key, name, quest_points, definition, retired_at from public.quests where id = ${questId}`;
  return row === undefined ? null : storedQuestFromRow(row);
}

function progressFromRow(row: DbRow): QuestProgress {
  return {
    questId: row.quest_id,
    startedAt: isoTimestamp(row.started_at),
    stepIndex: row.step_index,
    stepProgress: Number(row.step_progress),
  };
}

export async function loadQuestProgress(tx: Transaction, userId: string): Promise<QuestProgress[]> {
  const rows = await tx`
    select quest_id, started_at, step_index, step_progress from public.quest_progress
    where user_id = ${userId} order by started_at, quest_id`;
  return rows.map(progressFromRow);
}

export async function loadCompletedQuestIds(tx: Transaction, userId: string): Promise<string[]> {
  const rows = await tx`select quest_id from public.quest_completions where user_id = ${userId}`;
  return rows.map((row) => row.quest_id);
}

export async function insertQuestProgress(tx: Transaction, userId: string, questId: string): Promise<QuestProgress> {
  const [row] = await tx`
    insert into public.quest_progress (user_id, quest_id) values (${userId}, ${questId})
    returning quest_id, started_at, step_index, step_progress`;
  return progressFromRow(row);
}

export async function loadQuestXpBefore(
  tx: Transaction,
  userId: string,
  before: SessionKey,
): Promise<Record<string, number>> {
  const rows = await tx`
    select x.skill_id, sum(x.xp)::bigint as xp
    from public.quest_completion_xp x
    join public.quest_completions c on c.user_id = x.user_id and c.quest_id = x.quest_id
    where x.user_id = ${userId}
      and (c.anchor_started_at, c.anchor_session_id) < (${before.startedAt}::timestamptz, ${before.id}::uuid)
    group by x.skill_id`;
  return Object.fromEntries(rows.map((row) => [row.skill_id, Number(row.xp)]));
}

export async function loadQuestGrantsFrom(
  tx: Transaction,
  userId: string,
  from: SessionKey | null,
): Promise<SkillXpGrant[]> {
  const rows = await tx`
    select c.anchor_session_id, c.anchor_started_at, jsonb_object_agg(x.skill_id, x.xp) as xp_by_skill
    from public.quest_completions c
    join public.quest_completion_xp x on x.user_id = c.user_id and x.quest_id = c.quest_id
    where c.user_id = ${userId}
      ${
        from === null
          ? tx``
          : tx`and (c.anchor_started_at, c.anchor_session_id) >= (${from.startedAt}::timestamptz, ${from.id}::uuid)`
      }
    group by c.quest_id, c.anchor_session_id, c.anchor_started_at`;
  return rows.map((row) => ({
    at: { id: row.anchor_session_id, startedAt: isoTimestamp(row.anchor_started_at) },
    xpBySkill: row.xp_by_skill,
  }));
}

export async function hasLaterQuestGrants(tx: Transaction, userId: string, from: SessionKey): Promise<boolean> {
  const [row] = await tx`
    select exists (
      select 1 from public.quest_completions c
      where c.user_id = ${userId}
        and (c.anchor_started_at, c.anchor_session_id) >= (${from.startedAt}::timestamptz, ${from.id}::uuid)
    ) as later`;
  return row.later;
}

async function latestScoredSession(tx: Transaction, userId: string): Promise<SessionKey> {
  const [row] = await tx`
    select id, started_at from public.sessions
    where user_id = ${userId} and not history_only
    order by started_at desc, id desc
    limit 1`;
  return { id: row.id, startedAt: isoTimestamp(row.started_at) };
}

async function recordCompletion(
  tx: Transaction,
  userId: string,
  completion: QuestCompletion,
  sessionId: string,
  anchor: SessionKey,
): Promise<void> {
  const { quest } = completion;
  await tx`
    insert into public.quest_completions
      (user_id, quest_id, started_at, session_id, anchor_started_at, anchor_session_id, quest_points)
    values
      (${userId}, ${quest.questId}, ${completion.startedAt}, ${sessionId}, ${anchor.startedAt}, ${anchor.id},
       ${quest.questPoints})`;
  const xpRows = Object.entries(completion.xpBySkill).map(([skillId, xp]) => ({
    user_id: userId,
    quest_id: quest.questId,
    skill_id: skillId,
    xp,
  }));
  if (xpRows.length > 0) await tx`insert into public.quest_completion_xp ${tx(xpRows)}`;
  await tx`delete from public.quest_progress where user_id = ${userId} and quest_id = ${quest.questId}`;
}

async function writeSkillXp(
  tx: Transaction,
  userId: string,
  before: Readonly<Record<string, number>>,
  after: Readonly<Record<string, number>>,
): Promise<void> {
  const rows = Object.entries(after)
    .filter(([skillId, xp]) => xp !== (before[skillId] ?? 0))
    .map(([skillId, xp]) => ({ user_id: userId, skill_id: skillId, xp }));
  if (rows.length === 0) return;
  await tx`
    insert into public.user_skills ${tx(rows)}
    on conflict (user_id, skill_id) do update set xp = excluded.xp, updated_at = now()`;
}

export interface SyncedSession {
  endedAt: string;
  replayed: ReplayedSession;
}

export async function advanceQuestsForSession(
  tx: Transaction,
  userId: string,
  synced: SyncedSession,
  skillXpBeforeSync: Readonly<Record<string, number>>,
  cfg: BalanceConfig,
): Promise<void> {
  const stored = await loadQuests(tx);
  const skillXpAfterSync = await loadSkillXp(tx, userId);
  const { replayed } = synced;
  const outcome = questsAfterSession(
    {
      quests: stored.map(({ quest }) => quest),
      retiredQuestIds: stored.filter(({ retired }) => retired).map(({ quest }) => quest.questId),
      progress: await loadQuestProgress(tx, userId),
      completedQuestIds: await loadCompletedQuestIds(tx, userId),
      skillXpBeforeSync,
      skillXpAfterSync,
      facts: {
        endedAt: synced.endedAt,
        sets: replayed.outputs.sets,
        strengthAtStart: replayed.strengthAtStart,
        prs: replayed.outputs.prs,
      },
    },
    await loadCatalog(tx, userId, []),
    cfg,
  );
  if (outcome.summary === null) return;

  for (const progress of outcome.progressed) {
    await tx`
      update public.quest_progress
      set step_index = ${progress.stepIndex}, step_progress = ${progress.stepProgress}, updated_at = now()
      where user_id = ${userId} and quest_id = ${progress.questId}`;
  }
  if (outcome.completions.length > 0) {
    const anchor = await latestScoredSession(tx, userId);
    for (const completion of outcome.completions) {
      await recordCompletion(tx, userId, completion, replayed.session.id, anchor);
      await insertQuestEvent(tx, userId, questCompletedEvent(completion.quest, completion.levelUps), synced.endedAt);
    }
    await writeSkillXp(tx, userId, skillXpAfterSync, outcome.skillXp);
  }
  await tx`
    update public.sessions
    set summary = summary || jsonb_build_object('quests', ${tx.json(outcome.summary as unknown as JsonValue)}::jsonb)
    where id = ${replayed.session.id}`;
}
