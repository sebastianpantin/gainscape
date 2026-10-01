import type { JsonValue, Transaction } from '../db.ts';
import {
  type BalanceConfig,
  type EffortInputType,
  isWithinEditWindow,
  type LiftSetInput,
  resolveEffort,
  type SessionKey,
  type SessionSummary,
} from '../domain/index.ts';
import { HttpError } from '../http.ts';
import { inputSetColumns } from './set-columns.ts';

export interface StoredSession {
  userId: string;
  summary: SessionSummary;
  setIds: string[];
}

export interface ProfileSettings {
  bodyweightKg: number | null;
  timezone: string;
}

export interface NewSessionRow {
  id: string;
  userId: string;
  programDayId: string | null;
  startedAt: string;
  endedAt: string;
  timezone: string;
  historyOnly: boolean;
  balanceVersion: number;
  summary: Partial<SessionSummary>;
  notes: string | null;
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

export interface OwnedSession {
  key: SessionKey;
  historyOnly: boolean;
  revision: number;
  notes: string | null;
  summary: SessionSummary;
}

export async function requireOwnedSession(tx: Transaction, userId: string, sessionId: string): Promise<OwnedSession> {
  const [row] = await tx`
    select user_id, started_at, history_only, revision, notes, summary
    from public.sessions where id = ${sessionId}`;
  if (!row || row.user_id !== userId) throw new HttpError(404, 'session_not_found');
  return {
    key: { id: sessionId, startedAt: new Date(row.started_at).toISOString() },
    historyOnly: row.history_only,
    revision: row.revision,
    notes: row.notes,
    summary: row.summary,
  };
}

export function isEditable(session: OwnedSession, nowMs: number): boolean {
  return !session.historyOnly && isWithinEditWindow(session.key.startedAt, nowMs);
}

export interface StoredSet {
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number;
  effectiveLoadKg: number;
  reps: number;
  isWarmup: boolean;
  effortInputType: EffortInputType | null;
  effortValue: number | null;
}

export async function loadStoredSets(tx: Transaction, sessionId: string): Promise<StoredSet[]> {
  const rows = await tx`
    select id, exercise_id, position, weight_kg, effective_load_kg, reps, is_warmup, effort_input_type, effort_value
    from public.sets where session_id = ${sessionId} order by position`;
  return rows.map((row) => ({
    id: row.id,
    exerciseId: row.exercise_id,
    position: row.position,
    weightKg: Number(row.weight_kg),
    effectiveLoadKg: Number(row.effective_load_kg),
    reps: row.reps,
    isWarmup: row.is_warmup,
    effortInputType: row.effort_input_type,
    effortValue: row.effort_value === null ? null : Number(row.effort_value),
  }));
}

export async function tombstoneOwner(tx: Transaction, sessionId: string): Promise<string | null> {
  const [row] = await tx`select user_id from public.deleted_sessions where id = ${sessionId}`;
  return row?.user_id ?? null;
}

export async function assertSetIdsUnused(tx: Transaction, setIds: string[]): Promise<void> {
  const taken = await tx`select id from public.sets where id = any(${setIds}::uuid[])`;
  if (taken.length > 0) throw new HttpError(409, 'set_id_conflict', { setIds: taken.map((row) => row.id) });
}

export async function loadProfileSettings(tx: Transaction, userId: string): Promise<ProfileSettings> {
  const [privateProfile] =
    await tx`select bodyweight_kg, timezone from public.profile_private where user_id = ${userId}`;
  return {
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

export function placeholderSetRow(
  set: LiftSetInput,
  effectiveLoadKg: number,
  sessionId: string,
  userId: string,
  cfg: BalanceConfig,
) {
  return {
    ...inputSetColumns(set, effectiveLoadKg, resolveEffort(set.effort, cfg)),
    session_id: sessionId,
    user_id: userId,
    rir: null,
    rir_source: 'cold_start',
    rir_flagged: false,
    e1rm_before_kg: null,
    e1rm_candidate_kg: null,
    reps_capacity_candidate: null,
    effective_reps: 0,
    xp_awarded: 0,
  };
}

export async function insertSession(
  tx: Transaction,
  row: NewSessionRow,
  setRows: readonly Record<string, unknown>[],
): Promise<SessionSummary> {
  const [inserted] = await tx`
    insert into public.sessions
      (id, user_id, program_day_id, started_at, ended_at, local_date, timezone, history_only,
       balance_version, derived_balance_version, summary, notes)
    values
      (${row.id}, ${row.userId}, ${row.programDayId}, ${row.startedAt}, ${row.endedAt},
       (${row.startedAt}::timestamptz at time zone ${row.timezone})::date, ${row.timezone}, ${row.historyOnly},
       ${row.balanceVersion}, ${row.balanceVersion}, ${tx.json(row.summary as unknown as JsonValue)}, ${row.notes})
    returning summary`;
  await tx`insert into public.sets ${tx(setRows)}`;
  return inserted.summary;
}

export async function storedSummary(tx: Transaction, sessionId: string): Promise<SessionSummary> {
  const [row] = await tx`select summary from public.sessions where id = ${sessionId}`;
  return row.summary;
}

export interface SummaryPatch {
  id: string;
  patch: Pick<SessionSummary, 'xpBySkill' | 'levelUps' | 'prs'>;
}

export async function writeSummaries(
  tx: Transaction,
  entries: readonly SummaryPatch[],
  derivedBalanceVersion: number,
): Promise<void> {
  if (entries.length === 0) return;
  await tx`
    update public.sessions as target
    set summary = target.summary || derived.patch,
        derived_balance_version = ${derivedBalanceVersion},
        updated_at = now()
    from jsonb_to_recordset(${tx.json(entries as unknown as JsonValue)}) as derived (id uuid, patch jsonb)
    where target.id = derived.id`;
}
