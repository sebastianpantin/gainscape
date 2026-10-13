import type { CardioInterval, EffortInput, EffortInputType, RirSource, SessionSummary } from '@domain/types.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { type InvokeOutcome, retryDelayMs } from './function-client-rules.ts';
import type { OverviewSet } from './history-overview-rules.ts';
import { nullableNumber } from './rows.ts';

export const HISTORY_PAGE_SIZE = 50;

const SESSION_COLUMNS =
  'id,started_at,ended_at,session_rpe,local_date,history_only,revision,program_day_id,notes,summary';
const SESSION_PAGE_COLUMNS = `${SESSION_COLUMNS},sets(position,is_warmup,effective_load_kg,reps,exercises(name))`;
const SESSION_DETAIL_COLUMNS = `${SESSION_COLUMNS},sets(count)`;
const SET_COLUMNS =
  'id,exercise_id,position,weight_kg,effective_load_kg,reps,is_warmup,effort_input_type,effort_value,rir,rir_source,rir_flagged,e1rm_before_kg,effective_reps,xp_awarded,duration_s,distance_m,interval_work_s,interval_rest_s,interval_rounds,counted_work_s,pace_flagged';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SessionDetail {
  id: string;
  startedAt: string;
  endedAt: string;
  sessionRpe: number | null;
  localDate: string;
  historyOnly: boolean;
  revision: number;
  programDayId: string | null;
  notes: string | null;
  summary: SessionSummary;
  setCount: number;
}

export interface HistorySession extends SessionDetail {
  overviewSets: OverviewSet[];
}

export interface StoredSetRow {
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number | null;
  effectiveLoadKg: number | null;
  reps: number | null;
  isWarmup: boolean;
  effortInputType: EffortInputType | null;
  effortValue: number | null;
  rir: number | null;
  rirSource: RirSource;
  rirFlagged: boolean;
  e1rmBeforeKg: number | null;
  effectiveReps: number;
  xpAwarded: number;
  durationS: number | null;
  distanceM: number | null;
  intervalWorkS: number | null;
  intervalRestS: number | null;
  intervalRounds: number | null;
  countedWorkS: number | null;
  paceFlagged: boolean;
}

export interface LiftSetPayload {
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  effort: EffortInput;
}

export interface CardioSetPayload {
  kind: 'cardio';
  id: string;
  exerciseId: string;
  position: number;
  durationS?: number;
  distanceM: number | null;
  interval: CardioInterval | null;
  effort: EffortInput;
}

export interface HoldSetPayload {
  kind: 'hold';
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number;
  durationS: number | null;
  distanceM: number | null;
  effort: EffortInput;
}

export interface EditSessionPayload {
  sessionId: string;
  ifRevision: number;
  notes: string | null;
  sets: (LiftSetPayload | CardioSetPayload | HoldSetPayload)[];
}

const sessionColumnsSchema = z.object({
  id: z.string(),
  started_at: z.string(),
  ended_at: z.string(),
  session_rpe: z.number().nullable(),
  local_date: z.string(),
  history_only: z.boolean(),
  revision: z.number(),
  program_day_id: z.string().nullable(),
  notes: z.string().nullable(),
  summary: z.custom<SessionSummary>((value) => typeof value === 'object' && value !== null),
});

const sessionPageRowSchema = sessionColumnsSchema.extend({
  sets: z.array(
    z.object({
      position: z.number(),
      is_warmup: z.boolean(),
      effective_load_kg: z.union([z.number(), z.string()]).nullable(),
      reps: z.number().nullable(),
      exercises: z.object({ name: z.string() }).nullable(),
    }),
  ),
});

const sessionDetailRowSchema = sessionColumnsSchema.extend({
  sets: z.tuple([z.object({ count: z.number() })]),
});

interface SetRow {
  id: string;
  exercise_id: string;
  position: number;
  weight_kg: number | string | null;
  effective_load_kg: number | string | null;
  reps: number | null;
  is_warmup: boolean;
  effort_input_type: EffortInputType | null;
  effort_value: number | string | null;
  rir: number | string | null;
  rir_source: RirSource;
  rir_flagged: boolean;
  e1rm_before_kg: number | string | null;
  effective_reps: number;
  xp_awarded: number;
  duration_s: number | null;
  distance_m: number | string | null;
  interval_work_s: number | null;
  interval_rest_s: number | null;
  interval_rounds: number | null;
  counted_work_s: number | null;
  pace_flagged: boolean;
}

