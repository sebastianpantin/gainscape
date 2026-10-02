import { isoTimestamp, type JsonValue, nullableNumber, type Transaction } from '../db.ts';
import {
  type FeedExercise,
  feedEventsForSession,
  type FeedSourceSet,
  type ItemRarityRank,
  type LoadType,
  type SessionSummary,
} from '../domain/index.ts';

interface EventRow {
  session_id: string;
  event_key: string;
  type: string;
  set_id: string | null;
  occurred_at: string;
  payload: Record<string, string | number | null>;
}

export async function syncSessionEvents(tx: Transaction, userId: string, sessionIds: readonly string[]): Promise<void> {
  if (sessionIds.length === 0) return;
  const ids = [...sessionIds];
  const sessions = await tx`
    select id, summary, ended_at from public.sessions
    where user_id = ${userId} and id = any(${ids}::uuid[])`;
  const setRows = await tx`
    select id, session_id, effective_load_kg
    from public.sets
    where user_id = ${userId} and session_id = any(${ids}::uuid[]) and not is_warmup`;
  const summaries = sessions.map((row) => row.summary as SessionSummary);
  const exerciseIds = [...new Set(summaries.flatMap((summary) => (summary.prs ?? []).map((pr) => pr.exerciseId)))];
  const itemIds = [...new Set(summaries.flatMap((summary) => (summary.drops ?? []).map((drop) => drop.itemId)))];
  const exerciseRows =
    exerciseIds.length === 0
      ? []
      : await tx`
          select id, owner_user_id, load_type from public.exercises
          where id = any(${exerciseIds}::uuid[]) and (owner_user_id is null or owner_user_id = ${userId})`;
  const itemRows =
    itemIds.length === 0 ? [] : await tx`select id, rarity from public.items where id = any(${itemIds}::uuid[])`;

  const exercises = new Map<string, FeedExercise>(
    exerciseRows.map((row) => [
      row.id,
      { builtIn: row.owner_user_id === null, loadType: row.load_type as LoadType | null },
    ]),
  );
  const itemRarity = new Map<string, ItemRarityRank>(itemRows.map((row) => [row.id, row.rarity as ItemRarityRank]));
  const setsBySession = new Map<string, FeedSourceSet[]>();
  for (const row of setRows) {
    const sets = setsBySession.get(row.session_id) ?? [];
    sets.push({
      id: row.id,
      effectiveLoadKg: nullableNumber(row.effective_load_kg),
    });
    setsBySession.set(row.session_id, sets);
  }

  const keep: EventRow[] = sessions.flatMap((session) =>
    feedEventsForSession(session.summary, setsBySession.get(session.id) ?? [], exercises, itemRarity).map((draft) => ({
      session_id: session.id,
      event_key: draft.key,
      type: draft.type,
      set_id: draft.setId,
      occurred_at: isoTimestamp(session.ended_at),
      payload: draft.payload,
    })),
  );
  const keepJson = tx.json(keep as unknown as JsonValue);

  if (keep.length > 0) {
    await tx`
      insert into public.events (user_id, session_id, event_key, type, set_id, occurred_at, payload)
      select ${userId}, k.session_id, k.event_key, k.type, k.set_id, k.occurred_at, k.payload
      from jsonb_to_recordset(${keepJson}) as k (
        session_id uuid,
        event_key text,
        type public.event_type,
        set_id uuid,
        occurred_at timestamptz,
        payload jsonb
      )
      on conflict (session_id, event_key) do update
      set type = excluded.type,
          set_id = excluded.set_id,
          payload = excluded.payload,
          occurred_at = excluded.occurred_at,
          updated_at = now()
      where (events.type, events.set_id, events.payload, events.occurred_at)
        is distinct from (excluded.type, excluded.set_id, excluded.payload, excluded.occurred_at)`;
  }
  await tx`
    delete from public.events e
    where e.user_id = ${userId}
      and e.session_id = any(${ids}::uuid[])
      and not exists (
        select 1 from jsonb_to_recordset(${keepJson}) as k (session_id uuid, event_key text)
        where k.session_id = e.session_id and k.event_key = e.event_key)`;
}
