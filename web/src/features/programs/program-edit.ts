import { nameProblem, trimmedName } from '../../lib/names.ts';
import type { Program, ProgramDoc } from '../../lib/programs.ts';
import { moved } from '../../lib/reorder.ts';
import { type PlannedExercise, updateExerciseAt } from '../../offline/draft-format.ts';

type EditorDay = ProgramDoc['days'][number];

export const PROGRAM_NAME_MAX_LENGTH = 60;
export const DAY_NAME_MAX_LENGTH = 40;
export const MAX_DAYS = 14;
export const TARGET_SETS_RANGE = { lowest: 1, highest: 10 } as const;
export const TARGET_REPS_RANGE = { lowest: 1, highest: 100 } as const;

const DEFAULT_TARGET = { targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 };

export function docFor(programs: readonly Program[] | null, userId: string, programId: string): ProgramDoc | null {
  const program = programs?.find((candidate) => candidate.id === programId);
  if (!program || program.ownerUserId !== userId) return null;
  return {
    id: program.id,
    name: program.name,
    days: program.days.map((day) => ({ id: day.id, name: day.name, exercises: day.exercises })),
  };
}

function updateDayAt(doc: ProgramDoc, dayIndex: number, update: (day: EditorDay) => EditorDay): ProgramDoc {
  return { ...doc, days: doc.days.map((day, index) => (index === dayIndex ? update(day) : day)) };
}

export function renameDay(doc: ProgramDoc, dayIndex: number, name: string): ProgramDoc {
  return updateDayAt(doc, dayIndex, (day) => ({ ...day, name }));
}

export function moveDay(doc: ProgramDoc, dayIndex: number, offset: -1 | 1): ProgramDoc {
  return { ...doc, days: moved(doc.days, dayIndex, offset) };
}

export function removeDay(doc: ProgramDoc, dayIndex: number): ProgramDoc {
  return { ...doc, days: doc.days.filter((_, index) => index !== dayIndex) };
}

export function canAddDay(doc: ProgramDoc): boolean {
  return doc.days.length < MAX_DAYS;
}

export function addDay(doc: ProgramDoc, dayId: string): ProgramDoc {
  return { ...doc, days: [...doc.days, { id: dayId, name: `Day ${doc.days.length + 1}`, exercises: [] }] };
}

export function changePlannedExercise(
  doc: ProgramDoc,
  dayIndex: number,
  exerciseIndex: number,
  changes: Partial<PlannedExercise>,
): ProgramDoc {
  return updateDayAt(doc, dayIndex, (day) =>
    updateExerciseAt(day, exerciseIndex, (exercise) => ({ ...exercise, ...changes })),
  );
}

export function movePlannedExercise(
  doc: ProgramDoc,
  dayIndex: number,
  exerciseIndex: number,
  offset: -1 | 1,
): ProgramDoc {
  return updateDayAt(doc, dayIndex, (day) => ({ ...day, exercises: moved(day.exercises, exerciseIndex, offset) }));
}

export function removePlannedExercise(doc: ProgramDoc, dayIndex: number, exerciseIndex: number): ProgramDoc {
  return updateDayAt(doc, dayIndex, (day) => ({
    ...day,
    exercises: day.exercises.filter((_, index) => index !== exerciseIndex),
  }));
}

export function addPlannedExercise(doc: ProgramDoc, dayIndex: number, exerciseId: string): ProgramDoc {
  return updateDayAt(doc, dayIndex, (day) => ({
    ...day,
    exercises: [...day.exercises, { exerciseId, ...DEFAULT_TARGET }],
  }));
}

export function nameIssue(doc: ProgramDoc): string | null {
  return (
    nameProblem(doc.name, PROGRAM_NAME_MAX_LENGTH) ??
    doc.days.map((day) => nameProblem(day.name, DAY_NAME_MAX_LENGTH)).find((issue) => issue !== null) ??
    null
  );
}

export function trimmedDoc(doc: ProgramDoc): ProgramDoc {
  return {
    ...doc,
    name: trimmedName(doc.name),
    days: doc.days.map((day) => ({ ...day, name: trimmedName(day.name) })),
  };
}
