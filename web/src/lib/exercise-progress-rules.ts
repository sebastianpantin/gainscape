import { DEFAULT_BALANCE } from '@domain/balance.ts';
import { roundTo } from '@domain/math.ts';
import { epley } from '@domain/strength.ts';
import { measuresRepsCapacity, REP_MAX_SLOT_COUNT, type RirSource } from '@domain/types.ts';
import type { LoadType } from './catalog-rules.ts';
import type { ChartSeries } from './line-chart-rules.ts';
import type { UnitPref } from './profile-rules.ts';
import { shownWeight } from './units.ts';

export const PROGRESS_COLUMNS = {
  sets: 'session_id, weight_kg, effective_load_kg, reps, is_warmup, rir, rir_source, sessions(started_at)',
  repMaxes: 'reps, load_kg, achieved_at, sets!rep_maxes_set_id_fkey(sessions(local_date))',
  maxReps: 'max_reps, achieved_at, sets(sessions(local_date))',
} as const;

export function exerciseProgressPath(exerciseId: string): string {
  return `/collection/exercises/${exerciseId}`;
}

export interface ProgressSetRow {
  session_id: string;
  weight_kg: number | string;
  effective_load_kg: number | string;
  reps: number;
  is_warmup: boolean;
  rir: number | string | null;
  rir_source: RirSource;
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
  const repsToFailure = row.reps + (row.rir_source === 'logged' ? Number(row.rir) : 0);
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
    if (row.is_warmup) continue;
    const weightKg = Number(row.weight_kg);
    const e1rmKg = setE1rmKg(row, loadType);
    const seen = bySession.get(row.session_id);
    bySession.set(row.session_id, {
      sessionId: row.session_id,
      startedAt: row.sessions.started_at,
      e1rmKg: higher(seen?.e1rmKg ?? null, e1rmKg),
      topSetKg: Math.max(seen?.topSetKg ?? weightKg, weightKg),
      mostReps: Math.max(seen?.mostReps ?? row.reps, row.reps),
    });
  }
  return [...bySession.values()];
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

export function chartDateText(time: number): string {
  return new Date(time).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function recordDate(ref: RecordSessionRef, achievedAt: string): string {
  return ref?.sessions?.local_date ?? achievedAt.slice(0, 10);
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
