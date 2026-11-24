import { sql, type Transaction } from '../_shared/db.ts';
import {
  GARMIN_IMPORT_CHUNK,
  type GarminImportOutcome,
  type GarminSeenOutcome,
  type GarminSkipReason,
  implausibleTiming,
  isWithinEditWindow,
} from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { rateLimitAllows } from '../_shared/rate-limit.ts';
import { serveAuthenticated } from '../_shared/serve-authenticated.ts';
import { rememberImportedGarminActivities, seenGarminActivityOutcomes } from '../_shared/stores/garmin-activities.ts';
import { storeNewSession } from '../_shared/stores/new-session.ts';
import { lockUser } from '../_shared/stores/sessions.ts';
import { type ConfirmedActivity, type ImportActivitiesPayload, parseImportActivitiesPayload } from './payload.ts';

interface ImportActivitiesResponse {
  activities: GarminImportOutcome[];
}

const SKIP_REASON_OF_SEEN: Record<GarminSeenOutcome, GarminSkipReason> = {
  imported: 'already_imported',
  deleted: 'deleted',
  rejected: 'rejected',
};

interface ImportRun {
  userId: string;
  now: Date;
  seen: Map<string, GarminSeenOutcome>;
  capReached: boolean;
  lastCompletedAt: string | null;
}

async function importActivity(
  tx: Transaction,
  run: ImportRun,
  activity: ConfirmedActivity,
): Promise<GarminImportOutcome> {
  const { startedAt, endedAt, set } = activity;
  const skipped = (reason: GarminSkipReason): GarminImportOutcome => ({ startedAt, outcome: 'skipped', reason });

  const seen = run.seen.get(startedAt);
  if (seen !== undefined) return skipped(SKIP_REASON_OF_SEEN[seen]);
  if (implausibleTiming(startedAt, endedAt, run.now.getTime()) !== null) return skipped('unreadable');
  run.capReached ||= !(await rateLimitAllows(tx, 'garmin_import_day', run.userId));
  if (run.capReached) return skipped('daily_cap');

  const sessionId = crypto.randomUUID();
  const { stored, historyOnly } = await storeNewSession(
    tx,
    run.userId,
    {
      id: sessionId,
      startedAt,
      endedAt,
      notes: null,
      sessionRpe: null,
      programDayId: null,
      program: null,
      challenge: null,
      sets: [set],
    },
    run.lastCompletedAt,
    run.now,
  );
  run.lastCompletedAt = stored.completedAt;
  run.seen.set(startedAt, 'imported');
  if (historyOnly) return { startedAt, outcome: 'history_only', sessionId };
  const xp = Object.values(stored.summary.xpBySkill).reduce((total, skillXp) => total + skillXp, 0);
  return { startedAt, outcome: 'imported', sessionId, xp };
}

function assertWithinScoringBudget(activities: readonly ConfirmedActivity[], now: Date): void {
  const scored = activities.filter((activity) => isWithinEditWindow(activity.startedAt, now.getTime()));
  if (scored.length > GARMIN_IMPORT_CHUNK.maxScored) {
    throw new HttpError(422, 'too_many_scored_activities', { maxScored: GARMIN_IMPORT_CHUNK.maxScored });
  }
}

async function importActivities(userId: string, payload: ImportActivitiesPayload): Promise<ImportActivitiesResponse> {
  const now = new Date();
  assertWithinScoringBudget(payload.activities, now);
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);
    const seen = await seenGarminActivityOutcomes(
      tx,
      userId,
      payload.activities.map((activity) => activity.startedAt),
    );
    const run: ImportRun = { userId, now, seen, capReached: false, lastCompletedAt: null };
    const inStartOrder = payload.activities
      .map((activity, sentAt) => ({ activity, sentAt }))
      .sort((a, b) => a.activity.startedAt.localeCompare(b.activity.startedAt) || a.sentAt - b.sentAt);
    const outcomes: GarminImportOutcome[] = [];
    for (const { activity, sentAt } of inStartOrder) outcomes[sentAt] = await importActivity(tx, run, activity);
    await rememberImportedGarminActivities(
      tx,
      userId,
      payload.activities.flatMap(({ startedAt, garminType }, sentAt) => {
        const outcome = outcomes[sentAt];
        return outcome.outcome === 'skipped' ? [] : [{ startedAt, garminType, sessionId: outcome.sessionId }];
      }),
    );
    return { activities: outcomes };
  });
}

serveAuthenticated(parseImportActivitiesPayload, importActivities);
