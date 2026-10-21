import { randomUUID } from 'node:crypto';
import { expect } from 'vitest';
import type { CardioSetInput } from '@domain/index.ts';
import {
  createTestUser,
  db,
  type FunctionResponse,
  ledgerMismatches,
  postCompleteSession,
  postFunction,
  type TestUser,
} from './local-stack.ts';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;
export const TIMEZONE = 'Europe/Stockholm';

export type Effort =
  { type: 'level'; level: 'easy' | 'moderate' | 'hard' | 'near_failure' } | { type: 'rir'; value: number } | null;

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
export const beyondEffortWindow: Effort = { type: 'rir', value: 6 };

export function aSet(
  exerciseId: string,
  position: number,
  weightKg: number,
  overrides: Partial<SetShape> = {},
): SetShape {
  return { id: randomUUID(), exerciseId, position, weightKg, reps: 5, isWarmup: false, effort: hard, ...overrides };
}

type CardioEffort = { type: 'cardio'; level: 'easy' | 'moderate' | 'hard' | 'max' } | null;

interface BoutInterval {
  workS: number;
  restS: number;
  rounds: number;
}

export interface BoutShape {
  kind: 'cardio';
  id: string;
  exerciseId: string;
  position: number;
  durationS?: number;
  distanceM: number | null;
  interval: BoutInterval | null;
  effort: CardioEffort;
}

export function aBout(exerciseId: string, position: number, overrides: Partial<BoutShape> = {}): BoutShape {
  return {
    kind: 'cardio',
    id: randomUUID(),
    exerciseId,
    position,
    durationS: 1800,
    distanceM: null,
    interval: null,
    effort: { type: 'cardio', level: 'moderate' },
    ...overrides,
  };
}

export function anIntervalBout(
  exerciseId: string,
  position: number,
  interval: BoutInterval,
  overrides: Partial<BoutShape> = {},
): BoutShape {
  return {
    kind: 'cardio',
    id: randomUUID(),
    exerciseId,
    position,
    distanceM: null,
    interval,
    effort: { type: 'cardio', level: 'hard' },
    ...overrides,
  };
}

export function asCardioSetInput(bout: BoutShape): CardioSetInput {
  const { interval } = bout;
  const durationS =
    interval === null ? bout.durationS! : interval.rounds * interval.workS + (interval.rounds - 1) * interval.restS;
  return { ...bout, durationS };
}

export function payloadAt<S extends SetShape | BoutShape>(startedAt: Date, sets: S[]) {
  return {
    id: randomUUID(),
    startedAt: startedAt.toISOString(),
    endedAt: new Date(startedAt.getTime() + 30 * 60 * 1000).toISOString(),
    notes: null,
    sets,
  };
}

export type SessionPayload = ReturnType<typeof payloadAt<SetShape>>;

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

export async function editSession(
  user: TestUser,
  session: { id: string },
  sets: (SetShape | BoutShape)[],
  ifRevision = 0,
): Promise<FunctionResponse> {
  const response = await postFunction('edit-session', user.accessToken, {
    sessionId: session.id,
    ifRevision,
    notes: null,
    sets,
  });
  expect(response.status, response.rawBody).toBe(200);
  return response;
}

export async function rollsOf(userId: string) {
  return await db`
    select session_id, set_id, kind, local_date::text, roll_index, drop_table_id, chance::float, hit, loot_version
    from public.loot_rolls where user_id = ${userId} order by local_date, kind, roll_index`;
}

export async function expectLedgerMatchesItems(userId: string): Promise<void> {
  expect(await ledgerMismatches(userId), userId).toEqual([]);
}

export function trackedUsers(check: (userId: string) => Promise<void>) {
  const unchecked: string[] = [];
  return {
    async freshUser(): Promise<TestUser> {
      const user = await createTestUser(TIMEZONE);
      unchecked.push(user.id);
      return user;
    },
    async checkAndClear(): Promise<void> {
      for (const userId of unchecked.splice(0)) await check(userId);
    },
  };
}

export async function createCustomExercise(
  user: TestUser,
  { skillKey = 'chest', archived = false }: { skillKey?: string; archived?: boolean } = {},
): Promise<string> {
  const exerciseId = randomUUID();
  const [skill] = await db`select id from public.skills where key = ${skillKey}`;
  const saved = await user.client.rpc('save_custom_exercise', {
    exercise: {
      id: exerciseId,
      name: `Custom ${exerciseId.slice(0, 8)}`,
      loadType: 'external',
      equipment: 'other',
      shares: [{ skillId: skill.id, shareBp: 10000 }],
    },
  });
  expect(saved.error).toBeNull();
  if (archived) {
    const archive = await user.client.rpc('set_custom_exercise_archived', { exercise_id: exerciseId, archived: true });
    expect(archive.error).toBeNull();
  }
  return exerciseId;
}
