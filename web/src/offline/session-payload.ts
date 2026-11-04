import type { BoutValues, HoldValues } from '../lib/workout/exercise-edit-rules.ts';
import type { DraftExercise, DraftProgram, DraftSet, WorkoutDraft } from './draft-format.ts';

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

function doneSetsOf(exercise: DraftExercise, nextPosition: () => number): SetPayload[] {
  if (exercise.modality === 'cardio')
    return exercise.sets
      .filter((bout) => bout.done)
      .map((bout) => boutPayload(bout, exercise.exerciseId, nextPosition()));
  if (exercise.modality === 'hold')
    return exercise.sets.filter((set) => set.done).map((set) => holdPayload(set, exercise.exerciseId, nextPosition()));
  return exercise.sets.filter((set) => set.done).map((set) => liftPayload(set, exercise.exerciseId, nextPosition()));
}

function programPayloadOf(program: DraftProgram) {
  return { enrollmentId: program.enrollmentId, position: program.position };
}

function secondDayPayload(draft: WorkoutDraft) {
  const { secondDay } = draft;
  if (secondDay == null) return null;
  const doneSetIds = draft.exercises
    .filter((exercise) => exercise.inSecondDay === true)
    .flatMap((exercise) => exercise.sets.flatMap((set) => (set.done ? [set.id] : [])));
  return { id: secondDay.sessionId, program: programPayloadOf(secondDay.program), setIds: doneSetIds };
}

export function completeSessionPayload(draft: WorkoutDraft) {
  let position = 0;
  const sets = draft.exercises.flatMap((exercise) => doneSetsOf(exercise, () => position++));
  return {
    id: draft.sessionId,
    startedAt: draft.startedAt,
    endedAt: draft.finishedAt,
    notes: null,
    sessionRpe: draft.sessionRpe ?? null,
    programDayId: draft.programDayId,
    program: draft.program ? programPayloadOf(draft.program) : null,
    secondDay: secondDayPayload(draft),
    challenge: draft.challenge ? { challengeId: draft.challenge.challengeId } : null,
    sets,
  };
}
