import { isoTimestamp, type JsonValue, nullableNumber, type Transaction } from '../db.ts';
import {
  type BalanceConfig,
  type GearLoadout,
  isSessionEditable,
  type SessionKey,
  type SessionSummary,
  setKind,
  type StoredSet,
  type WritableSet,
} from '../domain/index.ts';
import { HttpError } from '../http.ts';
import {
  cardioFieldsFromRow,
  inputColumnsWithEffort,
  NO_PRESCRIPTION_SNAPSHOT,
  type PrescriptionSnapshotColumns,
} from './set-columns.ts';

export interface SessionTiming {
  startedAt: string;
  endedAt: string;
  sessionRpe: number | null;
}

export interface StoredSession extends SessionTiming {
  userId: string;
  summary: SessionSummary;
  setIds: string[];
  completedAt: string;
  programLinked: boolean;
}

export interface ProgramLink {
  enrollmentId: string;
  position: Record<string, unknown>;
}

export interface InsertedSession {
  summary: SessionSummary;
  completedAt: string;
}

export interface ProfileSettings {
  bodyweightKg: number | null;
  timezone: string;
}

export interface NewSessionRow extends SessionTiming {
  id: string;
  userId: string;
  programDayId: string | null;
  programLink: ProgramLink | null;
  timezone: string;
  historyOnly: boolean;
  balanceVersion: number;
  summary: Partial<SessionSummary>;
  notes: string | null;
  gearLoadout: GearLoadout;
}

export async function lockUser(
  tx: Transaction,
  userId: string,
  missingProfile = new HttpError(403, 'profile_missing'),
): Promise<void> {
  const [profile] = await tx`select id from public.profiles where id = ${userId} for update`;
  if (!profile) throw missingProfile;
}

export async function findSession(tx: Transaction, sessionId: string): Promise<StoredSession | null> {
  const [row] = await tx`
    select s.user_id, s.summary, s.completed_at, s.enrollment_id, s.started_at, s.ended_at, s.session_rpe,
           coalesce(array_agg(st.id order by st.id) filter (where st.id is not null), '{}') as set_ids
    from public.sessions s
    left join public.sets st on st.session_id = s.id
    where s.id = ${sessionId}
    group by s.id`;
  if (!row) return null;
  return {
    userId: row.user_id,
    summary: row.summary,
    setIds: row.set_ids,
    completedAt: isoTimestamp(row.completed_at),
    programLinked: row.enrollment_id !== null,
    startedAt: isoTimestamp(row.started_at),
    endedAt: isoTimestamp(row.ended_at),
    sessionRpe: row.session_rpe,
  };
}

export interface OwnedSession {
  key: SessionKey;
  historyOnly: boolean;
  revision: number;
  notes: string | null;
  summary: SessionSummary;
  programLinked: boolean;
}

export async function requireOwnedSession(tx: Transaction, userId: string, sessionId: string): Promise<OwnedSession> {
  const [row] = await tx`
    select user_id, started_at, history_only, revision, notes, summary, enrollment_id
    from public.sessions where id = ${sessionId}`;
  if (!row || row.user_id !== userId) throw new HttpError(404, 'session_not_found');
  return {
    key: { id: sessionId, startedAt: isoTimestamp(row.started_at) },
    historyOnly: row.history_only,
    revision: row.revision,
    notes: row.notes,
    summary: row.summary,
    programLinked: row.enrollment_id !== null,
  };
}

export function isOwnedSessionEditable(session: OwnedSession, now: number): boolean {
  return isSessionEditable({ historyOnly: session.historyOnly, startedAt: session.key.startedAt }, now);
}

