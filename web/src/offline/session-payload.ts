import type { BoutValues, HoldValues } from '../lib/exercise-edit-rules.ts';
import type { DraftSet, WorkoutDraft } from './draft-format.ts';

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

export function holdPayload(set: HoldValues & { id: string }, exerciseId: string, position: number) {
  const { id, weightKg, durationS, distanceM, effort } = set;
  return { kind: 'hold' as const, id, exerciseId, position, weightKg, durationS, distanceM, effort };
}

type SetPayload = ReturnType<typeof boutPayload> | ReturnType<typeof liftPayload> | ReturnType<typeof holdPayload>;

export function completeSessionPayload(draft: WorkoutDraft) {
  let position = 0;
  const sets = draft.exercises.flatMap((exercise): SetPayload[] => {
    if (exercise.modality === 'cardio') {
      return exercise.sets
        .filter((bout) => bout.done)
        .map((bout) => boutPayload(bout, exercise.exerciseId, position++));
    }
    if (exercise.modality === 'hold') {
      return exercise.sets.filter((set) => set.done).map((set) => holdPayload(set, exercise.exerciseId, position++));
    }
    return exercise.sets.filter((set) => set.done).map((set) => liftPayload(set, exercise.exerciseId, position++));
  });
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
