import { sql, type Transaction } from '../_shared/db.ts';
import { DEFAULT_BALANCE, isNoOpEdit, mergedSummaries, type SessionSummary } from '../_shared/domain/index.ts';
import { HttpError } from '../_shared/http.ts';
import { takeRateLimit } from '../_shared/rate-limit.ts';
import { serveAuthenticated } from '../_shared/serve-authenticated.ts';
import { storeNewSession } from '../_shared/stores/new-session.ts';
import {
  findSession,
  type InsertedSession,
  loadStoredSetsById,
  lockUser,
  type SessionTiming,
  type StoredSession,
  tombstoneOwner,
} from '../_shared/stores/sessions.ts';
import {
  assertPlausibleTiming,
  type CompleteSessionPayload,
  type DayPayload,
  dayPayloads,
  parseCompleteSessionPayload,
} from './payload.ts';

async function resubmissionDiffers(tx: Transaction, stored: StoredSession, payload: DayPayload): Promise<boolean> {
  if (payload.sessionRpe !== stored.sessionRpe) return true;
  const { storedById } = await loadStoredSetsById(tx, payload.id);
  return !isNoOpEdit(payload, stored.notes, storedById, DEFAULT_BALANCE);
}

interface CompletedDay {
  sessionId: string;
  programLinked: boolean;
  completedAt: string;
}

interface CompleteSessionResponse extends SessionSummary, SessionTiming {
  days?: CompletedDay[];
  programLinked: boolean;
  completedAt: string;
  storedContentDiffers?: true;
}

function responseFor(stored: InsertedSession, timing: SessionTiming, programLinked: boolean): CompleteSessionResponse {
  const { startedAt, endedAt, sessionRpe } = timing;
  return { ...stored.summary, programLinked, completedAt: stored.completedAt, startedAt, endedAt, sessionRpe };
}

async function completeDay(
  tx: Transaction,
  userId: string,
  payload: DayPayload,
  completedAfter: string | null,
): Promise<CompleteSessionResponse> {
  const existing = await findSession(tx, payload.id);
  if (existing && existing.userId !== userId) throw new HttpError(409, 'session_id_conflict');
  if (existing) {
    const stored = responseFor(existing, existing, existing.programLinked);
    return (await resubmissionDiffers(tx, existing, payload)) ? { ...stored, storedContentDiffers: true } : stored;
  }
  const deletedBy = await tombstoneOwner(tx, payload.id);
  if (deletedBy === userId) throw new HttpError(410, 'session_deleted');
  if (deletedBy !== null) throw new HttpError(409, 'session_id_conflict');
  await takeRateLimit(tx, 'session_create_hour', userId);
  await takeRateLimit(tx, 'session_create_day', userId);

  const now = new Date();
  assertPlausibleTiming(payload, now);
  const { stored, programLinked } = await storeNewSession(tx, userId, payload, completedAfter, now);
  return responseFor(stored, payload, programLinked);
}

function combinedResponse(responses: readonly CompleteSessionResponse[]): CompleteSessionResponse {
  const [first, ...rest] = responses;
  const merged = rest.reduce<SessionSummary>((summary, next) => mergedSummaries(summary, next), first);
  const differs = responses.some((response) => response.storedContentDiffers);
  return {
    ...merged,
    programLinked: first.programLinked,
    completedAt: first.completedAt,
    startedAt: first.startedAt,
    endedAt: first.endedAt,
    sessionRpe: first.sessionRpe,
    ...(differs ? { storedContentDiffers: true } : {}),
    days: responses.map(({ sessionId, programLinked, completedAt }) => ({ sessionId, programLinked, completedAt })),
  };
}

async function completeSession(userId: string, payload: CompleteSessionPayload): Promise<CompleteSessionResponse> {
  return await sql.begin(async (tx) => {
    await lockUser(tx, userId);
    const days = dayPayloads(payload);
    if (days.length === 1) {
      const response = await completeDay(tx, userId, days[0], null);
      return payload.secondDay === null ? response : combinedResponse([response]);
    }
    const responses: CompleteSessionResponse[] = [];
    for (const day of days) {
      if ((await tombstoneOwner(tx, day.id)) === userId) continue;
      responses.push(await completeDay(tx, userId, day, responses.at(-1)?.completedAt ?? null));
    }
    if (responses.length === 0) throw new HttpError(410, 'session_deleted');
    return combinedResponse(responses);
  });
}

serveAuthenticated(parseCompleteSessionPayload, completeSession);