export async function loadStoredSets(tx: Transaction, sessionId: string): Promise<StoredSet[]> {
  const rows = await tx`
    select id, exercise_id, position, weight_kg, effective_load_kg, reps, is_warmup, effort_input_type, effort_value,
           duration_s, distance_m, interval_work_s, interval_rest_s, interval_rounds
    from public.sets where session_id = ${sessionId} order by position`;
  return rows.map((row): StoredSet => {
    const base = {
      id: row.id,
      exerciseId: row.exercise_id,
      position: row.position,
      effortInputType: row.effort_input_type,
      effortValue: nullableNumber(row.effort_value),
    };
    if (row.duration_s !== null) return { ...base, kind: 'cardio', ...cardioFieldsFromRow(row) };
    return {
      ...base,
      kind: 'lift',
      weightKg: Number(row.weight_kg),
      effectiveLoadKg: Number(row.effective_load_kg),
      reps: row.reps,
      isWarmup: row.is_warmup,
    };
  });
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
    bodyweightKg: nullableNumber(privateProfile?.bodyweight_kg),
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

export async function linkedProgram(
  tx: Transaction,
  userId: string,
  program: ProgramLink | null,
): Promise<ProgramLink | null> {
  if (program === null) return null;
  const [row] = await tx`
    select e.id from public.program_enrollments e
    join public.program_templates t on t.key = e.template_key and t.version = e.template_version
    where e.id = ${program.enrollmentId} and e.user_id = ${userId}
      and private.is_valid_program_position(t.definition -> 'schedule', ${tx.json(program.position as JsonValue)})`;
  return row ? program : null;
}

export async function loadPrescriptionRefs(tx: Transaction, sessionId: string): Promise<Map<string, string>> {
  const rows = await tx`
    select id, prescription_ref from public.sets where session_id = ${sessionId} and prescription_ref is not null`;
  return new Map(rows.map((row) => [row.id, row.prescription_ref]));
}

export function placeholderSetRow(set: WritableSet, sessionId: string, userId: string, cfg: BalanceConfig) {
  const kind = setKind(set);
  return {
    ...inputColumnsWithEffort(set, cfg),
    session_id: sessionId,
    user_id: userId,
    rir: null,
    rir_source: kind === 'cardio' ? 'default' : 'cold_start',
    rir_flagged: false,
    e1rm_before_kg: null,
    e1rm_candidate_kg: null,
    reps_capacity_candidate: null,
    effective_reps: 0,
    xp_awarded: 0,
    pace_flagged: false,
  };
}

export async function writeEditedSets(
  tx: Transaction,
  userId: string,
  sessionId: string,
  storedSets: readonly StoredSet[],
  requested: readonly WritableSet[],
  addedSnapshots: ReadonlyMap<string, PrescriptionSnapshotColumns>,
  cfg: BalanceConfig,
): Promise<void> {
  const requestedIds = new Set(requested.map((set) => set.id));
  const storedIds = new Set(storedSets.map((set) => set.id));
  const removedIds = storedSets.filter((set) => !requestedIds.has(set.id)).map((set) => set.id);
  const kept = requested.filter((set) => storedIds.has(set.id));
  const added = requested.filter((set) => !storedIds.has(set.id));

  await tx`set constraints public.sets_session_id_position_key deferred`;
  if (removedIds.length > 0) {
    await tx`delete from public.sets where session_id = ${sessionId} and id = any(${removedIds}::uuid[])`;
  }
  if (kept.length > 0) {
    const rows = kept.map((set) => inputColumnsWithEffort(set, cfg));
    await tx`
      update public.sets as target
      set exercise_id = derived.exercise_id,
          position = derived.position,
          weight_kg = derived.weight_kg,
          effective_load_kg = derived.effective_load_kg,
          reps = derived.reps,
          is_warmup = derived.is_warmup,
          effort_input_type = derived.effort_input_type,
          effort_value = derived.effort_value,
          duration_s = derived.duration_s,
          distance_m = derived.distance_m,
          interval_work_s = derived.interval_work_s,
          interval_rest_s = derived.interval_rest_s,
          interval_rounds = derived.interval_rounds,
          counted_work_s = derived.counted_work_s,
          updated_at = now()
      from jsonb_to_recordset(${tx.json(rows as unknown as JsonValue)}) as derived (
        id uuid,
        exercise_id uuid,
        position int,
        weight_kg numeric,
        effective_load_kg numeric,
        reps int,
        is_warmup boolean,
        effort_input_type public.effort_input_type,
        effort_value numeric,
        duration_s int,
        distance_m numeric,
        interval_work_s int,
        interval_rest_s int,
        interval_rounds int,
        counted_work_s int
      )
      where target.id = derived.id and target.session_id = ${sessionId}`;
  }
  if (added.length > 0) {
    const rows = added.map((set) => ({
      ...placeholderSetRow(set, sessionId, userId, cfg),
      ...(addedSnapshots.get(set.id) ?? NO_PRESCRIPTION_SNAPSHOT),
    }));
    await tx`insert into public.sets ${tx(rows)}`;
  }
}

export async function bumpRevision(tx: Transaction, sessionId: string, notes: string | null): Promise<number> {
  const [updated] = await tx`
    update public.sessions
    set notes = ${notes}, revision = revision + 1, updated_at = now()
    where id = ${sessionId}
    returning revision`;
  return updated.revision;
}

export async function sessionExerciseIds(tx: Transaction, sessionId: string): Promise<string[]> {
  const rows = await tx`select distinct exercise_id from public.sets where session_id = ${sessionId}`;
  return rows.map((row) => row.exercise_id);
}

export async function tombstoneSession(tx: Transaction, userId: string, key: SessionKey): Promise<void> {
  await tx`
    insert into public.deleted_sessions (id, user_id, started_at)
    values (${key.id}, ${userId}, ${key.startedAt})`;
  await tx`delete from public.sessions where id = ${key.id} and user_id = ${userId}`;
}

export async function markSessionsDerivedAt(tx: Transaction, userId: string, version: number): Promise<void> {
  await tx`
    update public.sessions set derived_balance_version = ${version}
    where user_id = ${userId} and not history_only and derived_balance_version <> ${version}`;
}

export async function insertSession(
  tx: Transaction,
  row: NewSessionRow,
  setRows: readonly Record<string, unknown>[],
): Promise<InsertedSession> {
  const programPosition = row.programLink === null ? null : tx.json(row.programLink.position as JsonValue);
  const [inserted] = await tx`
    insert into public.sessions
      (id, user_id, program_day_id, enrollment_id, program_position, started_at, ended_at, local_date, timezone,
       history_only, balance_version, derived_balance_version, summary, notes, session_rpe, gear_loadout)
    values
      (${row.id}, ${row.userId}, ${row.programDayId}, ${row.programLink?.enrollmentId ?? null}, ${programPosition},
       ${row.startedAt}, ${row.endedAt}, (${row.startedAt}::timestamptz at time zone ${row.timezone})::date,
       ${row.timezone}, ${row.historyOnly}, ${row.balanceVersion}, ${row.balanceVersion},
       ${tx.json(row.summary as unknown as JsonValue)}, ${row.notes}, ${row.sessionRpe},
       ${tx.json(row.gearLoadout as JsonValue)})
    returning summary, completed_at`;
  await tx`insert into public.sets ${tx(setRows)}`;
  return { summary: inserted.summary, completedAt: isoTimestamp(inserted.completed_at) };
}

export async function storedSummary(tx: Transaction, sessionId: string): Promise<SessionSummary> {
  const [row] = await tx`select summary from public.sessions where id = ${sessionId}`;
  return row.summary;
}

export interface SummaryPatch {
  id: string;
  patch: Pick<SessionSummary, 'xpBySkill' | 'levelUps' | 'prs'> & { gearBonusBySkill: Record<string, number> };
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
