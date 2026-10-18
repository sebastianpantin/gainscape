import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_BALANCE } from '@domain/balance.ts';
import { roundTo } from '@domain/math.ts';
import { epley } from '@domain/strength.ts';
import { measuresRepsCapacity, REP_MAX_SLOT_COUNT } from '@domain/types.ts';
import { z } from 'zod';
import type { LoadType } from '../exercises/catalog-rules.ts';
import type { ChartSeries } from '../ui/line-chart-rules.ts';
import type { PlateauSession } from './plateau-rules.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { shownWeight } from '../units.ts';
import { numericColumn, parsedRows } from '../rows.ts';
import { RIR_SOURCES } from './recovery-rules.ts';

export const PROGRESS_COLUMNS = {
  repMaxes: 'reps, load_kg, achieved_at, sets!rep_maxes_set_id_fkey(sessions(local_date))',
  maxReps: 'max_reps, achieved_at, sets(sessions(local_date))',
} as const;

export async function queryProgressSets(
  client: SupabaseClient,
  exerciseId: string,
  signal: AbortSignal,
): Promise<ProgressSetRow[]> {
  const { data, error } = await client.rpc('exercise_progress_sets', { exercise_id: exerciseId }).abortSignal(signal);
  if (error) throw error;
  return parsedRows(progressSetRowSchema, data);
}

export function exerciseProgressPath(exerciseId: string): string {
  return `/collection/exercises/${exerciseId}`;
}

export const progressSetRowSchema = z.object({
  session_id: z.string(),
  weight_kg: numericColumn,
  effective_load_kg: numericColumn,
  reps: z.number().nullable(),
  rir: numericColumn.nullable(),
  rir_source: z.enum(RIR_SOURCES),
  prescription_ref: z.string().nullable(),
  sessions: z.object({ started_at: z.string() }),
});

export type ProgressSetRow = z.infer<typeof progressSetRowSchema>;

const recordSessionRefSchema = z.object({ sessions: z.object({ local_date: z.string() }).nullable() }).nullable();

type RecordSessionRef = z.infer<typeof recordSessionRefSchema>;

export const repMaxRowSchema = z.object({
  reps: z.number(),
  load_kg: numericColumn,
  achieved_at: z.string(),
  sets: recordSessionRefSchema,
});

export type RepMaxRow = z.infer<typeof repMaxRowSchema>;

export const maxRepsRowSchema = z.object({
  max_reps: z.number(),
  achieved_at: z.string(),
  sets: recordSessionRefSchema,
});

export type MaxRepsRow = z.infer<typeof maxRepsRowSchema>;

export interface SessionProgress {
  sessionId: string;
  startedAt: string;
  e1rmKg: number | null;
  topSetKg: number;
  topSetReps: number;
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

export function liftE1rmKg(effectiveLoadKg: number, bodyweightKg: number, repsToFailure: number): number | null {
  if (effectiveLoadKg <= 0 || repsToFailure > DEFAULT_BALANCE.epleyMaxRepsToFailure) return null;
  return roundTo(2, epley(effectiveLoadKg, repsToFailure) - bodyweightKg);
}

function setE1rmKg(row: ProgressSetRow, loadType: LoadType): number | null {
  const effectiveLoadKg = Number(row.effective_load_kg);
  const trustedRir = row.rir_source === 'logged' ? Math.min(Number(row.rir), DEFAULT_BALANCE.maxRirForStrength) : 0;
  const bodyweightKg = loadType === 'bodyweight_plus' ? effectiveLoadKg - Number(row.weight_kg) : 0;
  return liftE1rmKg(effectiveLoadKg, bodyweightKg, (row.reps ?? 0) + trustedRir);
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
    const reps = row.reps ?? 0;
    const e1rmKg = setE1rmKg(row, loadType);
    const seen = bySession.get(row.session_id);
    const topSetKg = Math.max(seen?.topSetKg ?? weightKg, weightKg);
    const topSetReps = Math.max(
      seen !== undefined && seen.topSetKg === topSetKg ? seen.topSetReps : 0,
      weightKg === topSetKg ? reps : 0,
    );
    bySession.set(row.session_id, {
      sessionId: row.session_id,
      startedAt: row.sessions.started_at,
      e1rmKg: higher(seen?.e1rmKg ?? null, e1rmKg),
      topSetKg,
      topSetReps,
      mostReps: Math.max(seen?.mostReps ?? reps, reps),
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
