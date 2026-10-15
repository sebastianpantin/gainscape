import { describe, expect, it } from 'vitest';
import { doneSetCount, notDoneSetCount, toggleSetDone } from '../../web/src/offline/draft-edits.ts';
import {
  type CatalogEntry,
  type PlannedProgression,
  programLabelFor,
  startDraftFromDay,
} from '../../web/src/offline/draft-starts.ts';
import { completeSessionPayload } from '../../web/src/offline/session-payload.ts';
import { liftsOf } from './draft-fixtures.ts';

const NO_PROGRESSION = { kind: 'none' } as const;

describe('programLabelFor', () => {
  it('joins the program and day names with a dash', () => {
    expect(programLabelFor('Upper Lower', 'Upper A')).toBe('Upper Lower — Upper A');
  });
});

describe('startDraftFromDay', () => {
  const day = {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Upper',
    programName: 'My UL',
    exercises: [
      { exerciseId: 'bench', targetSets: 3, targetRepsMin: 6, targetRepsMax: 10, progression: NO_PROGRESSION },
      { exerciseId: 'pullup', targetSets: 2, targetRepsMin: 5, targetRepsMax: 8, progression: NO_PROGRESSION },
      { exerciseId: 'old', targetSets: 1, targetRepsMin: 10, targetRepsMax: 12, progression: NO_PROGRESSION },
      { exerciseId: 'gone', targetSets: 2, targetRepsMin: 8, targetRepsMax: 12, progression: NO_PROGRESSION },
      { exerciseId: 'dip', targetSets: 2, targetRepsMin: 8, targetRepsMax: 12, progression: NO_PROGRESSION },
    ],
  };
  const catalog = new Map<string, CatalogEntry>([
    ['bench', { name: 'Bench', loadType: 'external', archived: false }],
    ['pullup', { name: 'Pull-up', loadType: 'bodyweight', archived: false }],
    ['old', { name: 'Old Press', loadType: 'external', archived: true }],
    ['dip', { name: 'Weighted Dip', loadType: 'bodyweight_plus', archived: false }],
  ]);
  const lastSets = new Map([
    ['bench', { weightKg: 72.5, reps: 6 }],
    ['pullup', { weightKg: 0, reps: 9 }],
  ]);
  const started = startDraftFromDay(day, catalog, lastSets, new Date('2026-09-30T10:00:00.000Z'));

  it('labels the draft with the program day', () => {
    expect(started.draft).toMatchObject({
      programDayId: day.id,
      programLabel: 'My UL — Upper',
      startedAt: '2026-09-30T10:00:00.000Z',
      finishedAt: null,
    });
  });

  it('plans target.sets not-done sets per exercise with the target', () => {
    expect(started.draft.exercises.map((exercise) => exercise.sets.length)).toEqual([3, 2, 1, 2]);
    expect(liftsOf(started.draft)[0].target).toEqual({ sets: 3, repsMin: 6, repsMax: 10 });
    expect(
      started.draft.exercises.flatMap((exercise): { done: boolean }[] => exercise.sets).every((set) => !set.done),
    ).toBe(true);
    expect(doneSetCount(started.draft)).toBe(0);
    expect(notDoneSetCount(started.draft)).toBe(8);
  });

  it('carries the last logged weight, else 20 kg external or 0 for bodyweight, with reps at the target minimum', () => {
    const [bench, pullup, old, dip] = liftsOf(started.draft);
    expect(bench.sets.map((set) => [set.weightKg, set.reps])).toEqual([
      [72.5, 6],
      [72.5, 6],
      [72.5, 6],
    ]);
    expect(pullup.sets[0]).toMatchObject({ weightKg: 0, reps: 5 });
    expect(old.sets[0]).toMatchObject({ weightKg: 20, reps: 10 });
    expect(dip.sets[0]).toMatchObject({ weightKg: 0, reps: 8 });
  });

  it('starts a day the same way whatever progression its exercises have', () => {
    const plainExercises = (progressions: PlannedProgression[]) =>
      liftsOf(
        startDraftFromDay(
          {
            ...day,
            exercises: day.exercises.map((planned, index) => ({
              ...planned,
              targetRepsMax: planned.targetRepsMin,
              progression: progressions[index % progressions.length],
            })),
          },
          catalog,
          lastSets,
          new Date('2026-09-30T10:00:00.000Z'),
        ).draft,
      ).map((exercise) => ({
        name: exercise.name,
        target: exercise.target,
        sets: exercise.sets.map((set) => ({ ...set, id: 'set' })),
      }));
    const linear: PlannedProgression = { kind: 'linear', incrementKg: 2.5, incrementLb: 5 };
    expect(plainExercises([linear, { kind: 'fixed' }])).toEqual(plainExercises([NO_PROGRESSION]));
  });

  it('labels archived exercises and skips missing ones', () => {
    expect(started.draft.exercises.map((exercise) => exercise.name)).toEqual([
      'Bench',
      'Pull-up',
      'Old Press (archived)',
      'Weighted Dip',
    ]);
    expect(started.skippedExerciseIds).toEqual(['gone']);
  });

  it('sends only the done sets and the day id', () => {
    const [bench] = started.draft.exercises;
    const oneDone = toggleSetDone(started.draft, 0, bench.sets[1].id);
    const payload = completeSessionPayload({ ...oneDone, finishedAt: '2026-09-30T11:00:00.000Z' });
    expect(payload.programDayId).toBe(day.id);
    expect(payload.sets.map((set) => [set.id, set.position])).toEqual([[bench.sets[1].id, 0]]);
  });
});
