import type { SessionSummary } from '@domain/types.ts';
import { type InvokeOutcome, invokeAsOwner, retryDelayMs } from './function-client.ts';
import {
  type EditSessionPayload,
  type HistorySession,
  querySession,
  querySessionPage,
  querySessionSets,
  type StoredSetRow,
  transientReason,
} from './history-rules.ts';
import { supabase } from './supabase.ts';

const FUNCTION_TIMEOUT_MS = 20_000;
const AUTOMATIC_RETRIES = 4;

export function fetchSessionPage(after: HistorySession | null): Promise<HistorySession[]> {
  return querySessionPage(supabase, after);
}

export function fetchSession(sessionId: string): Promise<HistorySession | null> {
  return querySession(supabase, sessionId);
}

export function fetchSessionSets(sessionId: string): Promise<StoredSetRow[]> {
  return querySessionSets(supabase, sessionId);
}

export interface EditSessionResponse {
  summary: SessionSummary;
  revision: number;
  replayedSessionIds: string[];
}

export interface DeleteSessionResponse {
  sessionId: string;
  deleted: true;
  replayedSessionIds: string[];
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function invokeWithRetries<T>(
  userId: string,
  name: string,
  body: unknown,
  signal: AbortSignal,
  onRetry: (reason: string) => void,
): Promise<InvokeOutcome<T>> {
  let outcome = await invokeAsOwner<T>(userId, name, body, FUNCTION_TIMEOUT_MS, signal);
  for (let attempt = 0; attempt < AUTOMATIC_RETRIES && !signal.aborted; attempt++) {
    const reason = transientReason(outcome);
    if (reason === null) break;
    onRetry(reason);
    await pause(retryDelayMs(attempt), signal);
    if (signal.aborted) break;
    outcome = await invokeAsOwner<T>(userId, name, body, FUNCTION_TIMEOUT_MS, signal);
  }
  return outcome;
}

export function editSession(
  userId: string,
  payload: EditSessionPayload,
  signal: AbortSignal,
  onRetry: (reason: string) => void,
): Promise<InvokeOutcome<EditSessionResponse>> {
  return invokeWithRetries(userId, 'edit-session', payload, signal, onRetry);
}

export function deleteSession(
  userId: string,
  sessionId: string,
  signal: AbortSignal,
  onRetry: (reason: string) => void,
): Promise<InvokeOutcome<DeleteSessionResponse>> {
  return invokeWithRetries(userId, 'delete-session', { sessionId }, signal, onRetry);
}