export function withoutHistorySession<Pages extends { pages: { id: string }[][] }>(
  loaded: Pages | undefined,
  sessionId: string,
): Pages | undefined {
  return loaded && { ...loaded, pages: loaded.pages.map((page) => page.filter((session) => session.id !== sessionId)) };
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function nextPageFilter(last: Pick<HistorySession, 'startedAt' | 'id'>): string {
  return `started_at.lt."${last.startedAt}",and(started_at.eq."${last.startedAt}",id.lt.${last.id})`;
}

function toSessionDetail(row: z.infer<typeof sessionColumnsSchema>, setCount: number): SessionDetail {
  return {
    id: row.id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    sessionRpe: row.session_rpe,
    localDate: row.local_date,
    historyOnly: row.history_only,
    revision: row.revision,
    programDayId: row.program_day_id,
    notes: row.notes,
    summary: row.summary,
    setCount,
  };
}

export function parseSessionPageRows(data: unknown): HistorySession[] {
  return z
    .array(sessionPageRowSchema)
    .parse(data)
    .map((row) => ({
      ...toSessionDetail(row, row.sets.length),
      overviewSets: row.sets.map((set) => ({
        exerciseName: set.exercises?.name ?? 'Exercise',
        position: set.position,
        effectiveLoadKg: nullableNumber(set.effective_load_kg),
        reps: set.reps,
        isWarmup: set.is_warmup,
      })),
    }));
}

export function parseSessionDetailRow(data: unknown): SessionDetail {
  const row = sessionDetailRowSchema.parse(data);
  return toSessionDetail(row, row.sets[0].count);
}

function toStoredSet(row: SetRow): StoredSetRow {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    position: row.position,
    weightKg: nullableNumber(row.weight_kg),
    effectiveLoadKg: nullableNumber(row.effective_load_kg),
    reps: row.reps,
    isWarmup: row.is_warmup,
    effortInputType: row.effort_input_type,
    effortValue: nullableNumber(row.effort_value),
    rir: nullableNumber(row.rir),
    rirSource: row.rir_source,
    rirFlagged: row.rir_flagged,
    e1rmBeforeKg: nullableNumber(row.e1rm_before_kg),
    effectiveReps: row.effective_reps,
    xpAwarded: row.xp_awarded,
    durationS: row.duration_s,
    distanceM: nullableNumber(row.distance_m),
    intervalWorkS: row.interval_work_s,
    intervalRestS: row.interval_rest_s,
    intervalRounds: row.interval_rounds,
    countedWorkS: row.counted_work_s,
    paceFlagged: row.pace_flagged,
  };
}

export async function querySessionPage(
  client: SupabaseClient,
  after: Pick<HistorySession, 'startedAt' | 'id'> | null,
): Promise<HistorySession[]> {
  let query = client
    .from('sessions')
    .select(SESSION_PAGE_COLUMNS)
    .order('started_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(HISTORY_PAGE_SIZE);
  if (after) query = query.or(nextPageFilter(after));
  const { data, error } = await query;
  if (error) throw error;
  return parseSessionPageRows(data);
}

export async function querySession(client: SupabaseClient, sessionId: string): Promise<SessionDetail | null> {
  const { data, error } = await client
    .from('sessions')
    .select(SESSION_DETAIL_COLUMNS)
    .eq('id', sessionId)
    .maybeSingle();
  if (error) throw error;
  return data ? parseSessionDetailRow(data) : null;
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

const AUTOMATIC_RETRIES = 4;

export interface RetriedInvoke<T> {
  invoke: () => Promise<InvokeOutcome<T>>;
  pause: (ms: number, signal: AbortSignal) => Promise<void>;
  signal: AbortSignal;
  onRetry: (reason: string) => void;
}

export async function invokeWithRetries<T>({
  invoke,
  pause,
  signal,
  onRetry,
}: RetriedInvoke<T>): Promise<InvokeOutcome<T>> {
  let outcome = await invoke();
  for (let attempt = 0; attempt < AUTOMATIC_RETRIES && !signal.aborted; attempt++) {
    const reason = transientReason(outcome);
    if (reason === null) break;
    onRetry(reason);
    await pause(retryDelayMs(attempt), signal);
    if (signal.aborted) break;
    outcome = await invoke();
  }
  return outcome;
}
