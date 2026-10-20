import { chance, DEFAULT_LOOT } from '@domain/index.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { formatCount } from '../format.ts';
import { parsedRows } from '../rows.ts';

const REGULAR_DROP_TABLE_KEY = 'regular';

const DROP_LUCK_COLUMNS = 'dry_rolls, drop_tables!inner(key)';

const dropLuckRowSchema = z.object({ dry_rolls: z.number() });

type DropLuckRow = z.infer<typeof dropLuckRowSchema>;

export function dryRollsOf(rows: readonly DropLuckRow[]): number {
  return rows[0]?.dry_rolls ?? 0;
}

export async function queryDryRolls(client: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await client
    .from('drop_luck')
    .select(DROP_LUCK_COLUMNS)
    .eq('user_id', userId)
    .eq('drop_tables.key', REGULAR_DROP_TABLE_KEY);
  if (error) throw error;
  return dryRollsOf(parsedRows(dropLuckRowSchema, data));
}

interface LuckView {
  chanceText: string;
  chancePercentText: string;
  meterFraction: number;
  dryRollsText: string;
  explanation: string;
}

function percentText(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function luckView(dryRolls: number): LuckView {
  const { baseChance, maxChance } = DEFAULT_LOOT;
  const nextChance = chance(dryRolls, DEFAULT_LOOT);
  return {
    chanceText: `Next drop chance ${percentText(nextChance)}`,
    chancePercentText: percentText(nextChance),
    meterFraction: (nextChance - baseChance) / (maxChance - baseChance),
    dryRollsText: `${formatCount(dryRolls, 'loot roll')} without a drop`,
    explanation: `Each loot roll that misses raises the chance, up to ${percentText(maxChance)}.`,
  };
}
