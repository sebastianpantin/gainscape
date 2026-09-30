import type { JsonValue, Transaction } from '../_shared/db.ts';
import type { SessionSummary, SetResult, UserState } from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { newSetRow, setSkillXpRows } from '../_shared/stores/set-columns.ts';
import type { CompleteSessionPayload } from './payload.ts';

export interface StoredSession {
  userId: string;
  summary: SessionSummary;
  setIds: string[];
}

export async function lockUser(tx: Transaction, userId: string): Promise<void> {
  const [profile] = await tx`select id from public.profiles where id = ${userId} for update`;
  if (!profile) throw new HttpError(403, 'profile_missing');
}

export async function findSession(tx: Transaction, sessionId: string): Promise<StoredSession | null> {
  const [row] = await tx`
    select s.user_id, s.summary, coalesce(array_agg(st.id order by st.id) filter (where st.id is not null), '{}') as set_ids
    from public.sessions s
    left join public.sets st on st.session_id = s.id
    where s.id = ${sessionId}
    group by s.id`;
  return row ? { userId: row.user_id, summary: row.summary, setIds: row.set_ids } : null;
}

export async function assertSetIdsUnused(tx: Transaction, setIds: string[]): Promise<void> {
  const taken = await tx`select id from public.sets where id = any(${setIds}::uuid[])`;
  if (taken.length > 0) throw new HttpError(409, 'set_id_conflict', { setIds: taken.map((row) => row.id) });
}

export async function loadUserState(tx: Transaction, userId: string): Promise<UserState & { timezone: string }> {
  const skillRows = await tx`select skill_id, xp from public.user_skills where user_id = ${userId}`;
  const [privateProfile] =
    await tx`select bodyweight_kg, timezone from public.profile_private where user_id = ${userId}`;
  return {
    skillXp: Object.fromEntries(skillRows.map((row) => [row.skill_id, Number(row.xp)])),
    bodyweightKg: privateProfile?.bodyweight_kg == null ? null : Number(privateProfile.bodyweight_kg),
    timezone: privateProfile?.timezone ?? 'UTC',
  };
}

export async function ownedProgramDayId(
  tx: Transaction,
  userId: string,
  programDayId: string | null,
): Promise<string | null> {
  if (programDayId === null) return null;
  const [row] = await tx`
    select d.id from public.program_days d join public.programs p on p.id = d.program_id
    where d.id = ${programDayId} and p.owner_user_id = ${userId}`;
  return row?.id ?? null;
}

export interface NewSession {
  userId: string;
  payload: CompleteSessionPayload;
  programDayId: string | null;
  timezone: string;
  balanceVersion: number;
  summary: SessionSummary;
  sets: readonly SetResult[];
  nextSkillXp: Readonly<Record<string, number>>;
}

export async function insertCompletedSession(tx: Transaction, session: NewSession): Promise<SessionSummary> {
  const { userId, payload } = session;
  const [inserted] = await tx`
    insert into public.sessions
      (id, user_id, program_day_id, started_at, ended_at, local_date, timezone, balance_version, derived_balance_version, summary, notes)
    values
      (${payload.id}, ${userId}, ${session.programDayId}, ${payload.startedAt}, ${payload.endedAt},
       (${payload.startedAt}::timestamptz at time zone ${session.timezone})::date, ${session.timezone},
       ${session.balanceVersion}, ${session.balanceVersion}, ${tx.json(session.summary as unknown as JsonValue)}, ${payload.notes})
    returning summary`;

  await tx`insert into public.sets ${tx(session.sets.map((result) => newSetRow(result, payload.id, userId)))}`;

  const xpRows = setSkillXpRows(session.sets, userId);
  if (xpRows.length > 0) await tx`insert into public.set_skill_xp ${tx(xpRows)}`;

  const userSkillRows = Object.entries(session.nextSkillXp).map(([skillId, xp]) => ({
    user_id: userId,
    skill_id: skillId,
    xp,
  }));
  if (userSkillRows.length > 0) {
    await tx`
      insert into public.user_skills ${tx(userSkillRows)}
      on conflict (user_id, skill_id) do update set xp = excluded.xp, updated_at = now()`;
  }
  return inserted.summary;
}

const UNIQUE_VIOLATION = '23505';

export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { code?: string }).code === UNIQUE_VIOLATION;
}
