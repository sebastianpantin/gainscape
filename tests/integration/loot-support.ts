import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import { db, type FunctionResponse, postCompleteSession, type TestUser } from './local-stack.ts';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const TIMEZONE = 'Europe/Stockholm';

export type Effort = { type: 'level'; level: 'hard' | 'easy' | 'near_failure' } | { type: 'rir'; value: number } | null;

export interface SetShape {
  id: string;
  exerciseId: string;
  position: number;
  weightKg: number;
  reps: number;
  isWarmup: boolean;
  effort: Effort;
}

export const hard: Effort = { type: 'level', level: 'hard' };
export const easy: Effort = { type: 'level', level: 'easy' };

export function aSet(
  exerciseId: string,
  position: number,
  weightKg: number,
  overrides: Partial<SetShape> = {},
): SetShape {
  return { id: randomUUID(), exerciseId, position, weightKg, reps: 5, isWarmup: false, effort: hard, ...overrides };
}

export function payloadAt(startedAt: Date, sets: SetShape[]) {
  return {
    id: randomUUID(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + 30 * 60 * 1000).toISOString(),
    notes: null,
    sets,
  };
}

export type SessionPayload = ReturnType<typeof payloadAt>;

export function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * HOUR_MS);
}

export function withFreshIds<T extends { id: string; sets: { id: string }[] }>(session: T): T {
  return { ...session, id: randomUUID(), sets: session.sets.map((set) => ({ ...set, id: randomUUID() })) };
}

export function localDateOf(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function startsOnOneLocalDay(count: number): Date[] {
  for (let hoursAgo = 2; ; hoursAgo += 1) {
    const starts = Array.from(
      { length: count },
      (_, index) => new Date(Date.now() - (hoursAgo + count - 1 - index) * HOUR_MS),
    );
    if (new Set(starts.map(localDateOf)).size === 1) return starts;
  }
}

export async function postSession(
  user: TestUser,
  payload: { id: string; sets: { id: string }[] },
): Promise<FunctionResponse> {
  const response = await postCompleteSession(user.accessToken, payload);
  expect(response.status, response.rawBody).toBe(200);
  return response;
}

export async function rollsOf(userId: string) {
  return await db`
    select session_id, set_id, kind, local_date::text, roll_index, drop_table_id, chance::float, hit, loot_version
    from public.loot_rolls where user_id = ${userId} order by local_date, kind, roll_index`;
}
