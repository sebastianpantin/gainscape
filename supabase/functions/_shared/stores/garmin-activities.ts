import { isoTimestamp, type Transaction } from '../db.ts';
import type { GarminExercisePick, GarminSeenOutcome } from '../domain/index.ts';

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

export async function rememberGarminExercisePicks(
  tx: Transaction,
  userId: string,
  picksOldestFirst: readonly GarminExercisePick[],
): Promise<void> {
  const exerciseByCategory = new Map(picksOldestFirst.map((pick) => [pick.category, pick.exerciseId]));
  if (exerciseByCategory.size === 0) return;
  const rows = Array.from(exerciseByCategory, ([category, exerciseId]) => ({
    user_id: userId,
    category,
    exercise_id: exerciseId,
  }));
  await tx`
    insert into public.garmin_exercise_picks ${tx(rows)}
    on conflict (user_id, category) do update set exercise_id = excluded.exercise_id, picked_at = now()`;
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
