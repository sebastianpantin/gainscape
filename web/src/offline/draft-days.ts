import { samePosition } from '../lib/programs/program-today-rules.ts';
import {
  type CatalogEntry,
  draftProgramOf,
  LABEL_SEPARATOR,
  prescribedDayExercises,
  type PrescribedDayStart,
  programLabelFor,
} from './draft-starts.ts';
import { type DraftExercise, type DraftSecondDay, type WorkoutDraft } from './draft-format.ts';
import { type SavedDay } from './last-summary.ts';

export type DraftDay = 'first' | 'second';

export interface RemovedSecondDay {
  secondDay: DraftSecondDay;
  exercises: DraftExercise[];
}

export function isInSecondDay(exercise: DraftExercise): boolean {
  return exercise.inSecondDay === true;
}

export function canAddSecondDay(draft: WorkoutDraft): boolean {
  return draft.program != null && draft.secondDay == null && draft.challenge == null && draft.finishedAt === null;
}

export function exerciseDay(draft: WorkoutDraft, exerciseIndex: number): DraftDay {
  const exercise = draft.exercises[exerciseIndex];
  return draft.secondDay != null && exercise !== undefined && isInSecondDay(exercise) ? 'second' : 'first';
}

export function withSecondDay(
  draft: WorkoutDraft,
  day: PrescribedDayStart,
  exercisesById: ReadonlyMap<string, CatalogEntry>,
  sessionId: string,
): { draft: WorkoutDraft; skippedExerciseIds: string[] } {
  const { program } = draft;
  if (
    !canAddSecondDay(draft) ||
    program?.enrollmentId !== day.enrollmentId ||
    samePosition(program.position, day.position)
  )
    return { draft, skippedExerciseIds: [] };
  const { exercises, skippedExerciseIds } = prescribedDayExercises(day, exercisesById);
  return {
    draft: {
      ...draft,
      secondDay: {
        sessionId,
        program: draftProgramOf(day),
        programLabel: programLabelFor(day.programName, day.dayName),
      },
      exercises: [...draft.exercises, ...exercises.map((exercise) => ({ ...exercise, inSecondDay: true }))],
    },
    skippedExerciseIds,
  };
}

function exercisesOf(draft: WorkoutDraft, day: DraftDay): DraftExercise[] {
  return draft.exercises.filter((exercise) => isInSecondDay(exercise) === (day === 'second'));
}

export function withoutSecondDay(draft: WorkoutDraft): { draft: WorkoutDraft; removed: RemovedSecondDay | null } {
  if (draft.secondDay == null) return { draft, removed: null };
  return {
    draft: { ...draft, secondDay: null, exercises: exercisesOf(draft, 'first') },
    removed: { secondDay: draft.secondDay, exercises: exercisesOf(draft, 'second') },
  };
}

export function restoreSecondDay(draft: WorkoutDraft, removed: RemovedSecondDay): WorkoutDraft {
  if (draft.secondDay != null || draft.finishedAt !== null) return draft;
  return { ...draft, secondDay: removed.secondDay, exercises: [...draft.exercises, ...removed.exercises] };
}

export function dayNameOf(programLabel: string): string {
  const [, ...dayName] = programLabel.split(LABEL_SEPARATOR);
  return dayName.length === 0 ? programLabel : dayName.join(LABEL_SEPARATOR);
}

export function draftTitle(draft: WorkoutDraft): string | null {
  const first = draft.programLabel;
  const second = draft.secondDay?.programLabel;
  if (first === null || second === undefined) return first;
  const sameProgram = first.split(LABEL_SEPARATOR)[0] === second.split(LABEL_SEPARATOR)[0];
  return `${first} + ${sameProgram ? dayNameOf(second) : second}`;
}

function draftsByDay(draft: WorkoutDraft): WorkoutDraft[] {
  if (draft.secondDay == null) return [draft];
  const { sessionId, program, programLabel } = draft.secondDay;
  return [
    { ...draft, secondDay: null, exercises: exercisesOf(draft, 'first') },
    { ...draft, sessionId, program, programLabel, secondDay: null, exercises: exercisesOf(draft, 'second') },
  ];
}

interface SyncedOutcome {
  kind: 'synced';
  summary: { programLinked: boolean; completedAt: string; days?: readonly SavedDay[] };
}

interface SyncedDayDraft {
  draft: WorkoutDraft;
  outcome: { kind: 'synced'; summary: { programLinked: boolean; completedAt: string } };
}

export function dayDrafts(draft: WorkoutDraft, outcome: SyncedOutcome): SyncedDayDraft[] {
  const { days } = outcome.summary;
  if (draft.secondDay == null || days === undefined)
    return [{ draft, outcome: { kind: 'synced', summary: outcome.summary } }];
  const byId = new Map(days.map((day) => [day.sessionId, day]));
  return draftsByDay(draft).flatMap((dayDraft) => {
    const synced = byId.get(dayDraft.sessionId);
    if (synced === undefined) return [];
    const { programLinked, completedAt } = synced;
    return [{ draft: dayDraft, outcome: { kind: 'synced' as const, summary: { programLinked, completedAt } } }];
  });
}

export function labelledDays(draft: WorkoutDraft, days: readonly SavedDay[]): SavedDay[] {
  const labels = new Map(draftsByDay(draft).map((dayDraft) => [dayDraft.sessionId, dayDraft.programLabel]));
  return days.map((day) => ({ ...day, label: dayNameOf(labels.get(day.sessionId) ?? 'Workout') }));
}
