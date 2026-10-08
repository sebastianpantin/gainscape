import type { BoutValues, DraftSet, WorkoutDraft } from './draft-format.ts';

export function boutPayload(bout: BoutValues & { id: string }, exerciseId: string, position: number) {
  const { id, distanceM, interval, effort } = bout;
  const identity = { kind: 'cardio' as const, id, exerciseId, position };
  return interval === null
    ? { ...identity, durationS: bout.durationS, distanceM, interval, effort }
    : { ...identity, distanceM, interval, effort };
}

function liftPayload(set: DraftSet, exerciseId: string, position: number) {
  return {
    id: set.id,
    exerciseId,
    position,
    weightKg: set.weightKg,
    reps: set.reps,
    isWarmup: set.isWarmup,
    effort: set.effort,
    prescription: set.prescription ?? null,
  };
}

type SetPayload = ReturnType<typeof boutPayload> | ReturnType<typeof liftPayload>;

export function completeSessionPayload(draft: WorkoutDraft) {
  let position = 0;
  const sets = draft.exercises.flatMap((exercise): SetPayload[] =>
    exercise.modality === 'cardio'
      ? exercise.sets.filter((bout) => bout.done).map((bout) => boutPayload(bout, exercise.exerciseId, position++))
      : exercise.sets.filter((set) => set.done).map((set) => liftPayload(set, exercise.exerciseId, position++)),
  );
  return {
    id: draft.sessionId,
    startedAt: draft.startedAt,
    endedAt: draft.finishedAt,
    notes: null,
    sessionRpe: draft.sessionRpe ?? null,
    programDayId: draft.programDayId,
    program: draft.program ? { enrollmentId: draft.program.enrollmentId, position: draft.program.position } : null,
    challenge: draft.challenge ? { challengeId: draft.challenge.challengeId } : null,
    sets,
  };
}
