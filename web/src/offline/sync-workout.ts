import type { SessionSummary } from '@domain/types.ts';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase.ts';
import type { WorkoutDraft } from './workout-draft.ts';

export type SyncOutcome =
  | { kind: 'synced'; summary: SessionSummary }
  | { kind: 'retryable'; reason: string }
  | { kind: 'rejected'; reason: string };

function completeSessionPayload(draft: WorkoutDraft) {
  let position = 0;
  const sets = draft.exercises.flatMap((exercise) =>
    exercise.sets.map((set) => ({
      id: set.id,
      exerciseId: exercise.exerciseId,
      position: position++,
      weightKg: set.weightKg,
      reps: set.reps,
      isWarmup: false,
      effort: set.effortLevel === null ? null : { type: 'level', level: set.effortLevel },
    })),
  );
  return { id: draft.sessionId, startedAt: draft.startedAt, endedAt: draft.finishedAt, notes: null, sets };
}

async function rejectionReason(error: FunctionsHttpError): Promise<{ status: number; reason: string }> {
  const response = error.context as Response;
  const body = await response.json().catch(() => ({}));
  return { status: response.status, reason: body.error ?? `http_${response.status}` };
}

export async function syncFinishedWorkout(draft: WorkoutDraft): Promise<SyncOutcome> {
  try {
    const { data, error } = await supabase.functions.invoke<SessionSummary>('complete-session', {
      body: completeSessionPayload(draft),
    });
    if (!error && data) return { kind: 'synced', summary: data };
    if (error instanceof FunctionsHttpError) {
      const { status, reason } = await rejectionReason(error);
      const serverOrAuthProblem = status >= 500 || status === 401;
      return serverOrAuthProblem ? { kind: 'retryable', reason } : { kind: 'rejected', reason };
    }
    return { kind: 'retryable', reason: error?.message ?? 'no_response' };
  } catch (error) {
    return { kind: 'retryable', reason: error instanceof Error ? error.message : 'network_error' };
  }
}
