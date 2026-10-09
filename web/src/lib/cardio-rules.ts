import {
  boutDurationSeconds,
  CARDIO_BOUNDS,
  intervalDurationSeconds,
  METRES_PER_KM,
  SECONDS_PER_MINUTE,
} from '@domain/cardio.ts';
import { roundTo } from '@domain/math.ts';
import {
  CARDIO_EFFORT_LEVELS,
  CARDIO_RECORD_KINDS,
  type CardioInterval,
  type CardioRecordGain,
  type CardioRecordKind,
  type EffortInput,
} from '@domain/types.ts';
import type { CardioExercise } from './catalog-rules.ts';
import type { UnitPref } from './profile-rules.ts';
import type { BoutValues } from '../offline/draft-format.ts';
import { type DistanceUnit, distanceUnitFor, formatDistance, formatPace, unitToDistanceM } from './units.ts';

export type BoutMode = 'steady' | 'intervals';

export const DEFAULT_INTERVAL: CardioInterval = Object.freeze({ workS: 30, restS: 30, rounds: 10 });

export function boutModeChanges(bout: Pick<BoutValues, 'durationS' | 'interval'>, mode: BoutMode): Partial<BoutValues> {
  if ((bout.interval !== null) === (mode === 'intervals')) return {};
  if (mode === 'intervals') return { interval: DEFAULT_INTERVAL };
  return { interval: null, durationS: clampedSteadyDurationS(boutDurationSeconds(bout)) };
}
const SECONDS_PER_HOUR = 3600;
const STORED_DISTANCE_DECIMALS = 1;

function clamped(value: number, bounds: { min: number; max: number }): number {
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)));
}

export function clampedSteadyDurationS(durationS: number): number {
  return clamped(durationS, CARDIO_BOUNDS.steadyDurationS);
}

export function clampedInterval(interval: CardioInterval): CardioInterval {
  const workS = clamped(interval.workS, CARDIO_BOUNDS.intervalWorkS);
  const restS = clamped(interval.restS, CARDIO_BOUNDS.intervalRestS);
  const roundsThatFit = Math.floor((CARDIO_BOUNDS.intervalDurationS.max + restS) / (workS + restS));
  const rounds = Math.min(clamped(interval.rounds, CARDIO_BOUNDS.intervalRounds), roundsThatFit);
  return { workS, restS, rounds };
}

export function clampedDistanceM(distanceM: number | null): number | null {
  if (distanceM === null) return null;
  const { min, max } = CARDIO_BOUNDS.distanceM;
  return Math.min(max, Math.max(min, roundTo(STORED_DISTANCE_DECIMALS, distanceM)));
}

function isWithin(value: number, bounds: { min: number; max: number }): boolean {
  return Number.isInteger(value) && value >= bounds.min && value <= bounds.max;
}

function isCardioEffort(effort: EffortInput): boolean {
  return effort === null || (effort.type === 'cardio' && CARDIO_EFFORT_LEVELS.includes(effort.level));
}

function isLoggableDistance(distanceM: number | null): boolean {
  const { min, max } = CARDIO_BOUNDS.distanceM;
  return distanceM === null || (Number.isFinite(distanceM) && distanceM >= min && distanceM <= max);
}

function isLoggableInterval(interval: CardioInterval): boolean {
  return (
    isWithin(interval.workS, CARDIO_BOUNDS.intervalWorkS) &&
    isWithin(interval.restS, CARDIO_BOUNDS.intervalRestS) &&
    isWithin(interval.rounds, CARDIO_BOUNDS.intervalRounds) &&
    isWithin(intervalDurationSeconds(interval), CARDIO_BOUNDS.intervalDurationS)
  );
}

export function isLoggableBout(bout: BoutValues): boolean {
  const timing =
    bout.interval === null
      ? isWithin(bout.durationS, CARDIO_BOUNDS.steadyDurationS)
      : isLoggableInterval(bout.interval);
  return timing && isLoggableDistance(bout.distanceM) && isCardioEffort(bout.effort);
}

export function distanceFromInput(value: number | null, unit: DistanceUnit): number | null {
  if (value === null || value <= 0) return null;
  return clampedDistanceM(unitToDistanceM(value, unit));
}

export function canAddBout(bouts: readonly Pick<BoutValues, 'durationS' | 'interval'>[]): boolean {
  const totalS = bouts.reduce((sum, bout) => sum + boutDurationSeconds(bout), 0);
  return totalS < CARDIO_BOUNDS.steadyDurationS.max;
}

export function formatDuration(durationS: number): string {
  const hours = Math.floor(durationS / SECONDS_PER_HOUR);
  const minutes = Math.floor((durationS % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const seconds = Math.round(durationS % SECONDS_PER_MINUTE);
  const parts = [hours > 0 && `${hours} h`, minutes > 0 && `${minutes} min`, seconds > 0 && `${seconds} s`];
  return parts.filter(Boolean).join(' ') || '0 s';
}

export function describeBout(bout: BoutValues, unit: DistanceUnit): string {
  const distance = bout.distanceM === null ? [] : [formatDistance(bout.distanceM, unit)];
  if (bout.interval !== null) {
    const { rounds, workS, restS } = bout.interval;
    const rest = restS === 0 ? '' : ` / ${formatDuration(restS)} rest`;
    return [`${rounds} × ${formatDuration(workS)}${rest}`, ...distance].join(' · ');
  }
  const pace = bout.distanceM === null ? [] : [formatPace(bout.durationS, bout.distanceM, unit)];
  return [formatDuration(bout.durationS), ...distance, ...pace].join(' · ');
}

const RECORD_LABELS: Record<CardioRecordKind, string> = { distance: 'Distance', pace: 'Pace', duration: 'Duration' };

export function formatCardioRecord(kind: CardioRecordKind, value: number, unit: DistanceUnit): string {
  if (kind === 'distance') return formatDistance(value, unit);
  if (kind === 'pace') return formatPace(value, METRES_PER_KM, unit);
  return formatDuration(value);
}

export function describeCardioGains(gains: readonly CardioRecordGain[], unit: DistanceUnit): string {
  return gains
    .map((gain) => {
      const beaten = gain.previous === null ? 'first' : `was ${formatCardioRecord(gain.kind, gain.previous, unit)}`;
      return `${formatCardioRecord(gain.kind, gain.value, unit)} (${beaten})`;
    })
    .join(' · ');
}

export interface CardioRecordRow {
  exerciseId: string;
  kind: CardioRecordKind;
  value: number;
}

export interface CardioRecordCard {
  exerciseId: string;
  name: string;
  lines: string[];
}

export function cardioRecordCards(
  rows: readonly CardioRecordRow[],
  exercises: readonly Pick<CardioExercise, 'id' | 'name' | 'activity'>[],
  unitPref: UnitPref,
): CardioRecordCard[] {
  return exercises
    .flatMap((exercise): CardioRecordCard[] => {
      const unit = distanceUnitFor(unitPref, exercise.activity.paceUnit);
      const lines = CARDIO_RECORD_KINDS.flatMap((kind) => {
        const row = rows.find((candidate) => candidate.exerciseId === exercise.id && candidate.kind === kind);
        return row ? [`${RECORD_LABELS[kind]} ${formatCardioRecord(kind, row.value, unit)}`] : [];
      });
      return lines.length === 0 ? [] : [{ exerciseId: exercise.id, name: exercise.name, lines }];
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}
