import { sql, type Transaction } from '../_shared/db.ts';
import { GARMIN_IMPORT_CHUNK, implausibleTiming, isWithinEditWindow } from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serveAuthenticated } from '../_shared/serve-authenticated.ts';
import {
  type GarminActivityOutcome,
  rememberImportedGarminActivity,
  seenGarminActivityOutcome,
} from '../_shared/stores/garmin-activities.ts';
import { storeNewSession } from '../_shared/stores/new-session.ts';
import { lockUser } from '../_shared/stores/sessions.ts';
import { type ConfirmedActivity, type ImportActivitiesPayload, parseImportActivitiesPayload } from './payload.ts';

type SkipReason = 'already_imported' | 'deleted' | 'rejected' | 'daily_cap' | 'unreadable';

type ImportOutcome =
  | { startedAt: string; outcome: 'imported'; sessionId: string; xp: number }
  | { startedAt: string; outcome: 'history_only'; sessionId: string }
  | { startedAt: string; outcome: 'skipped'; reason: SkipReason };

interface ImportActivitiesResponse {
  activities: ImportOutcome[];
}

const SKIP_REASON_OF_SEEN: Record<GarminActivityOutcome, SkipReason> = {
  imported: 'already_imported',
  deleted: 'deleted',
  rejected: 'rejected',
};

const RATE_LIMITED_STATUS = 429;

function isRateLimited(error: unknown): boolean {
  return error instanceof HttpError && error.status === RATE_LIMITED_STATUS;
}

async function dailyCapAllows(tx: Transaction, userId: string): Promise<boolean> {
  try {
    await tx.savepoint((savepoint) => takeRateLimit(savepoint, 'garmin_import_day', userId));
    return true;
  } catch (error) {
    if (isRateLimited(error)) return false;
    throw error;
  }
}

interface ImportRun {
  userId: string;
  now: Date;
  capReached: boolean;
  lastCompletedAt: string | null;
}

async function importActivity(tx: Transaction, run: ImportRun, activity: ConfirmedActivity): Promise<ImportOutcome> {
  const { startedAt, endedAt, garminType, set } = activity;
  const skipped = (reason: SkipReason): ImportOutcome => ({ startedAt, outcome: 'skipped', reason });

  const seen = await seenGarminActivityOutcome(tx, run.userId, startedAt);
  if (seen !== null) return skipped(SKIP_REASON_OF_SEEN[seen]);
  if (implausibleTiming(startedAt, endedAt, run.now.getTime()) !== null) return skipped('unreadable');
  run.capReached ||= !(await dailyCapAllows(tx, run.userId));
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
  await rememberImportedGarminActivity(tx, run.userId, { startedAt, garminType, sessionId });
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
    const run: ImportRun = { userId, now, capReached: false, lastCompletedAt: null };
    const inStartOrder = payload.activities
      .map((activity, sentAt) => ({ activity, sentAt }))
      .sort((a, b) => a.activity.startedAt.localeCompare(b.activity.startedAt) || a.sentAt - b.sentAt);
    const outcomes: ImportOutcome[] = [];
    for (const { activity, sentAt } of inStartOrder) outcomes[sentAt] = await importActivity(tx, run, activity);
    return { activities: outcomes };
  });
}

serveAuthenticated(parseImportActivitiesPayload, importActivities);
