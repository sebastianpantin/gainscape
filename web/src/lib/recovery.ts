import { failFastWhenOffline } from '../offline/cache-first.ts';
import { queryRecentSets, RECOVERY_LOOKBACK_DAYS, type RecentSet } from './recovery-rules.ts';
import { supabase } from './supabase.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export async function fetchRecentSets(now: number): Promise<RecentSet[]> {
  failFastWhenOffline();
  return queryRecentSets(supabase, new Date(now - RECOVERY_LOOKBACK_DAYS * DAY_MS));
}
