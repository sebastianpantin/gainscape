import { type CatalogEntry, prescribedDayExercises, type PrescribedDayStart, programLabelFor } from './draft-starts.ts';
import { type DraftExercise, type DraftSecondDay, type WorkoutDraft } from './draft-format.ts';

export type DraftDay = 'first' | 'second';

export interface RemovedSecondDay {
  secondDay: DraftSecondDay;
  exercises: DraftExercise[];
}

const LABEL_SEPARATOR = ' — ';

export function canAddSecondDay(draft: WorkoutDraft): boolean {
  return draft.program != null && draft.secondDay == null && draft.challenge == null && draft.finishedAt === null;
}

export function exerciseDay(draft: WorkoutDraft, exerciseIndex: number): DraftDay {
  return draft.secondDay != null && draft.exercises[exerciseIndex]?.inSecondDay === true ? 'second' : 'first';
}

function samePosition(draft: WorkoutDraft, day: PrescribedDayStart): boolean {
  return JSON.stringify(draft.program?.position) === JSON.stringify(day.position);
}

export function withSecondDay(
  draft: WorkoutDraft,
  day: PrescribedDayStart,
  exercisesById: ReadonlyMap<string, CatalogEntry>,
  sessionId: string,
): { draft: WorkoutDraft; skippedExerciseIds: string[] } {
  if (!canAddSecondDay(draft) || draft.program?.enrollmentId !== day.enrollmentId || samePosition(draft, day))
    return { draft, skippedExerciseIds: [] };
  const { exercises, skippedExerciseIds } = prescribedDayExercises(day, exercisesById);
  return {
    draft: {
      ...draft,
      secondDay: {
        sessionId,
        program: { enrollmentId: day.enrollmentId, position: day.position, templateKey: day.templateKey },
        programLabel: programLabelFor(day.programName, day.dayName),
      },
      exercises: [...draft.exercises, ...exercises.map((exercise) => ({ ...exercise, inSecondDay: true }))],
    },
    skippedExerciseIds,
  };
}

export function withoutSecondDay(draft: WorkoutDraft): { draft: WorkoutDraft; removed: RemovedSecondDay | null } {
  if (draft.secondDay == null) return { draft, removed: null };
  return {
    draft: { ...draft, secondDay: null, exercises: draft.exercises.filter((exercise) => !exercise.inSecondDay) },
    removed: { secondDay: draft.secondDay, exercises: draft.exercises.filter((exercise) => exercise.inSecondDay) },
  };
}

export function restoreSecondDay(draft: WorkoutDraft, removed: RemovedSecondDay): WorkoutDraft {
  if (draft.secondDay != null || draft.finishedAt !== null) return draft;
  return { ...draft, secondDay: removed.secondDay, exercises: [...draft.exercises, ...removed.exercises] };
}

export function draftTitle(draft: WorkoutDraft): string | null {
  const first = draft.programLabel;
  const second = draft.secondDay?.programLabel;
  if (first === null || second === undefined) return first;
  const [programName, ...firstDay] = first.split(LABEL_SEPARATOR);
  const [secondProgram, ...secondDay] = second.split(LABEL_SEPARATOR);
  if (firstDay.length === 0 || secondProgram !== programName) return `${first} + ${second}`;
  return `${first} + ${secondDay.join(LABEL_SEPARATOR)}`;
}

interface SyncedDay {
  sessionId: string;
  programLinked: boolean;
  completedAt: string;
}

interface SyncedDays {
  kind: 'synced';
  summary: { programLinked: boolean; completedAt: string; days?: readonly SyncedDay[] };
}

interface SyncedDayDraft {
  draft: WorkoutDraft;
  outcome: { kind: 'synced'; summary: { programLinked: boolean; completedAt: string } };
}

function draftOfDay(draft: WorkoutDraft, day: DraftDay): WorkoutDraft {
  const inDay = draft.exercises.filter((exercise) => (exercise.inSecondDay === true) === (day === 'second'));
  if (day === 'first' || draft.secondDay == null) return { ...draft, secondDay: null, exercises: inDay };
  const { sessionId, program, programLabel } = draft.secondDay;
  return { ...draft, sessionId, program, programLabel, secondDay: null, exercises: inDay };
}

export function dayDrafts(draft: WorkoutDraft, outcome: SyncedDays): SyncedDayDraft[] {
  const { days } = outcome.summary;
  if (draft.secondDay == null || days === undefined)
    return [{ draft, outcome: { kind: 'synced', summary: outcome.summary } }];
  const byId = new Map(days.map((day) => [day.sessionId, day]));
  return (['first', 'second'] as const).flatMap((day) => {
    const dayDraft = draftOfDay(draft, day);
    const synced = byId.get(dayDraft.sessionId);
    if (synced === undefined) return [];
    const { programLinked, completedAt } = synced;
    return [{ draft: dayDraft, outcome: { kind: 'synced' as const, summary: { programLinked, completedAt } } }];
  });
}
