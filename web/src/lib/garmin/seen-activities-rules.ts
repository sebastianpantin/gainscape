import type { GarminSeenOutcome } from '@domain/index.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { columnsOf, parsedRows } from '../rows.ts';

const seenGarminActivityRowSchema = z.object({
  started_at: z.string(),
  outcome: z.enum(['imported', 'deleted', 'rejected']),
});

const SEEN_GARMIN_ACTIVITY_COLUMNS = columnsOf(seenGarminActivityRowSchema);

export interface SeenGarminActivity {
  startedAt: string;
  outcome: GarminSeenOutcome;
}

export async function querySeenGarminActivities(
  client: SupabaseClient,
  firstStartedAt: string,
  lastStartedAt: string,
): Promise<SeenGarminActivity[]> {
  const seen = await client
    .from('garmin_activities')
    .select(SEEN_GARMIN_ACTIVITY_COLUMNS)
    .gte('started_at', firstStartedAt)
    .lte('started_at', lastStartedAt)
    .order('started_at');
  if (seen.error) throw seen.error;
  return parsedRows(seenGarminActivityRowSchema, seen.data).map((row) => ({
    startedAt: new Date(row.started_at).toISOString(),
    outcome: row.outcome,
  }));
}
