import type { RevokedDrop, SessionSummary } from '@domain/types.ts';
import { invokeAsOwner } from './function-client.ts';
import type { InvokeOutcome } from './function-client-rules.ts';
import {
  type EditSessionPayload,
  type HistorySession,
  invokeWithRetries,
  querySession,
  querySessionPage,
  querySessionSets,
  type SessionDetail,
  type StoredSetRow,
} from './history-rules.ts';
import { REQUEST_TIMEOUT_MS } from './auth-restore.ts';
import { failFastWhenOffline } from '../offline/cache-first.ts';
import { supabase } from './supabase.ts';

export async function fetchSessionPage(after: HistorySession | null): Promise<HistorySession[]> {
  failFastWhenOffline();
  return querySessionPage(supabase, after);
}

export async function fetchSession(sessionId: string): Promise<SessionDetail | null> {
  failFastWhenOffline();
  return querySession(supabase, sessionId);
}

export async function fetchSessionSets(sessionId: string): Promise<StoredSetRow[]> {
  failFastWhenOffline();
  return querySessionSets(supabase, sessionId);
}

export interface EditSessionResponse {
  summary: SessionSummary;
  revision: number;
  replayedSessionIds: string[];
  revokedDrops: RevokedDrop[];
}

export interface DeleteSessionResponse {
  sessionId: string;
  deleted: true;
  replayedSessionIds: string[];
  revokedDrops: RevokedDrop[];
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

function invokeAsOwnerWithRetries<T>(
  userId: string,
  name: string,
  body: unknown,
  signal: AbortSignal,
  onRetry: (reason: string) => void,
): Promise<InvokeOutcome<T>> {
  return invokeWithRetries({
    invoke: () => invokeAsOwner<T>(userId, name, body, REQUEST_TIMEOUT_MS, signal),
    pause,
    signal,
    onRetry,
  });
}

export function editSession(
  userId: string,
  payload: EditSessionPayload,
  signal: AbortSignal,
  onRetry: (reason: string) => void,
): Promise<InvokeOutcome<EditSessionResponse>> {
  return invokeAsOwnerWithRetries(userId, 'edit-session', payload, signal, onRetry);
}

export function deleteSession(
  userId: string,
  payload: { sessionId: string; ifRevision: number },
  signal: AbortSignal,
  onRetry: (reason: string) => void,
): Promise<InvokeOutcome<DeleteSessionResponse>> {
  return invokeAsOwnerWithRetries(userId, 'delete-session', payload, signal, onRetry);
}
