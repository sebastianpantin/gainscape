import type { WorkoutDraft } from './draft-format.ts';

export function completeSessionPayload(draft: WorkoutDraft) {
  let position = 0;
  const sets = draft.exercises.flatMap((exercise) =>
    exercise.sets
      .filter((set) => set.done)
      .map((set) => ({
        id: set.id,
        exerciseId: exercise.exerciseId,
        position: position++,
        weightKg: set.weightKg,
        reps: set.reps,
        isWarmup: false,
        effort: set.effortLevel === null ? null : { type: 'level', level: set.effortLevel },
      })),
  );
  return {
    id: draft.sessionId,
    startedAt: draft.startedAt,
    endedAt: draft.finishedAt,
    notes: null,
    programDayId: draft.programDayId,
    sets,
  };
}
