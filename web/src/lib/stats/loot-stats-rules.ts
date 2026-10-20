import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { formatCount, formatXp } from '../format.ts';
import { numericColumn, parsedRow } from '../rows.ts';

export const lootStatsRowSchema = z.object({
  workouts_with_rolls: z.number(),
  rolls: z.number(),
  drops: z.number(),
  expected_drops: numericColumn,
  longest_dry_streak: z.number(),
  current_dry_streak: z.number(),
});

export type LootStatsRow = z.infer<typeof lootStatsRowSchema>;

export const NO_LOOT_ROLLS_TEXT = 'No loot rolls yet. Finish a workout to roll for loot.';

interface LootStatsEntry {
  label: string;
  value: string;
}

interface LootStatsView {
  entries: LootStatsEntry[];
  luckText: string | null;
}

function luckText(drops: number, expectedDrops: number): string {
  const difference = Number((drops - expectedDrops).toFixed(1));
  if (difference === 0) return 'Right on the odds.';
  const luck = difference > 0 ? 'Luckier' : 'Unluckier';
  return `${luck} than expected by ${Math.abs(difference).toFixed(1)} drops.`;
}

function perWorkoutEntry(row: LootStatsRow, expectedDrops: number): LootStatsEntry {
  const perWorkout = (count: number) => (count / row.workouts_with_rolls).toFixed(2);
  return { label: 'Drops per workout', value: `${perWorkout(row.drops)}, expected ${perWorkout(expectedDrops)}` };
}

export function lootStatsView(row: LootStatsRow): LootStatsView | null {
  if (row.rolls === 0 && row.longest_dry_streak === 0 && row.current_dry_streak === 0) return null;
  const expectedDrops = Number(row.expected_drops);
  const hasWorkouts = row.workouts_with_rolls > 0;
  return {
    entries: [
      { label: 'Loot rolls', value: `${formatXp(row.rolls)} in ${formatCount(row.workouts_with_rolls, 'workout')}` },
      { label: 'Drops', value: `${formatXp(row.drops)}, expected ${expectedDrops.toFixed(1)}` },
      ...(hasWorkouts ? [perWorkoutEntry(row, expectedDrops)] : []),
      { label: 'Longest dry streak', value: formatCount(row.longest_dry_streak, 'loot roll') },
      { label: 'Current dry streak', value: formatCount(row.current_dry_streak, 'loot roll') },
    ],
    luckText: hasWorkouts ? luckText(row.drops, expectedDrops) : null,
  };
}

export async function queryLootStats(client: SupabaseClient, signal: AbortSignal): Promise<LootStatsRow> {
  const { data, error } = await client.rpc('loot_stats').abortSignal(signal);
  if (error) throw error;
  return parsedRow(lootStatsRowSchema, data);
}
