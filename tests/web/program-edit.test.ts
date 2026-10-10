import { describe, expect, it } from 'vitest';
import {
  addDay,
  addPlannedExercise,
  canAddDay,
  canAddPlannedExercise,
  changePlannedExercise,
  changeProgression,
  DEFAULT_INCREMENT,
  docFor,
  isPlannableExercise,
  MAX_DAYS,
  MAX_EXERCISES_PER_DAY,
  moveDay,
  movePlannedExercise,
  nameIssue,
  pairedIncrement,
  progressionIssue,
  newProgramDoc,
  removeDay,
  removePlannedExercise,
  renameDay,
  targetIssue,
  trimmedDoc,
} from '../../web/src/features/programs/program-edit.ts';
import type { CardioExercise, LiftExercise, LoadType } from '../../web/src/lib/catalog-rules.ts';
import type { Program, ProgramDoc } from '../../web/src/lib/programs.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const planned = (exerciseId: string) => ({
  exerciseId,
  targetSets: 3,
  targetRepsMin: 8,
  targetRepsMax: 12,
  progression: { kind: 'none' } as const,
});

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

describe('isPlannableExercise', () => {
  const base = { equipment: 'barbell', custom: false, archived: false, skillShares: [] };
  const lift = (overrides: Partial<LiftExercise>): LiftExercise => ({
    ...base,
    id: 'bench',
    key: 'barbell_bench_press',
    name: 'Barbell Bench Press',
    modality: 'lift',
    loadType: 'external',
    ...overrides,
  });
  const running: CardioExercise = {
    ...base,
    id: 'running',
    key: 'running',
    name: 'Running',
    modality: 'cardio',
    activity: { paceUnit: 'per_km', referencePaceSPerKm: 300, maxEffort: 'hard', tracksDistance: true, shares: [] },
  };

  it('offers a rep lift', () => {
    expect(isPlannableExercise(lift({}))).toBe(true);
  });

  it('leaves out a timed hold and a carry, since a program plans sets of reps', () => {
    expect(isPlannableExercise(lift({ id: 'hang', key: 'dead_hang', loadType: 'bodyweight', measure: 'time' }))).toBe(
      false,
    );
    expect(isPlannableExercise(lift({ id: 'carry', key: 'farmers_carry', measure: 'distance' }))).toBe(false);
  });

  it('leaves out a cardio activity', () => {
    expect(isPlannableExercise(running)).toBe(false);
  });
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

describe('progression', () => {
  const names: Record<string, string> = { bench: 'Bench Press', row: 'Barbell Row', squat: 'Back Squat' };
  const nameOf = (exerciseId: string) => names[exerciseId] ?? 'Unknown exercise';
  const loadTypes: Record<string, LoadType> = { bench: 'external', row: 'external', squat: 'external' };
  const loadTypeOf = (exerciseId: string): LoadType | null => loadTypes[exerciseId] ?? null;

  it('adds weight by 2.5 kg or 5 lb unless told otherwise', () => {
    expect(DEFAULT_INCREMENT).toEqual({ kg: 2.5, lb: 5 });
  });

  it('switches to add weight with the default increment and one rep target from reps min', () => {
    const linear = changeProgression(doc, 1, 0, 'linear');
    expect(linear.days[1].exercises[0]).toEqual({
      ...planned('squat'),
      targetRepsMin: 8,
      targetRepsMax: 8,
      progression: { kind: 'linear', incrementKg: 2.5, incrementLb: 5 },
    });
    expect(linear.days[0]).toBe(doc.days[0]);
  });

  it('drops the increment when it switches away from add weight', () => {
    const linear = changeProgression(doc, 1, 0, 'linear');
    expect(changeProgression(linear, 1, 0, 'fixed').days[1].exercises[0].progression).toEqual({ kind: 'fixed' });
    expect(changeProgression(linear, 1, 0, 'none').days[1].exercises[0].progression).toEqual({ kind: 'none' });
  });

  it('keeps the increment when add weight is picked again', () => {
    const custom = changePlannedExercise(changeProgression(doc, 1, 0, 'linear'), 1, 0, {
      progression: { kind: 'linear', incrementKg: 5, incrementLb: 10 },
    });
    expect(changeProgression(custom, 1, 0, 'linear')).toEqual(custom);
  });

  it('accepts last weight on anything and weight targets on exercises with added weight', () => {
    expect(progressionIssue(doc, nameOf, loadTypeOf)).toBeNull();
    expect(progressionIssue(changeProgression(doc, 1, 0, 'linear'), nameOf, loadTypeOf)).toBeNull();
    expect(progressionIssue(changeProgression(doc, 1, 0, 'fixed'), nameOf, loadTypeOf)).toBeNull();
  });

  it('needs one rep target for add weight', () => {
    const ranged = changePlannedExercise(changeProgression(doc, 1, 0, 'linear'), 1, 0, { targetRepsMax: 10 });
    expect(progressionIssue(ranged, nameOf, loadTypeOf)).toBe('Back Squat on Lower: add weight needs one rep target.');
  });

  it('blocks a weight target on bodyweight exercises', () => {
    const bodyweightRow = (exerciseId: string): LoadType | null => (exerciseId === 'row' ? 'bodyweight' : 'external');
    for (const kind of ['fixed', 'linear'] as const) {
      expect(progressionIssue(changeProgression(doc, 0, 1, kind), nameOf, bodyweightRow)).toBe(
        'Barbell Row on Upper: only exercises with added weight can have a weight target.',
      );
    }
    const assisted = (exerciseId: string): LoadType | null => (exerciseId === 'row' ? 'bodyweight_plus' : 'external');
    expect(progressionIssue(changeProgression(doc, 0, 1, 'fixed'), nameOf, assisted)).toBe(
      'Barbell Row on Upper: only exercises with added weight can have a weight target.',
    );
  });
});

describe('pairedIncrement', () => {
  it('pairs the preset increments of each unit', () => {
    expect(pairedIncrement(1.25, 'kg')).toEqual({ kg: 1.25, lb: 2.5 });
    expect(pairedIncrement(2.5, 'kg')).toEqual({ kg: 2.5, lb: 5 });
    expect(pairedIncrement(5, 'kg')).toEqual({ kg: 5, lb: 10 });
    expect(pairedIncrement(2.5, 'lb')).toEqual({ kg: 1.25, lb: 2.5 });
    expect(pairedIncrement(5, 'lb')).toEqual({ kg: 2.5, lb: 5 });
    expect(pairedIncrement(10, 'lb')).toEqual({ kg: 5, lb: 10 });
  });

  it('converts a custom increment to the nearest 0.25 kg or 0.5 lb', () => {
    expect(pairedIncrement(3, 'kg')).toEqual({ kg: 3, lb: 6.5 });
    expect(pairedIncrement(7, 'lb')).toEqual({ kg: 3.25, lb: 7 });
    expect(pairedIncrement(0.25, 'kg')).toEqual({ kg: 0.25, lb: 0.5 });
    expect(pairedIncrement(0.5, 'lb')).toEqual({ kg: 0.25, lb: 0.5 });
  });

  it('keeps the paired increment within its allowed range', () => {
    expect(pairedIncrement(20, 'kg')).toEqual({ kg: 20, lb: 44 });
    expect(pairedIncrement(45, 'lb')).toEqual({ kg: 20, lb: 45 });
  });

  it('keeps a typed increment to two decimals', () => {
    expect(pairedIncrement(1.333, 'kg')).toEqual({ kg: 1.33, lb: 3 });
  });
});
