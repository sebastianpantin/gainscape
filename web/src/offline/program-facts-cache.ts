import {
  DEFAULT_BALANCE,
  type FactSet,
  type ProgramFact,
  resolveEffort,
  roundTo,
  type SessionFact,
  storableSnapshots,
} from '@domain/index.ts';
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

export function emptyProgramFactsCache(enrollmentId: string): ProgramFactsCache {
  return { enrollmentId, generation: 0, serverFacts: [], localAppends: [] };
}

export function syncedSessionFact(draft: WorkoutDraft, completedAt: string): SessionFact | null {
  if (!draft.program) return null;
  const doneSets = draft.exercises.flatMap((exercise) =>
    exercise.modality === 'cardio'
      ? []
      : exercise.sets.filter((set) => set.done).map((set) => ({ exerciseId: exercise.exerciseId, set })),
  );
  const snapshots = storableSnapshots(doneSets.map(({ set }) => set.prescription ?? null));
  const sets = doneSets.map(({ exerciseId, set }, index): FactSet => {
    const { effortInputType, effortValue } = resolveEffort(set.effort, DEFAULT_BALANCE, 'lift');
    return {
      exerciseId,
      weightKg: roundTo(2, set.weightKg),
      reps: set.reps,
      effortInputType,
      effortValue,
      prescription: snapshots[index],
    };
  });
  return {
    kind: 'session',
    id: draft.sessionId,
    at: completedAt,
    local: true,
    position: draft.program.position,
    sets,
  };
}

function isKnown(cache: ProgramFactsCache, factId: string): boolean {
  return (
    cache.serverFacts.some((fact) => fact.id === factId) ||
    cache.localAppends.some((append) => append.fact.id === factId)
  );
}

export function appendFinishedSession(
  cache: ProgramFactsCache,
  draft: WorkoutDraft,
  outcome: FinishOutcomeForFacts,
  appendedAt: number,
): ProgramFactsCache {
  if (outcome.kind !== 'synced' || !outcome.summary.programLinked) return cache;
  if (draft.program?.enrollmentId !== cache.enrollmentId || isKnown(cache, draft.sessionId)) return cache;
  const fact = syncedSessionFact(draft, outcome.summary.completedAt);
  if (fact === null) return cache;
  return { ...cache, localAppends: [...cache.localAppends, { fact, appendedAt }] };
}

export function beginFactsFetch(cache: ProgramFactsCache, startedAt: number): FactsFetchTicket {
  return { enrollmentId: cache.enrollmentId, generation: cache.generation, startedAt };
}

export function mergeFetchedFacts(
  cache: ProgramFactsCache,
  ticket: FactsFetchTicket,
  serverFacts: readonly ProgramFact[],
): ProgramFactsCache {
  if (ticket.enrollmentId !== cache.enrollmentId || ticket.generation !== cache.generation) return cache;
  const fetchedIds = new Set(serverFacts.map((fact) => fact.id));
  const localAppends = cache.localAppends.filter(
    (append) => !fetchedIds.has(append.fact.id) && append.appendedAt >= ticket.startedAt,
  );
  return { ...cache, serverFacts, localAppends };
}

export function forgetDeletedSession(cache: ProgramFactsCache, sessionId: string): ProgramFactsCache {
  return {
    ...cache,
    generation: cache.generation + 1,
    serverFacts: cache.serverFacts.filter((fact) => fact.id !== sessionId),
    localAppends: cache.localAppends.filter((append) => append.fact.id !== sessionId),
  };
}

export function cachedProgramFacts(cache: ProgramFactsCache): ProgramFact[] {
  const serverIds = new Set(cache.serverFacts.map((fact) => fact.id));
  return [
    ...cache.serverFacts,
    ...cache.localAppends.filter((append) => !serverIds.has(append.fact.id)).map((append) => append.fact),
  ];
}
