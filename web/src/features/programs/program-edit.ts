import type { LoadType } from '../../lib/catalog-rules.ts';
import { nameProblem, trimmedName } from '../../lib/names.ts';
import type { UnitPref } from '../../lib/profile-rules.ts';
import type { Program, ProgramDoc } from '../../lib/programs.ts';
import { moved } from '../../lib/reorder.ts';
import { KG_PER_LB } from '../../lib/units.ts';
import { roundTo } from '@domain/math.ts';
import { type PlannedExercise, type ProgressionKind, updateExerciseAt } from '../../offline/draft-format.ts';

type EditorDay = ProgramDoc['days'][number];

export const PROGRAM_NAME_MAX_LENGTH = 60;
export const DAY_NAME_MAX_LENGTH = 40;
export const MAX_DAYS = 14;
export const MAX_EXERCISES_PER_DAY = 20;
export const TARGET_SETS_RANGE = { lowest: 1, highest: 10 } as const;
export const TARGET_REPS_RANGE = { lowest: 1, highest: 100 } as const;

const DEFAULT_TARGET = { targetSets: 3, targetRepsMin: 8, targetRepsMax: 12, progression: { kind: 'none' } } as const;

export type Increment = Record<UnitPref, number>;

export const INCREMENT_PRESETS: readonly Increment[] = [
  { kg: 1.25, lb: 2.5 },
  { kg: 2.5, lb: 5 },
  { kg: 5, lb: 10 },
];
export const DEFAULT_INCREMENT: Increment = INCREMENT_PRESETS[1];
export const INCREMENT_RANGE: Record<UnitPref, { lowest: number; highest: number }> = {
  kg: { lowest: 0.25, highest: 20 },
  lb: { lowest: 0.5, highest: 45 },
};
export const INCREMENT_STEP: Increment = { kg: 0.25, lb: 0.5 };
const INCREMENT_DECIMALS = 2;

export function newProgramDoc(programId: string, dayId: string): ProgramDoc {
  return { id: programId, name: 'My program', days: [{ id: dayId, name: 'Day 1', exercises: [] }] };
}

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

export function canAddPlannedExercise(day: EditorDay): boolean {
  return day.exercises.length < MAX_EXERCISES_PER_DAY;
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

export function changeProgression(
  doc: ProgramDoc,
  dayIndex: number,
  exerciseIndex: number,
  kind: ProgressionKind,
): ProgramDoc {
  return updateDayAt(doc, dayIndex, (day) =>
    updateExerciseAt(day, exerciseIndex, (exercise): PlannedExercise => {
      if (kind !== 'linear') return { ...exercise, progression: { kind } };
      if (exercise.progression.kind === 'linear') return exercise;
      return {
        ...exercise,
        targetRepsMax: exercise.targetRepsMin,
        progression: { kind, incrementKg: DEFAULT_INCREMENT.kg, incrementLb: DEFAULT_INCREMENT.lb },
      };
    }),
  );
}

export function pairedIncrement(value: number, unit: UnitPref): Increment {
  const typed = roundTo(INCREMENT_DECIMALS, value);
  const preset = INCREMENT_PRESETS.find((candidate) => candidate[unit] === typed);
  if (preset) return { ...preset };
  const pairedUnit: UnitPref = unit === 'kg' ? 'lb' : 'kg';
  const converted = unit === 'kg' ? typed / KG_PER_LB : typed * KG_PER_LB;
  const step = INCREMENT_STEP[pairedUnit];
  const { lowest, highest } = INCREMENT_RANGE[pairedUnit];
  const paired = Math.min(highest, Math.max(lowest, Math.round(converted / step) * step));
  return unit === 'kg' ? { kg: typed, lb: paired } : { kg: paired, lb: typed };
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

export function targetIssue(doc: ProgramDoc, nameOf: (exerciseId: string) => string): string | null {
  for (const day of doc.days) {
    const swapped = day.exercises.find((planned) => planned.targetRepsMin > planned.targetRepsMax);
    if (swapped) return `${nameOf(swapped.exerciseId)} on ${trimmedName(day.name)}: reps min can't be above reps max.`;
  }
  return null;
}

export function progressionIssue(
  doc: ProgramDoc,
  nameOf: (exerciseId: string) => string,
  loadTypeOf: (exerciseId: string) => LoadType | null,
): string | null {
  for (const day of doc.days) {
    for (const planned of day.exercises) {
      const where = `${nameOf(planned.exerciseId)} on ${trimmedName(day.name)}`;
      const loadType = loadTypeOf(planned.exerciseId);
      if (planned.progression.kind !== 'none' && loadType !== null && loadType !== 'external')
        return `${where}: only exercises with added weight can have a weight target.`;
      if (planned.progression.kind === 'linear' && planned.targetRepsMin !== planned.targetRepsMax)
        return `${where}: add weight needs one rep target.`;
    }
  }
  return null;
}

export function trimmedDoc(doc: ProgramDoc): ProgramDoc {
  return {
    ...doc,
    name: trimmedName(doc.name),
    days: doc.days.map((day) => ({ ...day, name: trimmedName(day.name) })),
  };
}
