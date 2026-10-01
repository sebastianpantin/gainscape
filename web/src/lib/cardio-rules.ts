import { CARDIO_BOUNDS, intervalDurationSeconds } from '@domain/cardio.ts';
import { CARDIO_EFFORT_LEVELS, type CardioInterval, type EffortInput } from '@domain/types.ts';
import type { BoutValues } from '../offline/draft-format.ts';
import { type DistanceUnit, formatDistance, formatPace, unitToDistanceM } from './units.ts';

const SECONDS_PER_MINUTE = 60;

export type BoutMode = 'steady' | 'intervals';

export const DEFAULT_INTERVAL: CardioInterval = Object.freeze({ workS: 30, restS: 30, rounds: 10 });

export function boutModeChanges(bout: Pick<BoutValues, 'durationS' | 'interval'>, mode: BoutMode): Partial<BoutValues> {
  if ((bout.interval !== null) === (mode === 'intervals')) return {};
  if (mode === 'intervals') return { interval: DEFAULT_INTERVAL };
  return { interval: null, durationS: clampedSteadyDurationS(boutDurationS(bout)) };
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
  const factor = 10 ** STORED_DISTANCE_DECIMALS;
  return Math.min(max, Math.max(min, Math.round(distanceM * factor) / factor));
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

export function boutDurationS(bout: Pick<BoutValues, 'durationS' | 'interval'>): number {
  return bout.interval === null ? bout.durationS : intervalDurationSeconds(bout.interval);
}

export function canAddBout(bouts: readonly Pick<BoutValues, 'durationS' | 'interval'>[]): boolean {
  const totalS = bouts.reduce((sum, bout) => sum + boutDurationS(bout), 0);
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
