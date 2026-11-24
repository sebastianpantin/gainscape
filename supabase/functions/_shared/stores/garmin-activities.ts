import { isoTimestamp, type Transaction } from '../db.ts';
import type { GarminSeenOutcome } from '../domain/index.ts';

export async function seenGarminActivityOutcomes(
  tx: Transaction,
  userId: string,
  startedAts: readonly string[],
): Promise<Map<string, GarminSeenOutcome>> {
  const rows = await tx`
    select started_at, outcome from public.garmin_activities
    where user_id = ${userId} and started_at = any(${startedAts as string[]}::timestamptz[])`;
  return new Map(rows.map((row) => [isoTimestamp(row.started_at), row.outcome]));
}

interface ImportedGarminActivity {
  startedAt: string;
  garminType: string | null;
  sessionId: string;
}

export async function rememberImportedGarminActivities(
  tx: Transaction,
  userId: string,
  activities: readonly ImportedGarminActivity[],
): Promise<void> {
  if (activities.length === 0) return;
  const rows = activities.map((activity) => ({
    user_id: userId,
    started_at: activity.startedAt,
    outcome: 'imported',
    session_id: activity.sessionId,
    garmin_type: activity.garminType,
  }));
  await tx`insert into public.garmin_activities ${tx(rows)}`;
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
