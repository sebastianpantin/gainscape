import type { Transaction } from '../db.ts';

export type GarminActivityOutcome = 'imported' | 'deleted' | 'rejected';

export async function seenGarminActivityOutcome(
  tx: Transaction,
  userId: string,
  startedAt: string,
): Promise<GarminActivityOutcome | null> {
  const [row] = await tx`
    select outcome from public.garmin_activities where user_id = ${userId} and started_at = ${startedAt}`;
  return row?.outcome ?? null;
}

export async function rememberImportedGarminActivity(
  tx: Transaction,
  userId: string,
  activity: { startedAt: string; garminType: string | null; sessionId: string },
): Promise<void> {
  await tx`
    insert into public.garmin_activities (user_id, started_at, outcome, session_id, garmin_type)
    values (${userId}, ${activity.startedAt}, 'imported', ${activity.sessionId}, ${activity.garminType})`;
}

export async function markGarminActivityOfSessionDeleted(
  tx: Transaction,
  userId: string,
  sessionId: string,
): Promise<void> {
  await tx`
    update public.garmin_activities set outcome = 'deleted', session_id = null
    where user_id = ${userId} and session_id = ${sessionId}`;
}
