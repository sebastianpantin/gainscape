import { describe, expect, it } from 'vitest';
import {
  addDay,
  addPlannedExercise,
  canAddDay,
  canAddPlannedExercise,
  changePlannedExercise,
  docFor,
  MAX_DAYS,
  MAX_EXERCISES_PER_DAY,
  moveDay,
  movePlannedExercise,
  nameIssue,
  newProgramDoc,
  removeDay,
  removePlannedExercise,
  renameDay,
  targetIssue,
  trimmedDoc,
} from '../../web/src/features/programs/program-edit.ts';
import type { Program, ProgramDoc } from '../../web/src/lib/programs.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const planned = (exerciseId: string) => ({ exerciseId, targetSets: 3, targetRepsMin: 8, targetRepsMax: 12 });

const doc: ProgramDoc = {
  id: 'program-1',
  name: 'Upper Lower',
  days: [
    { id: 'day-a', name: 'Upper', exercises: [planned('bench'), planned('row')] },
    { id: 'day-b', name: 'Lower', exercises: [planned('squat')] },
  ],
};

const program = (overrides: Partial<Program>): Program => ({
  id: 'program-1',
  key: null,
  name: 'Upper Lower',
  ownerUserId: userId,
  copiedFromId: null,
  days: doc.days.map((day, position) => ({ ...day, position })),
  ...overrides,
});

describe('docFor', () => {
  it('builds an editable doc from an owned program', () => {
    expect(docFor([program({})], userId, 'program-1')).toEqual(doc);
  });

  it('refuses templates, programs of others and unknown or unloaded programs', () => {
    expect(docFor([program({ ownerUserId: null })], userId, 'program-1')).toBeNull();
    expect(docFor([program({ ownerUserId: 'someone-else' })], userId, 'program-1')).toBeNull();
    expect(docFor([program({})], userId, 'program-2')).toBeNull();
    expect(docFor(null, userId, 'program-1')).toBeNull();
  });
});

describe('newProgramDoc', () => {
  it('starts a program from scratch with one empty day called Day 1', () => {
    expect(newProgramDoc('program-new', 'day-new')).toEqual({
      id: 'program-new',
      name: 'My program',
      days: [{ id: 'day-new', name: 'Day 1', exercises: [] }],
    });
  });

  it('starts with names that pass the name checks', () => {
    expect(nameIssue(newProgramDoc('program-new', 'day-new'))).toBeNull();
  });
});

describe('day changes', () => {
  it('renames, moves and removes days', () => {
    expect(renameDay(doc, 1, 'Legs').days.map((day) => day.name)).toEqual(['Upper', 'Legs']);
    expect(moveDay(doc, 1, -1).days.map((day) => day.id)).toEqual(['day-b', 'day-a']);
    expect(removeDay(doc, 0).days.map((day) => day.id)).toEqual(['day-b']);
  });

  it('adds a numbered empty day up to the limit', () => {
    const added = addDay(doc, 'day-c');
    expect(added.days.at(-1)).toEqual({ id: 'day-c', name: 'Day 3', exercises: [] });
    expect(canAddDay(doc)).toBe(true);
    const full = {
      ...doc,
      days: Array.from({ length: MAX_DAYS }, (_, index) => ({ ...doc.days[0], id: `d${index}` })),
    };
    expect(MAX_DAYS).toBe(14);
    expect(canAddDay(full)).toBe(false);
  });
});

describe('planned exercise changes', () => {
  it('changes the targets of one planned exercise only', () => {
    const changed = changePlannedExercise(doc, 0, 1, { targetSets: 5 });
    expect(changed.days[0].exercises.map((exercise) => exercise.targetSets)).toEqual([3, 5]);
    expect(changed.days[1]).toBe(doc.days[1]);
  });

  it('moves, removes and adds planned exercises with the default target', () => {
    expect(movePlannedExercise(doc, 0, 0, 1).days[0].exercises.map((e) => e.exerciseId)).toEqual(['row', 'bench']);
    expect(removePlannedExercise(doc, 0, 0).days[0].exercises.map((e) => e.exerciseId)).toEqual(['row']);
    expect(addPlannedExercise(doc, 1, 'deadlift').days[1].exercises.at(-1)).toEqual(planned('deadlift'));
  });

  it('adds planned exercises up to the limit a day holds', () => {
    const fullDay = {
      ...doc.days[0],
      exercises: Array.from({ length: MAX_EXERCISES_PER_DAY }, () => planned('bench')),
    };
    expect(MAX_EXERCISES_PER_DAY).toBe(20);
    expect(canAddPlannedExercise(doc.days[0])).toBe(true);
    expect(canAddPlannedExercise(fullDay)).toBe(false);
  });
});

describe('targets', () => {
  const names: Record<string, string> = { bench: 'Bench Press', row: 'Barbell Row', squat: 'Back Squat' };
  const nameOf = (exerciseId: string) => names[exerciseId] ?? 'Unknown exercise';

  it('accepts reps min up to reps max', () => {
    expect(targetIssue(doc, nameOf)).toBeNull();
    expect(targetIssue(changePlannedExercise(doc, 1, 0, { targetRepsMin: 12, targetRepsMax: 12 }), nameOf)).toBeNull();
  });

  it('names the first exercise whose reps min is above its reps max', () => {
    const swapped = changePlannedExercise(doc, 1, 0, { targetRepsMin: 12, targetRepsMax: 8 });
    expect(targetIssue(swapped, nameOf)).toBe("Back Squat on Lower: reps min can't be above reps max.");
  });
});

describe('names', () => {
  it('reports the first problem with the program name, then the day names', () => {
    expect(nameIssue(doc)).toBeNull();
    expect(nameIssue({ ...doc, name: ' ' })).toBe('Enter a name.');
    expect(nameIssue({ ...doc, name: 'x'.repeat(61) })).toBe('Names can be at most 60 characters.');
    expect(nameIssue(renameDay(doc, 1, 'x'.repeat(41)))).toBe('Names can be at most 40 characters.');
    expect(nameIssue(renameDay(doc, 0, 'x'.repeat(40)))).toBeNull();
  });

  it('trims the program and day names for saving', () => {
    const untrimmed = renameDay({ ...doc, name: '  Upper Lower ' }, 0, ' Upper ');
    expect(trimmedDoc(untrimmed)).toEqual(doc);
  });
});
