import { MAX_SESSION_DURATION_MS } from '@domain/session-timing.ts';

export const SESSION_RPE_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const MINUTE_MS = 60_000;

export interface RememberedTiming {
  startedAt?: string;
  endedAt?: string;
  sessionRpe?: number | null;
}

const SESSION_RPE_ANCHORS: Readonly<Record<number, string>> = { 1: 'very easy', 10: 'max effort' };

export function sessionRpeChoiceLabel(value: number): string {
  const anchor = SESSION_RPE_ANCHORS[value];
  return anchor ? `${value} (${anchor})` : String(value);
}

export function isSessionRpe(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 10;
}

export function sessionRpeFromChoice(choice: string): number | null {
  const value = Number(choice);
  return isSessionRpe(value) ? value : null;
}

function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 1) return '<1 min';
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function formatSessionDuration(startedAt: string, endedAt: string): string | null {
  const durationMs = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(durationMs) || durationMs < 0) return null;
  return formatMinutes(Math.round(durationMs / MINUTE_MS));
}

export function sessionTimingParts({ startedAt, endedAt, sessionRpe }: RememberedTiming): string[] {
  const duration = startedAt && endedAt ? formatSessionDuration(startedAt, endedAt) : null;
  const rpe = isSessionRpe(sessionRpe) ? `Session RPE ${sessionRpe}` : null;
  return [duration, rpe].filter((part) => part !== null);
}

export function finishedAtFor(startedAt: string, now: Date): string {
  const started = Date.parse(startedAt);
  return new Date(Math.min(Math.max(now.getTime(), started), started + MAX_SESSION_DURATION_MS)).toISOString();
}
