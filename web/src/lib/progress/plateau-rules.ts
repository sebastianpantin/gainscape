import { MS_PER_DAY } from '@domain/math.ts';
import { roundLoad } from '@domain/index.ts';
import { measuresRepsCapacity } from '@domain/types.ts';
import type { LoadType } from '../exercises/catalog-rules.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { shownWeight } from '../units.ts';
import { DELOAD_FRACTION, progressionStep } from '../workout/progression-rules.ts';

export const STALL_SESSIONS = 4;
export const STALL_DAYS = 21;
export const STALE_DAYS = 28;
export const IMPROVEMENT_RATIO = 1.005;

const LOW_REPS = 5;

export interface PlateauSession {
  startedAt: string;
  value: number | null;
  programDriven: boolean;
}

interface Plateau {
  sinceStartedAt: string;
  sessionsSince: number;
}

interface PlateauAdviceInput {
  loadType: LoadType;
  unit: UnitPref;
  recentTopSetKg: number;
  typicalReps: number;
}

function lastImprovementIndex(sessions: readonly PlateauSession[]): number | null {
  let improvedAt: number | null = null;
  let reference = 0;
  for (const [index, { value }] of sessions.entries()) {
    if (value === null || (improvedAt !== null && value <= reference * IMPROVEMENT_RATIO)) continue;
    improvedAt = index;
    reference = value;
  }
  return improvedAt;
}

export function plateauOf(sessions: readonly PlateauSession[], now: number): Plateau | null {
  const ordered = [...sessions].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  const latest = ordered.at(-1);
  if (latest === undefined || latest.programDriven) return null;
  const latestAt = Date.parse(latest.startedAt);
  if (now - latestAt > STALE_DAYS * MS_PER_DAY) return null;
  const improvedAt = lastImprovementIndex(ordered);
  if (improvedAt === null) return null;
  const since = ordered[improvedAt];
  const sessionsSince = ordered.length - 1 - improvedAt;
  if (sessionsSince < STALL_SESSIONS || latestAt - Date.parse(since.startedAt) < STALL_DAYS * MS_PER_DAY) return null;
  return { sinceStartedAt: since.startedAt, sessionsSince };
}

interface PlateauTopSet {
  startedAt: string;
  topSetKg: number;
  topSetReps: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export function plateauAdviceBasis(
  sessions: readonly PlateauTopSet[],
  plateau: Plateau,
): Pick<PlateauAdviceInput, 'recentTopSetKg' | 'typicalReps'> {
  const sinceGain = sessions.filter(({ startedAt }) => Date.parse(startedAt) > Date.parse(plateau.sinceStartedAt));
  return {
    recentTopSetKg: Math.max(...sinceGain.map(({ topSetKg }) => topSetKg)),
    typicalReps: median(sinceGain.map(({ topSetReps }) => topSetReps)),
  };
}

const REPS_DELOAD = 'Deload: cut about 10% of your reps for a week, then build back up.';

function deloadAdvice({ loadType, unit, recentTopSetKg }: PlateauAdviceInput): string {
  if (measuresRepsCapacity(loadType)) return REPS_DELOAD;
  const shown = shownWeight(recentTopSetKg, unit);
  const step = progressionStep(unit, null);
  const lighter = Math.min(shown - step, roundLoad(shown * DELOAD_FRACTION, step, 'nearest'));
  if (lighter <= 0) return REPS_DELOAD;
  return `Deload: drop to about ${loadType === 'bodyweight_plus' ? '+' : ''}${roundLoad(lighter, step, 'nearest')} ${unit} for a week, then build back up.`;
}

export function plateauAdvice(input: PlateauAdviceInput): string[] {
  const repRange = input.typicalReps <= LOW_REPS ? '8 to 10' : '4 to 6';
  return [
    deloadAdvice(input),
    `Change the rep range: try sets of ${repRange} for a few weeks.`,
    'Swap in a close variation for a few weeks.',
  ];
}
