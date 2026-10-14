import type { Transaction } from '../db.ts';

export type RebuildScope = 'stale' | 'all';

export interface RebuildPage {
  userIds: string[];
  next: string | null;
}

async function staleUserIds(tx: Transaction, after: string | null, limit: number, version: number) {
  return await tx<{ id: string }[]>`
    select distinct user_id as id from public.sessions
    where not history_only and derived_balance_version <> ${version}
      and (${after}::uuid is null or user_id > ${after}::uuid)
    order by user_id
    limit ${limit}`;
}

async function userIdsWithDerivedData(tx: Transaction, after: string | null, limit: number) {
  return await tx<{ id: string }[]>`
    select p.id from public.profiles p
    where (${after}::uuid is null or p.id > ${after}::uuid)
      and (
        exists (select 1 from public.sessions x where x.user_id = p.id)
        or exists (select 1 from public.user_skills x where x.user_id = p.id)
        or exists (select 1 from public.exercise_maxes x where x.user_id = p.id)
        or exists (select 1 from public.rep_maxes x where x.user_id = p.id)
        or exists (select 1 from public.bodyweight_rep_records x where x.user_id = p.id)
        or exists (select 1 from public.cardio_records x where x.user_id = p.id)
        or exists (select 1 from public.quest_completions x where x.user_id = p.id)
      )
    order by p.id
    limit ${limit}`;
}

export async function listUsersToRebuild(
  tx: Transaction,
  scope: RebuildScope,
  after: string | null,
  limit: number,
  version: number,
): Promise<RebuildPage> {
  const rows =
    scope === 'stale' ? await staleUserIds(tx, after, limit, version) : await userIdsWithDerivedData(tx, after, limit);
  const userIds = rows.map((row) => row.id);
  return { userIds, next: userIds.length === limit ? userIds[userIds.length - 1] : null };
}
