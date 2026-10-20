import { type CacheFirstLoad, failFastWhenOffline } from '../../offline/cache-first.ts';
import { loadStatCacheFirst } from '../../offline/stats-cache.ts';
import { deviceStorage } from '../platform/keyed-store.ts';
import { supabase } from '../platform/supabase.ts';
import {
  queryRecordTimeline,
  type RecordTimelineCursor,
  type RecordTimelineRow,
  recordTimelineRowsSchema,
} from './pr-timeline-rules.ts';

export async function loadRecordTimelinePage(
  userId: string,
  before: RecordTimelineCursor | null,
  signal: AbortSignal,
): Promise<CacheFirstLoad<RecordTimelineRow[]>> {
  if (before === null) {
    return loadStatCacheFirst(deviceStorage(), userId, 'record-timeline', recordTimelineRowsSchema, () =>
      queryRecordTimeline(supabase, null, signal),
    );
  }
  failFastWhenOffline();
  return { loaded: await queryRecordTimeline(supabase, before, signal), fromCache: false };
}
