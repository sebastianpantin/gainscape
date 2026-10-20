import { isRecord, type PersonalRecordSummary } from '@domain/types.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Exercise } from '../exercises/catalog-rules.ts';
import { formatSessionDate } from '../format.ts';
import type { UnitPref } from '../profile/profile-rules.ts';
import { parsedRows } from '../rows.ts';
import { monthKey, monthTitle } from '../ui/date-bucket-rules.ts';
import { describeRecord } from '../workout/record-text-rules.ts';

export const RECORD_TIMELINE_PAGE_WORKOUTS = 20;

export const RECENT_RECORDS_SHOWN = 5;

export const NO_RECORDS_TEXT = 'No records yet. Beat one of your bests and it shows up here.';

const personalRecordSchema = z.custom<PersonalRecordSummary>(
  (value) => isRecord(value) && typeof value.kind === 'string' && typeof value.exerciseId === 'string',
);

const recordTimelineRowSchema = z.object({
  session_id: z.string(),
  started_at: z.string(),
  local_date: z.string(),
  record: personalRecordSchema,
});

export type RecordTimelineRow = z.infer<typeof recordTimelineRowSchema>;

export const recordTimelineRowsSchema = z.array(recordTimelineRowSchema);

export interface RecordTimelineCursor {
  startedAt: string;
  sessionId: string;
}

export interface RecordTimelineEntry {
  key: string;
  sessionId: string;
  dateText: string;
  text: string;
}

export interface RecordTimelineMonth {
  month: string;
  title: string;
  records: RecordTimelineEntry[];
}

function timelineEntries(
  rows: readonly RecordTimelineRow[],
  exercisesById: ReadonlyMap<string, Exercise>,
  unit: UnitPref,
): RecordTimelineEntry[] {
  const seenPerSession = new Map<string, number>();
  return rows.map((row) => {
    const position = seenPerSession.get(row.session_id) ?? 0;
    seenPerSession.set(row.session_id, position + 1);
    const { headline, previous } = describeRecord(row.record, exercisesById.get(row.record.exerciseId), unit);
    return {
      key: `${row.session_id}:${position}`,
      sessionId: row.session_id,
      dateText: formatSessionDate(row.local_date),
      text: `${headline} ${previous}`,
    };
  });
}

export function recentRecords(
  rows: readonly RecordTimelineRow[],
  exercisesById: ReadonlyMap<string, Exercise>,
  unit: UnitPref,
  count: number,
): RecordTimelineEntry[] {
  return timelineEntries(rows.slice(0, count), exercisesById, unit);
}

export function recordTimelineMonths(
  rows: readonly RecordTimelineRow[],
  exercisesById: ReadonlyMap<string, Exercise>,
  unit: UnitPref,
): RecordTimelineMonth[] {
  const entries = timelineEntries(rows, exercisesById, unit);
  const months: RecordTimelineMonth[] = [];
  rows.forEach((row, index) => {
    const month = monthKey(row.local_date);
    const last = months.at(-1);
    if (last?.month === month) last.records.push(entries[index]!);
    else months.push({ month, title: monthTitle(month), records: [entries[index]!] });
  });
  return months;
}

export function nextRecordTimelineCursor(
  page: readonly RecordTimelineRow[],
  pageWorkouts: number,
): RecordTimelineCursor | undefined {
  const last = page.at(-1);
  if (!last || new Set(page.map((row) => row.session_id)).size < pageWorkouts) return undefined;
  return { startedAt: last.started_at, sessionId: last.session_id };
}

interface NextPageState {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
}

export function showMoreRecordsButton({
  hasNextPage,
  isFetchingNextPage,
}: NextPageState): { label: string; canFetch: boolean } | null {
  if (!hasNextPage) return null;
  return isFetchingNextPage ? { label: 'Loading more…', canFetch: false } : { label: 'Show more', canFetch: true };
}

export async function queryRecordTimeline(
  client: SupabaseClient,
  before: RecordTimelineCursor | null,
  signal: AbortSignal,
): Promise<RecordTimelineRow[]> {
  const { data, error } = await client
    .rpc('personal_record_timeline', {
      before_at: before?.startedAt ?? null,
      before_id: before?.sessionId ?? null,
      page_size: RECORD_TIMELINE_PAGE_WORKOUTS,
    })
    .abortSignal(signal);
  if (error) throw error;
  return parsedRows(recordTimelineRowSchema, data);
}
