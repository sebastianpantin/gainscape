import type { DropSummary, SessionSummary } from '@domain/types.ts';
import { parsedDraftChallenge } from '../lib/collection/challenge-rules.ts';
import type { InvokeOutcome } from '../lib/platform/function-client-rules.ts';
import { tabStorage } from '../lib/platform/keyed-store.ts';
import { RATE_LIMITED_STATUS, retryAfterSeconds } from '../lib/platform/rate-limit.ts';
import type { RememberedTiming } from '../lib/workout/session-timing-rules.ts';
import { dayDrafts, labelledDays, type SavedDay } from './draft-days.ts';
import type { DraftChallenge, WorkoutDraft } from './draft-format.ts';
import { spendCachedScroll } from './items-cache.ts';
import { rememberFinishedSession } from './program-cache.ts';
import { completeSessionPayload } from './session-payload.ts';

export interface FinishSummary extends SessionSummary, RememberedTiming {
  programLinked?: boolean;
  completedAt?: string;
  storedContentDiffers?: true;
  days?: SavedDay[];
  plannedChallenge?: DraftChallenge | null;
}

export interface FinishOutcome {
  summary: FinishSummary;
  sessionIds: readonly string[];
}

export type SendOutcome =
  | { kind: 'synced'; summary: FinishSummary }
  | { kind: 'deleted' }
  | { kind: 'retryable'; reason: string; retryAfterMs?: number; serverFault?: true }
  | { kind: 'rejected'; reason: string }
  | { kind: 'needs_sign_in' }
  | { kind: 'wrong_account' };

export interface FinishIo {
  completeSession: (payload: ReturnType<typeof completeSessionPayload>) => Promise<InvokeOutcome<FinishSummary>>;
  device: Storage;
  tab: Storage | null;
}

const LAST_SUMMARY_KEY = 'gainscape.last-summary';
const SESSION_DELETED_STATUS = 410;
const SERVER_ERROR_STATUS = 500;
const REBUILD_REQUIRED_CODE = 'rebuild_required';
const TRANSIENT_CLIENT_ERROR_STATUSES = new Set([404, 408, 425]);
const PROFILE_NOT_FOUND_CODE = 'profile_not_found';

function sendOutcomeFrom(outcome: InvokeOutcome<FinishSummary>): SendOutcome {
  if (outcome.kind === 'ok') return { kind: 'synced', summary: outcome.data };
  if (outcome.kind !== 'http_error') return outcome;
  if (outcome.status === SESSION_DELETED_STATUS) return { kind: 'deleted' };
  if (outcome.status === RATE_LIMITED_STATUS) {
    const seconds = retryAfterSeconds(outcome.details);
    return { kind: 'retryable', reason: outcome.code, retryAfterMs: seconds === null ? undefined : seconds * 1000 };
  }
  if (TRANSIENT_CLIENT_ERROR_STATUSES.has(outcome.status) && outcome.code !== PROFILE_NOT_FOUND_CODE)
    return { kind: 'retryable', reason: outcome.code };
  if (outcome.status < SERVER_ERROR_STATUS) return { kind: 'rejected', reason: outcome.code };
  return outcome.code === REBUILD_REQUIRED_CODE
    ? { kind: 'retryable', reason: outcome.code }
    : { kind: 'retryable', reason: outcome.code, serverFault: true };
}

function completedSummary(draft: WorkoutDraft, summary: FinishSummary): FinishSummary {
  const days = summary.days === undefined ? {} : { days: labelledDays(draft, summary.days) };
  const plannedChallenge = draft.challenge ? { plannedChallenge: draft.challenge } : {};
  return { ...summary, ...days, ...plannedChallenge };
}

function rememberFinishedDays(device: Storage, userId: string, draft: WorkoutDraft, summary: FinishSummary): void {
  const { programLinked, completedAt, days } = summary;
  if (typeof programLinked !== 'boolean' || typeof completedAt !== 'string') return;
  const synced = { kind: 'synced' as const, summary: { programLinked, completedAt, days } };
  for (const day of dayDrafts(draft, synced)) rememberFinishedSession(device, userId, day.draft, day.outcome);
}

function rememberSummary(tab: Storage | null, userId: string, summary: FinishSummary): void {
  try {
    tab?.setItem(LAST_SUMMARY_KEY, JSON.stringify({ userId, summary }));
  } catch {
    return;
  }
}

export async function completeFinishedDraft(userId: string, draft: WorkoutDraft, io: FinishIo): Promise<SendOutcome> {
  const sent = sendOutcomeFrom(await io.completeSession(completeSessionPayload(draft)));
  if (sent.kind !== 'synced') return sent;
  const summary = completedSummary(draft, sent.summary);
  rememberFinishedDays(io.device, userId, draft, summary);
  if (summary.challenge) spendCachedScroll(io.device, userId, summary.challenge.challengeId);
  rememberSummary(io.tab, userId, summary);
  return { kind: 'synced', summary };
}

export function finishOutcomeOf(summary: FinishSummary): FinishOutcome {
  const sessionIds = [...new Set([summary.sessionId, ...(summary.days ?? []).map((day) => day.sessionId)])];
  return { summary, sessionIds };
}

interface RememberedEntry {
  userId?: unknown;
  summary?: FinishSummary;
}

function rememberedEntry(tab: Storage | null): RememberedEntry | null {
  const raw = tab?.getItem(LAST_SUMMARY_KEY);
  return raw ? (JSON.parse(raw) as RememberedEntry) : null;
}

export function recallFinishOutcome(userId: string, tab: Storage | null = tabStorage()): FinishOutcome | null {
  try {
    const entry = rememberedEntry(tab);
    if (!entry?.summary || entry.userId !== userId) return null;
    const { summary } = entry;
    return finishOutcomeOf(
      'plannedChallenge' in summary
        ? { ...summary, plannedChallenge: parsedDraftChallenge(summary.plannedChallenge) }
        : summary,
    );
  } catch {
    return null;
  }
}

export function finishOutcomeCovers(userId: string, sessionId: string, tab: Storage | null = tabStorage()): boolean {
  return recallFinishOutcome(userId, tab)?.sessionIds.includes(sessionId) ?? false;
}

export function forgetFinishOutcomeCovering(sessionIds: readonly string[], tab: Storage | null = tabStorage()): void {
  try {
    const summary = rememberedEntry(tab)?.summary;
    if (summary && finishOutcomeOf(summary).sessionIds.some((id) => sessionIds.includes(id)))
      tab?.removeItem(LAST_SUMMARY_KEY);
  } catch {
    return;
  }
}

export function forgetFinishOutcomeOf(tab: Storage | null, userId: string): void {
  try {
    if (rememberedEntry(tab)?.userId === userId) tab?.removeItem(LAST_SUMMARY_KEY);
  } catch {
    return;
  }
}

export async function finishOutcomeLoot(
  fetchDrops: (sessionId: string) => Promise<DropSummary[] | null>,
  userId: string,
  sessionIds: readonly string[],
  tab: Storage | null = tabStorage(),
): Promise<DropSummary[] | null> {
  const dropsBySession = await Promise.all(sessionIds.map(fetchDrops));
  if (dropsBySession.some((drops) => drops === null)) return null;
  const drops = dropsBySession.flatMap((sessionDrops) => sessionDrops ?? []);
  const remembered = recallFinishOutcome(userId, tab);
  if (remembered?.sessionIds.join() === sessionIds.join())
    rememberSummary(tab, userId, { ...remembered.summary, drops });
  return drops;
}
