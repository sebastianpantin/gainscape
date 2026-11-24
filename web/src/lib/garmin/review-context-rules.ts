import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { columnsOf, parsedRows } from '../rows.ts';
import type { ReviewContext, ReviewSession } from './import-review-rules.ts';
import { querySeenGarminActivities } from './seen-activities-rules.ts';

const garminActivityTypeRowSchema = z.object({ key: z.string(), exercise_id: z.string() });

const GARMIN_ACTIVITY_TYPE_COLUMNS = columnsOf(garminActivityTypeRowSchema);

const reviewSessionRowSchema = z.object({
  id: z.string(),
  started_at: z.string(),
  ended_at: z.string(),
  sets: z.array(z.object({ exercise_id: z.string() })),
});

const REVIEW_SESSION_COLUMNS = columnsOf(reviewSessionRowSchema, { sets: 'exercise_id' });

const lastImportRowSchema = z.object({ created_at: z.string() });

const LAST_IMPORT_COLUMNS = columnsOf(lastImportRowSchema);

export interface ReviewRange {
  from: string;
  to: string;
}

async function queryExerciseIdByGarminType(client: SupabaseClient): Promise<Map<string, string>> {
  const types = await client.from('garmin_activity_types').select(GARMIN_ACTIVITY_TYPE_COLUMNS);
  if (types.error) throw types.error;
  return new Map(parsedRows(garminActivityTypeRowSchema, types.data).map((row) => [row.key, row.exercise_id]));
}

async function querySessionsWithin(client: SupabaseClient, range: ReviewRange): Promise<ReviewSession[]> {
  const sessions = await client
    .from('sessions')
    .select(REVIEW_SESSION_COLUMNS)
    .lte('started_at', range.to)
    .gte('ended_at', range.from)
    .order('started_at');
  if (sessions.error) throw sessions.error;
  return parsedRows(reviewSessionRowSchema, sessions.data).map((row) => ({
    id: row.id,
    startedAt: new Date(row.started_at).toISOString(),
    endedAt: new Date(row.ended_at).toISOString(),
    exerciseIds: [...new Set(row.sets.map((set) => set.exercise_id))],
  }));
}

export async function queryReviewContext(client: SupabaseClient, range: ReviewRange | null): Promise<ReviewContext> {
  const [exerciseIdByGarminType, seen, sessions] = await Promise.all([
    queryExerciseIdByGarminType(client),
    range === null ? [] : querySeenGarminActivities(client, range.from, range.to),
    range === null ? [] : querySessionsWithin(client, range),
  ]);
  return { exerciseIdByGarminType, seen, sessions };
}

export async function queryLastImportAt(client: SupabaseClient): Promise<string | null> {
  const latest = await client
    .from('garmin_activities')
    .select(LAST_IMPORT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(1);
  if (latest.error) throw latest.error;
  const [row] = parsedRows(lastImportRowSchema, latest.data);
  return row === undefined ? null : new Date(row.created_at).toISOString();
}
