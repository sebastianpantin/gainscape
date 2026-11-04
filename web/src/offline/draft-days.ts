import { samePosition } from '../lib/programs/program-today-rules.ts';
import {
  type CatalogEntry,
  draftProgramOf,
  LABEL_SEPARATOR,
  prescribedDayExercises,
  type PrescribedDayStart,
  programLabelFor,
} from './draft-starts.ts';
import { type DraftExercise, type DraftSecondDay, isInSecondDay, type WorkoutDraft } from './draft-format.ts';
import { type SavedDay } from './last-summary.ts';
import { roomForSets } from '../lib/workout/exercise-edit-rules.ts';

export type DraftDay = 'first' | 'second';

export interface DraftDays {
  exercises: readonly DraftExercise[];
  secondDay?: DraftSecondDay | null;
}

export interface RemovedSecondDay {
  fromSessionId: string;
  secondDay: DraftSecondDay;
  exercises: DraftExercise[];
}

export function canAddSecondDay(draft: WorkoutDraft): boolean {
  return draft.program != null && draft.secondDay == null && draft.challenge == null && draft.finishedAt === null;
}

function lastDayOf(draft: DraftDays): DraftDay {
  return draft.secondDay == null ? 'first' : 'second';
}

export function daysOf(draft: DraftDays): DraftDay[] {
  return lastDayOf(draft) === 'first' ? ['first'] : ['first', 'second'];
}

function dayOf(draft: DraftDays, exercise: DraftExercise): DraftDay {
  return draft.secondDay != null && isInSecondDay(exercise) ? 'second' : 'first';
}

export function exerciseDay(draft: DraftDays, exerciseIndex: number): DraftDay {
  const exercise = draft.exercises[exerciseIndex];
  return exercise === undefined ? 'first' : dayOf(draft, exercise);
}

export function sameDay(draft: DraftDays, exerciseIndex: number, otherIndex: number): boolean {
  return exerciseDay(draft, exerciseIndex) === exerciseDay(draft, otherIndex);
}

export function exerciseIndexesOf(draft: DraftDays, day: DraftDay): number[] {
  return draft.exercises.flatMap((exercise, index) => (dayOf(draft, exercise) === day ? [index] : []));
}

export function exercisesOf(draft: DraftDays, day: DraftDay): DraftExercise[] {
  return exerciseIndexesOf(draft, day).map((index) => draft.exercises[index]);
}

export function placedInDay<Exercise extends DraftExercise>(
  draft: DraftDays,
  exercise: Exercise,
  day: DraftDay = lastDayOf(draft),
): Exercise {
  return day === 'second' && draft.secondDay != null ? { ...exercise, inSecondDay: true } : exercise;
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
  if (exercises.reduce((count, exercise) => count + exercise.sets.length, 0) > roomForSets(draft))
    return { draft, skippedExerciseIds: [] };
  const secondDay = {
    sessionId,
    program: draftProgramOf(day),
    programLabel: programLabelFor(day.programName, day.dayName),
  };
  const withDay = { ...draft, secondDay };
  const added = exercises.map((exercise) => placedInDay(withDay, exercise, 'second'));
  return { draft: { ...withDay, exercises: [...draft.exercises, ...added] }, skippedExerciseIds };
}

export function canRemoveSecondDay(draft: WorkoutDraft): boolean {
  return draft.secondDay != null && draft.secondDay.sent !== true && draft.finishedAt === null;
}

export function withDaysSent(draft: WorkoutDraft): WorkoutDraft {
  return draft.secondDay == null ? draft : { ...draft, secondDay: { ...draft.secondDay, sent: true } };
}

export function withoutSecondDay(draft: WorkoutDraft): { draft: WorkoutDraft; removed: RemovedSecondDay | null } {
  if (!canRemoveSecondDay(draft) || draft.secondDay == null) return { draft, removed: null };
  return {
    draft: { ...draft, secondDay: null, exercises: exercisesOf(draft, 'first') },
    removed: { fromSessionId: draft.sessionId, secondDay: draft.secondDay, exercises: exercisesOf(draft, 'second') },
  };
}

export function restoreSecondDay(draft: WorkoutDraft, removed: RemovedSecondDay): WorkoutDraft {
  if (draft.sessionId !== removed.fromSessionId || !canAddSecondDay(draft)) return draft;
  if (draft.program?.enrollmentId !== removed.secondDay.program.enrollmentId) return draft;
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
