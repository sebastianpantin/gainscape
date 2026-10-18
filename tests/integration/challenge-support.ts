import { DEFAULT_LOOT } from '@domain/index.ts';
import { db } from './local-stack.ts';

export const SCROLL_KEY = 'scroll_deficit_deadlift';
export const CHALLENGE_KEY = 'deadlift_and_pull_up';
export const BODYWEIGHT_KG = 80;

export async function usePrRollsOfTheDay(userId: string, sessionId: string): Promise<void> {
  await db`
    insert into public.loot_rolls
      (user_id, session_id, set_id, kind, local_date, roll_index, drop_table_id, chance, hit, loot_version)
    select ${userId}, s.id, gen_random_uuid(), 'pr', s.local_date, roll_index, t.id, 0.5, false, ${DEFAULT_LOOT.version}
    from public.sessions s
    cross join public.drop_tables t
    cross join generate_series(0, 1) as roll_index
    where s.id = ${sessionId} and t.key = 'rare'`;
}

export async function scrollsHeld(userId: string): Promise<number> {
  const [row] = await db`
    select u.quantity from public.user_items u join public.items i on i.id = u.item_id
    where u.user_id = ${userId} and i.key = ${SCROLL_KEY}`;
  return row?.quantity ?? 0;
}

export async function challengeLedger(userId: string) {
  return await db`
    select delta, reason::text, ref_id from public.item_ledger
    where user_id = ${userId} and reason = 'challenge' order by created_at, id`;
}

export async function storedSession(sessionId: string) {
  const [row] = await db`select challenge, summary, history_only from public.sessions where id = ${sessionId}`;
  return row;
}
