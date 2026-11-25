import { type GarminImportOutcome, garminImportChunks } from '@domain/index.ts';
import { failFastWhenOffline } from '../../offline/cache-first.ts';
import { REQUEST_TIMEOUT_MS } from '../platform/auth-restore.ts';
import { invokeAsOwner } from '../platform/function-client.ts';
import { supabase } from '../platform/supabase.ts';
import { type ActivityToImport, importProblemText, type ReviewContext } from './import-review-rules.ts';
import { queryLastImportAt, queryReviewContext, type ReviewRange } from './review-context-rules.ts';

const IMPORT_TIMEOUT_MS = 4 * REQUEST_TIMEOUT_MS;

export function fetchReviewContext(range: ReviewRange | null): Promise<ReviewContext> {
  failFastWhenOffline();
  return queryReviewContext(supabase, range);
}

export function fetchLastImportAt(): Promise<string | null> {
  failFastWhenOffline();
  return queryLastImportAt(supabase);
}

function sentActivity(activity: ActivityToImport) {
  const { startedAt, garminType, durationS } = activity;
  if ('sets' in activity) return { startedAt, garminType, durationS, sets: activity.sets, picks: activity.picks };
  const { exerciseId, distanceM, interval } = activity;
  return { startedAt, garminType, exerciseId, durationS, distanceM, interval };
}

export interface ImportRun {
  outcomes: GarminImportOutcome[];
  problem: string | null;
}

export async function importActivities(userId: string, activities: readonly ActivityToImport[]): Promise<ImportRun> {
  const outcomes: GarminImportOutcome[] = [];
  for (const chunk of garminImportChunks(activities)) {
    const body = { activities: chunk.map(sentActivity) };
    const answer = await invokeAsOwner<{ activities: GarminImportOutcome[] }>(
      userId,
      'import-activities',
      body,
      IMPORT_TIMEOUT_MS,
    );
    if (answer.kind !== 'ok') return { outcomes, problem: importProblemText(answer) };
    outcomes.push(...answer.data.activities);
  }
  return { outcomes, problem: null };
}
