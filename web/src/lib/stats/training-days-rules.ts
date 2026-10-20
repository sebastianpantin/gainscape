import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { sessionXp } from '../format.ts';
import { numericColumn, parsedRows } from '../rows.ts';
import { daysInMonth, shiftMonth } from '../ui/date-bucket-rules.ts';

export const trainingDayRowSchema = z.object({
  local_date: z.string(),
  history_only: z.boolean(),
  xp_by_skill: z.record(z.string(), z.number()),
  pr_count: z.number(),
  drop_count: z.number(),
  volume_kg: numericColumn,
});

export type TrainingDayRow = z.infer<typeof trainingDayRowSchema>;

export const trainingDayRowsSchema = z.array(trainingDayRowSchema);

export interface TrainingSession {
  localDate: string;
  xp: number;
  prCount: number;
  dropCount: number;
  volumeKg: number;
}

export function trainingDaysRange(month: string): { fromDay: string; toDay: string } {
  return {
    fromDay: `${shiftMonth(month, -1)}-01`,
    toDay: `${month}-${String(daysInMonth(month)).padStart(2, '0')}`,
  };
}

export function trainingSessionOf(row: TrainingDayRow): TrainingSession {
  return {
    localDate: row.local_date,
    xp: row.history_only ? 0 : sessionXp({ xpBySkill: row.xp_by_skill }),
    prCount: row.pr_count,
    dropCount: row.drop_count,
    volumeKg: Number(row.volume_kg),
  };
}

export async function queryTrainingDays(
  client: SupabaseClient,
  month: string,
  signal: AbortSignal,
): Promise<TrainingDayRow[]> {
  const { fromDay, toDay } = trainingDaysRange(month);
  const { data, error } = await client.rpc('training_days', { from_day: fromDay, to_day: toDay }).abortSignal(signal);
  if (error) throw error;
  return parsedRows(trainingDayRowSchema, data);
}
