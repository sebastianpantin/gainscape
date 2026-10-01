import type { EffortInput, EffortInputType, RirSource, SessionSummary } from '@domain/types.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { InvokeOutcome } from './function-client.ts';

export const HISTORY_PAGE_SIZE = 50;

const SESSION_COLUMNS =
  'id,started_at,ended_at,local_date,history_only,revision,program_day_id,notes,summary,sets(count)';
const SET_COLUMNS =
  'id,exercise_id,position,weight_kg,effective_load_kg,reps,is_warmup,effort_input_type,effort_value,rir,rir_source,rir_flagged,e1rm_before_kg,effective_reps,xp_awarded';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface HistorySession {
  id: string;
  startedAt: string;
  endedAt: string;
  localDate: string;
  historyOnly: boolean;
  revision: number;
  programDayId: string | null;
  notes: string | null;
  summary: SessionSummary;
  setCount: number;
}

export interface StoredSetRow {
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number;
  effectiveLoadKg: number;
  reps: number;
  isWarmup: boolean;
  effortInputType: EffortInputType | null;
  effortValue: number | null;
  rir: number;
  rirSource: RirSource;
  rirFlagged: boolean;
  e1rmBeforeKg: number | null;
  effectiveReps: number;
  xpAwarded: number;
}

export interface EditSessionPayload {
  sessionId: string;
  ifRevision: number;
  notes: string | null;
  sets: {
    id: string;
    exerciseId: string;
    position: number;
    weightKg: number;
    reps: number;
    isWarmup: boolean;
    effort: EffortInput;
  }[];
}

interface SessionRow {
  id: string;
  started_at: string;
  ended_at: string;
  local_date: string;
  history_only: boolean;
  revision: number;
  program_day_id: string | null;
  notes: string | null;
  summary: SessionSummary;
  sets: { count: number }[];
}

interface SetRow {
  id: string;
  exercise_id: string;
  position: number;
  weight_kg: number | string;
  effective_load_kg: number | string;
  reps: number;
  is_warmup: boolean;
  effort_input_type: EffortInputType | null;
  effort_value: number | string | null;
  rir: number | string;
  rir_source: RirSource;
  rir_flagged: boolean;
  e1rm_before_kg: number | string | null;
  effective_reps: number;
  xp_awarded: number;
}

export function isSessionId(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function nextPageFilter(last: Pick<HistorySession, 'startedAt' | 'id'>): string {
  return `started_at.lt."${last.startedAt}",and(started_at.eq."${last.startedAt}",id.lt.${last.id})`;
}

function toHistorySession(row: SessionRow): HistorySession {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    localDate: row.local_date,
    historyOnly: row.history_only,
    revision: row.revision,
    programDayId: row.program_day_id,
    notes: row.notes,
    summary: row.summary,
    setCount: row.sets[0]?.count ?? 0,
  };
}

function nullableNumber(value: number | string | null): number | null {
  return value === null ? null : Number(value);
}

function toStoredSet(row: SetRow): StoredSetRow {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    position: row.position,
    weightKg: Number(row.weight_kg),
    effectiveLoadKg: Number(row.effective_load_kg),
    reps: row.reps,
    isWarmup: row.is_warmup,
    effortInputType: row.effort_input_type,
    effortValue: nullableNumber(row.effort_value),
    rir: Number(row.rir),
    rirSource: row.rir_source,
    rirFlagged: row.rir_flagged,
    e1rmBeforeKg: nullableNumber(row.e1rm_before_kg),
    effectiveReps: row.effective_reps,
    xpAwarded: row.xp_awarded,
  };
}

export async function querySessionPage(
  client: SupabaseClient,
  after: Pick<HistorySession, 'startedAt' | 'id'> | null,
): Promise<HistorySession[]> {
  let query = client
    .from('sessions')
    .select(SESSION_COLUMNS)
    .order('started_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(HISTORY_PAGE_SIZE);
  if (after) query = query.or(nextPageFilter(after));
  const { data, error } = await query;
  if (error) throw error;
  return (data as SessionRow[]).map(toHistorySession);
}

export async function querySession(client: SupabaseClient, sessionId: string): Promise<HistorySession | null> {
  const { data, error } = await client.from('sessions').select(SESSION_COLUMNS).eq('id', sessionId).maybeSingle();
  if (error) throw error;
  return data ? toHistorySession(data as SessionRow) : null;
}

export async function querySessionSets(client: SupabaseClient, sessionId: string): Promise<StoredSetRow[]> {
  const { data, error } = await client.from('sets').select(SET_COLUMNS).eq('session_id', sessionId).order('position');
  if (error) throw error;
  return (data as SetRow[]).map(toStoredSet);
}

export function transientReason(outcome: InvokeOutcome<unknown>): string | null {
  if (outcome.kind === 'retryable') return outcome.reason;
  if (outcome.kind !== 'http_error') return null;
  return outcome.status >= 500 || outcome.code === 'id_conflict' ? outcome.code : null;
}
