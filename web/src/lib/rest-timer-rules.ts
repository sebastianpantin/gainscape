import { SECONDS_PER_MINUTE } from '@domain/cardio.ts';
import { type EffortInput, isRecord } from '@domain/types.ts';
import { parsedJson } from './json-rules.ts';

const MS_PER_SECOND = 1000;

export const DEFAULT_REST_S = 90;
export const REST_STEP_S = 15;
const LONGEST_REST_S = 600;
export const REST_OVER_SHOWN_S = 300;
export const REST_OFF = 0;
export const REST_CHOICES_S: readonly number[] = [REST_OFF, 60, 90, 120, 180];
export const COMPOUND_REST_S = 180;

export interface RestTimer {
  endsAt: number;
  setId: string | null;
  exerciseId: string | null;
  startedAt: number | null;
}

export type RestByExercise = Readonly<Record<string, number>>;

export interface RestState {
  restS: number;
  timer: RestTimer | null;
  byExercise: RestByExercise;
}

type RestView = { kind: 'idle' } | { kind: 'resting'; remainingS: number } | { kind: 'over'; overS: number };

export function startRest(now: number, restS: number, setId: string, exerciseId: string | null = null): RestTimer {
  return { endsAt: now + restS * MS_PER_SECOND, setId, exerciseId, startedAt: now };
}

export function adjustRest(timer: RestTimer, deltaS: number, now: number): RestTimer {
  const endsAt = Math.max(timer.endsAt, now) + deltaS * MS_PER_SECOND;
  const startedAt = timer.endsAt > now ? timer.startedAt : null;
  return { ...timer, startedAt, endsAt: Math.min(now + LONGEST_REST_S * MS_PER_SECOND, Math.max(now, endsAt)) };
}

export function withChosenRest(state: RestState, restS: number): RestState {
  return { ...state, restS, byExercise: {} };
}

export function restLengthFor(state: RestState, exerciseId: string, compound: boolean): number {
  if (state.restS === REST_OFF) return REST_OFF;
  return state.byExercise[exerciseId] ?? (compound ? Math.max(state.restS, COMPOUND_REST_S) : state.restS);
}

function isRememberableRest(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value / REST_STEP_S) &&
    value >= REST_STEP_S &&
    value <= LONGEST_REST_S
  );
}

export function rememberAdjustedRest(state: RestState, timer: RestTimer): RestState {
  if (timer.exerciseId === null || timer.startedAt === null) return state;
  const plannedS = Math.round((timer.endsAt - timer.startedAt) / MS_PER_SECOND / REST_STEP_S) * REST_STEP_S;
  const restS = Math.min(LONGEST_REST_S, Math.max(REST_STEP_S, plannedS));
  return { ...state, byExercise: { ...state.byExercise, [timer.exerciseId]: restS } };
}

export function restView(timer: RestTimer | null, now: number): RestView {
  if (timer === null) return { kind: 'idle' };
  const remainingMs = timer.endsAt - now;
  if (remainingMs > LONGEST_REST_S * MS_PER_SECOND) return { kind: 'idle' };
  if (remainingMs > 0) return { kind: 'resting', remainingS: Math.ceil(remainingMs / MS_PER_SECOND) };
  const overMs = now - timer.endsAt;
  if (overMs >= REST_OVER_SHOWN_S * MS_PER_SECOND) return { kind: 'idle' };
  return { kind: 'over', overS: Math.floor(overMs / MS_PER_SECOND) };
}

export function restLeftFraction(timer: RestTimer | null, now: number): number | null {
  if (timer?.startedAt == null || timer.endsAt <= timer.startedAt) return null;
  const leftMs = Math.max(0, timer.endsAt - now);
  return Math.min(1, leftMs / (timer.endsAt - timer.startedAt));
}

export function restClock(seconds: number): string {
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return `${minutes}:${String(seconds % SECONDS_PER_MINUTE).padStart(2, '0')}`;
}

export function startsRest(
  set: { id: string; done: boolean; effort: EffortInput; isWarmup?: boolean },
  changes: { done?: boolean; effort?: EffortInput },
  timer: RestTimer | null,
): boolean {
  if (set.isWarmup === true) return false;
  const becameDone = !set.done && changes.done === true;
  const firstRated = set.effort === null && changes.effort !== undefined && changes.effort !== null;
  return becameDone || (firstRated && timer?.setId !== set.id);
}

export function stopsRestForWarmup(
  set: { id: string; isWarmup: boolean },
  changes: { isWarmup?: boolean },
  timer: RestTimer | null,
): boolean {
  return !set.isWarmup && changes.isWarmup === true && timer?.setId === set.id;
}

function parsedTimer(value: unknown): RestTimer | null {
  if (!isRecord(value) || typeof value.endsAt !== 'number' || !Number.isFinite(value.endsAt)) return null;
  return {
    endsAt: value.endsAt,
    setId: typeof value.setId === 'string' ? value.setId : null,
    exerciseId: typeof value.exerciseId === 'string' ? value.exerciseId : null,
    startedAt: typeof value.startedAt === 'number' && Number.isFinite(value.startedAt) ? value.startedAt : null,
  };
}

function parsedByExercise(value: unknown): RestByExercise {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([exerciseId, restS]) => (isRememberableRest(restS) ? [[exerciseId, restS]] : [])),
  );
}

export function parseRestState(raw: string | null): RestState {
  const parsed = parsedJson(raw);
  if (!isRecord(parsed)) return { restS: DEFAULT_REST_S, timer: null, byExercise: {} };
  const restS = REST_CHOICES_S.find((choice) => choice === parsed.restS) ?? DEFAULT_REST_S;
  return { restS, timer: parsedTimer(parsed.timer), byExercise: parsedByExercise(parsed.byExercise) };
}
