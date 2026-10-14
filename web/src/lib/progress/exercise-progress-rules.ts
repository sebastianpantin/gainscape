import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_BALANCE } from '@domain/balance.ts';
import { roundTo } from '@domain/math.ts';
import { epley } from '@domain/strength.ts';
import { measuresRepsCapacity, REP_MAX_SLOT_COUNT, type RirSource } from '@domain/types.ts';
import type { LoadType } from '../exercises/catalog-rules.ts';
import type { ChartSeries } from '../ui/line-chart-rules.ts';
import type { PlateauSession } from './plateau-rules.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { shownWeight } from '../units.ts';

export const PROGRESS_COLUMNS = {
  sets: 'session_id, weight_kg, effective_load_kg, reps, rir, rir_source, prescription_ref, sessions(started_at)',
  repMaxes: 'reps, load_kg, achieved_at, sets!rep_maxes_set_id_fkey(sessions(local_date))',
  maxReps: 'max_reps, achieved_at, sets(sessions(local_date))',
} as const;

export const PROGRESS_PAGE_SIZE = 1000;

export async function queryProgressSets(
  client: SupabaseClient,
  userId: string,
  exerciseId: string,
  signal: AbortSignal,
): Promise<ProgressSetRow[]> {
  const rows: ProgressSetRow[] = [];
  for (let from = 0; ; from += PROGRESS_PAGE_SIZE) {
    const { data, error } = await client
      .from('sets')
      .select(PROGRESS_COLUMNS.sets)
      .eq('user_id', userId)
      .eq('exercise_id', exerciseId)
      .eq('is_warmup', false)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, from + PROGRESS_PAGE_SIZE - 1)
      .abortSignal(signal);
    if (error) throw error;
    const page = data as unknown as ProgressSetRow[];
    rows.push(...page);
    if (page.length < PROGRESS_PAGE_SIZE) return rows;
  }
}

export function exerciseProgressPath(exerciseId: string): string {
  return `/collection/exercises/${exerciseId}`;
}

export interface ProgressSetRow {
  session_id: string;
  weight_kg: number | string;
  effective_load_kg: number | string;
  reps: number;
  rir: number | string | null;
  rir_source: RirSource;
  prescription_ref: string | null;
  sessions: { started_at: string };
}

type RecordSessionRef = { sessions: { local_date: string } | null } | null;

export interface RepMaxRow {
  reps: number;
  load_kg: number | string;
  achieved_at: string;
  sets: RecordSessionRef;
}

export interface MaxRepsRow {
  max_reps: number;
  achieved_at: string;
  sets: RecordSessionRef;
}

export interface SessionProgress {
  sessionId: string;
  startedAt: string;
  e1rmKg: number | null;
  topSetKg: number;
  mostReps: number;
  programDriven: boolean;
}

export interface RepMaxEntry {
  reps: number;
  loadKg: number | null;
  localDate: string | null;
}

export interface MaxRepsRecord {
  reps: number;
  localDate: string;
}

function setE1rmKg(row: ProgressSetRow, loadType: LoadType): number | null {
  const effectiveLoadKg = Number(row.effective_load_kg);
  const trustedRir = row.rir_source === 'logged' ? Math.min(Number(row.rir), DEFAULT_BALANCE.maxRirForStrength) : 0;
  const repsToFailure = row.reps + trustedRir;
  if (effectiveLoadKg <= 0 || repsToFailure > DEFAULT_BALANCE.epleyMaxRepsToFailure) return null;
  const bodyweightKg = loadType === 'bodyweight_plus' ? effectiveLoadKg - Number(row.weight_kg) : 0;
  return roundTo(2, epley(effectiveLoadKg, repsToFailure) - bodyweightKg);
}

function higher(current: number | null, candidate: number | null): number | null {
  if (current === null) return candidate;
  return candidate === null ? current : Math.max(current, candidate);
}

export function sessionProgress(rows: readonly ProgressSetRow[], loadType: LoadType): SessionProgress[] {
  const bySession = new Map<string, SessionProgress>();
  const oldestFirst = [...rows].sort((a, b) => Date.parse(a.sessions.started_at) - Date.parse(b.sessions.started_at));
  for (const row of oldestFirst) {
    const weightKg = Number(row.weight_kg);
    const e1rmKg = setE1rmKg(row, loadType);
    const seen = bySession.get(row.session_id);
    bySession.set(row.session_id, {
      sessionId: row.session_id,
      startedAt: row.sessions.started_at,
      e1rmKg: higher(seen?.e1rmKg ?? null, e1rmKg),
      topSetKg: Math.max(seen?.topSetKg ?? weightKg, weightKg),
      mostReps: Math.max(seen?.mostReps ?? row.reps, row.reps),
      programDriven: (seen?.programDriven ?? false) || row.prescription_ref !== null,
    });
  }
  return [...bySession.values()];
}

export function plateauSessions(sessions: readonly SessionProgress[], loadType: LoadType): PlateauSession[] {
  return sessions.map(({ startedAt, e1rmKg, mostReps, programDriven }) => ({
    startedAt,
    value: measuresRepsCapacity(loadType) ? mostReps : e1rmKg,
    programDriven,
  }));
}

export function progressChartSeries(
  sessions: readonly SessionProgress[],
  loadType: LoadType,
  unit: UnitPref,
): ChartSeries[] {
  if (measuresRepsCapacity(loadType)) {
    return [
      {
        name: 'Most reps',
        points: sessions.map((session) => ({ x: Date.parse(session.startedAt), y: session.mostReps })),
      },
    ];
  }
  return [
    {
      name: 'e1RM',
      points: sessions.flatMap(({ startedAt, e1rmKg }) =>
        e1rmKg === null ? [] : [{ x: Date.parse(startedAt), y: shownWeight(e1rmKg, unit) }],
      ),
    },
    {
      name: 'Top set',
      points: sessions.map(({ startedAt, topSetKg }) => ({ x: Date.parse(startedAt), y: shownWeight(topSetKg, unit) })),
    },
  ];
}

export function progressValueText(value: number, loadType: LoadType, unit: UnitPref): string {
  if (measuresRepsCapacity(loadType)) return `${value}`;
  return `${loadType === 'bodyweight_plus' ? '+' : ''}${value} ${unit}`;
}

export function chartDateText(time: number): string {
  return new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function recordDate(ref: RecordSessionRef, achievedAt: string): string {
  return ref?.sessions?.local_date ?? new Date(achievedAt).toLocaleDateString('en-CA');
}

export function repMaxTable(rows: readonly RepMaxRow[]): RepMaxEntry[] {
  return Array.from({ length: REP_MAX_SLOT_COUNT }, (_, index) => {
    const reps = index + 1;
    const row = rows.find((candidate) => candidate.reps === reps);
    if (!row) return { reps, loadKg: null, localDate: null };
    return { reps, loadKg: Number(row.load_kg), localDate: recordDate(row.sets, row.achieved_at) };
  });
}

export function maxRepsRecord(rows: readonly MaxRepsRow[]): MaxRepsRecord | null {
  const [row] = rows;
  return row ? { reps: row.max_reps, localDate: recordDate(row.sets, row.achieved_at) } : null;
}
