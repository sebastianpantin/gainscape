import { type ProgramFact, type SessionFact } from '@domain/index.ts';
import { type WorkoutDraft } from './draft-format.ts';

export interface LocalSessionAppend {
  fact: SessionFact;
  appendedAt: number;
}

export interface ProgramFactsCache {
  enrollmentId: string;
  generation: number;
  serverFacts: readonly ProgramFact[];
  localAppends: readonly LocalSessionAppend[];
}

export interface FactsFetchTicket {
  enrollmentId: string;
  generation: number;
  startedAt: number;
}

export type FinishOutcomeForFacts =
  | { kind: 'synced'; summary: { programLinked: boolean; completedAt: string } }
  | { kind: 'deleted' }
  | { kind: 'retryable' | 'rejected' | 'needs_sign_in' | 'wrong_account' };

function notImplemented(): never {
  throw new Error('not implemented');
}

export function emptyProgramFactsCache(enrollmentId: string): ProgramFactsCache {
  void enrollmentId;
  return notImplemented();
}

export function syncedSessionFact(draft: WorkoutDraft, completedAt: string): SessionFact | null {
  void [draft, completedAt];
  return notImplemented();
}

export function appendFinishedSession(
  cache: ProgramFactsCache,
  draft: WorkoutDraft,
  outcome: FinishOutcomeForFacts,
  appendedAt: number,
): ProgramFactsCache {
  void [cache, draft, outcome, appendedAt];
  return notImplemented();
}

export function beginFactsFetch(cache: ProgramFactsCache, startedAt: number): FactsFetchTicket {
  void [cache, startedAt];
  return notImplemented();
}

export function mergeFetchedFacts(
  cache: ProgramFactsCache,
  ticket: FactsFetchTicket,
  serverFacts: readonly ProgramFact[],
): ProgramFactsCache {
  void [cache, ticket, serverFacts];
  return notImplemented();
}

export function forgetDeletedSession(cache: ProgramFactsCache, sessionId: string): ProgramFactsCache {
  void [cache, sessionId];
  return notImplemented();
}

export function cachedProgramFacts(cache: ProgramFactsCache): ProgramFact[] {
  void cache;
  return notImplemented();
}
