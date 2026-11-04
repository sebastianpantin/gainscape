import { type StoredSetColumnRow, type StoredSetColumns, storedSetColumnsOf } from '@domain/set-codec.ts';
import {
  type CardioInterval,
  EFFORT_INPUT_TYPES,
  type EffortInput,
  type RirSource,
  type SessionSummary,
} from '@domain/types.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { type InvokeOutcome, retryDelayMs } from '../platform/function-client-rules.ts';
import type { OverviewSet } from './history-overview-rules.ts';
import { columnsOf, nullableNumber, numericColumn, parsedRows } from '../rows.ts';
import { RIR_SOURCES } from '../progress/recovery-rules.ts';

export const HISTORY_PAGE_SIZE = 50;

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

export interface StoredSetRow extends StoredSetColumns {
  rir: number | null;
  rirSource: RirSource;
  rirFlagged: boolean;
  e1rmBeforeKg: number | null;
  effectiveReps: number;
  xpAwarded: number;
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

const overviewExerciseRowSchema = z.object({ name: z.string() });

const overviewSetRowSchema = z.object({
  position: z.number(),
  is_warmup: z.boolean(),
  effective_load_kg: numericColumn.nullable(),
  reps: z.number().nullable(),
  exercises: overviewExerciseRowSchema.nullable(),
});

const sessionPageRowSchema = sessionColumnsSchema.extend({ sets: z.array(overviewSetRowSchema) });

const SESSION_PAGE_COLUMNS = columnsOf(sessionPageRowSchema, {
  sets: columnsOf(overviewSetRowSchema, { exercises: columnsOf(overviewExerciseRowSchema) }),
});

const setCountRowSchema = z.object({ count: z.number() });

const sessionDetailRowSchema = sessionColumnsSchema.extend({ sets: z.tuple([setCountRowSchema]) });

const SESSION_DETAIL_COLUMNS = columnsOf(sessionDetailRowSchema, { sets: columnsOf(setCountRowSchema) });

const storedSetColumnsSchema = z.object({
  id: z.string(),
  exercise_id: z.string(),
  position: z.number(),
  weight_kg: numericColumn.nullable(),
  effective_load_kg: numericColumn.nullable(),
  reps: z.number().nullable(),
  is_warmup: z.boolean(),
  effort_input_type: z.enum(EFFORT_INPUT_TYPES).nullable(),
  effort_value: numericColumn.nullable(),
  duration_s: z.number().nullable(),
  distance_m: numericColumn.nullable(),
  interval_work_s: z.number().nullable(),
  interval_rest_s: z.number().nullable(),
  interval_rounds: z.number().nullable(),
  counted_work_s: z.number().nullable(),
}) satisfies z.ZodType<StoredSetColumnRow>;

const setRowSchema = storedSetColumnsSchema.extend({
  rir: numericColumn.nullable(),
  rir_source: z.enum(RIR_SOURCES),
  rir_flagged: z.boolean(),
  e1rm_before_kg: numericColumn.nullable(),
  effective_reps: z.number(),
  xp_awarded: z.number(),
  pace_flagged: z.boolean(),
});

const SET_COLUMNS = columnsOf(setRowSchema);

type SetRow = z.infer<typeof setRowSchema>;

export function withoutHistorySession<Pages extends { pages: { id: string }[][] }>(
  loaded: Pages | undefined,
  sessionId: string,
): Pages | undefined {
  return loaded && { ...loaded, pages: loaded.pages.map((page) => page.filter((session) => session.id !== sessionId)) };
}

interface NamedProgram {
  name: string;
  days: readonly { id: string; name: string }[];
}

export function programDayLabel(programs: readonly NamedProgram[], programDayId: string | null): string | null {
  if (programDayId === null) return null;
  for (const program of programs) {
    const day = program.days.find(({ id }) => id === programDayId);
    if (day) return `${program.name} — ${day.name}`;
  }
  return null;
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
    ...storedSetColumnsOf(row),
    rir: nullableNumber(row.rir),
    rirSource: row.rir_source,
    rirFlagged: row.rir_flagged,
    e1rmBeforeKg: nullableNumber(row.e1rm_before_kg),
    effectiveReps: row.effective_reps,
    xpAwarded: row.xp_awarded,
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
    .limit(HISTORY_PAGE_SIZE)
    .retry(false);
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
  return parsedRows(setRowSchema, data).map(toStoredSet);
}

export function transientReason(outcome: InvokeOutcome<unknown>): string | null {
  if (outcome.kind === 'retryable') return outcome.reason;
  if (outcome.kind !== 'http_error') return null;
  return outcome.status >= 500 || outcome.code === 'id_conflict' ? outcome.code : null;
}

const AUTOMATIC_RETRIES = 4;

interface RetriedInvoke<T> {
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
