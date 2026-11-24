import { expect } from 'vitest';
import { db, postFunction, type TestUser } from './local-stack.ts';

export interface ActivityOutcome {
  startedAt: string;
  outcome: 'imported' | 'history_only' | 'skipped';
  sessionId?: string;
  xp?: number;
  reason?: string;
}

export function wholeSecondAgo(ms: number): string {
  return new Date(Math.floor((Date.now() - ms) / 1000) * 1000).toISOString();
}

export async function importAs(user: TestUser, activities: unknown[]) {
  return await postFunction('import-activities', user.accessToken, { activities });
}

export async function imported(user: TestUser, activities: unknown[]): Promise<ActivityOutcome[]> {
  const response = await importAs(user, activities);
  expect(response.status, response.rawBody).toBe(200);
  return (response.body as unknown as { activities: ActivityOutcome[] }).activities;
}

export async function seenBy(userId: string) {
  const rows = await db`
    select started_at, outcome::text, session_id, garmin_type
    from public.garmin_activities where user_id = ${userId} order by started_at`;
  return rows.map((row) => ({
    startedAt: new Date(row.started_at).toISOString(),
    outcome: row.outcome as string,
    sessionId: row.session_id as string | null,
    garminType: row.garmin_type as string | null,
  }));
}

export async function sessionsOf(userId: string) {
  return await db`
    select id, started_at, ended_at, history_only, notes, session_rpe, summary
    from public.sessions where user_id = ${userId} order by started_at`;
}

export async function totalXp(userId: string): Promise<number> {
  const [row] = await db`select coalesce(sum(xp), 0)::int as xp from public.user_skills where user_id = ${userId}`;
  return row.xp;
}
