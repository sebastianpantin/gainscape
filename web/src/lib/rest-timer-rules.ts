import { SECONDS_PER_MINUTE } from '@domain/cardio.ts';
import type { EffortInput } from '@domain/types.ts';

const MS_PER_SECOND = 1000;

export const DEFAULT_REST_S = 90;
export const REST_STEP_S = 15;
const LONGEST_REST_S = 600;
export const REST_OVER_SHOWN_S = 300;
export const REST_OFF = 0;
export const REST_CHOICES_S: readonly number[] = [REST_OFF, 60, 90, 120, 180];

export interface RestTimer {
  endsAt: number;
}

export interface RestState {
  restS: number;
  timer: RestTimer | null;
}

type RestView = { kind: 'idle' } | { kind: 'resting'; remainingS: number } | { kind: 'over' };

export function startRest(now: number, restS: number): RestTimer {
  return { endsAt: now + restS * MS_PER_SECOND };
}

export function adjustRest(timer: RestTimer, deltaS: number, now: number): RestTimer {
  const endsAt = Math.max(timer.endsAt, now) + deltaS * MS_PER_SECOND;
  return { endsAt: Math.min(now + LONGEST_REST_S * MS_PER_SECOND, Math.max(now, endsAt)) };
}

export function restView(timer: RestTimer | null, now: number): RestView {
  if (timer === null) return { kind: 'idle' };
  const remainingMs = timer.endsAt - now;
  if (remainingMs > LONGEST_REST_S * MS_PER_SECOND) return { kind: 'idle' };
  if (remainingMs > 0) return { kind: 'resting', remainingS: Math.ceil(remainingMs / MS_PER_SECOND) };
  return -remainingMs < REST_OVER_SHOWN_S * MS_PER_SECOND ? { kind: 'over' } : { kind: 'idle' };
}

export function restClock(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return `${minutes}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}`;
}

export function finishesSet(
  set: { done: boolean; effort: EffortInput },
  changes: { done?: boolean; effort?: EffortInput },
): boolean {
  const becameDone = !set.done && changes.done === true;
  const firstRated = set.effort === null && changes.effort !== undefined && changes.effort !== null;
  return becameDone || firstRated;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsedTimer(value: unknown): RestTimer | null {
  return isRecord(value) && typeof value.endsAt === 'number' && Number.isFinite(value.endsAt)
    ? { endsAt: value.endsAt }
    : null;
}

export function parseRestState(raw: string | null): RestState {
  let parsed: unknown = null;
  try {
    parsed = raw === null ? null : JSON.parse(raw);
  } catch {
    parsed = null;
  }
  if (!isRecord(parsed)) return { restS: DEFAULT_REST_S, timer: null };
  const restS = REST_CHOICES_S.find((choice) => choice === parsed.restS) ?? DEFAULT_REST_S;
  return { restS, timer: parsedTimer(parsed.timer) };
}
