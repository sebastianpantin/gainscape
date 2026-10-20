import { MS_PER_DAY } from '@domain/math.ts';
import { failFastWhenOffline } from '../../offline/cache-first.ts';
import { queryRecentSets, RECOVERY_LOOKBACK_DAYS, type RecentSet } from './recovery-rules.ts';
import { supabase } from '../platform/supabase.ts';

export async function fetchRecentSets(now: number): Promise<RecentSet[]> {
  failFastWhenOffline();
  return queryRecentSets(supabase, new Date(now - RECOVERY_LOOKBACK_DAYS * MS_PER_DAY));
}
