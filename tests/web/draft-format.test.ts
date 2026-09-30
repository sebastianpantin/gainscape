import { describe, expect, it } from 'vitest';
import {
  addSet,
  canSwapExercise,
  type CatalogEntry,
  doneSetCount,
  nextUpdatedAt,
  notDoneSetCount,
  parseStoredDraft,
  startDraftFromDay,
  swapExercise,
  toggleSetDone,
  updateSet,
  type WorkoutDraft,
} from '../../web/src/offline/draft-format.ts';
import { completeSessionPayload } from '../../web/src/offline/session-payload.ts';

const userId = '11111111-1111-4111-8111-111111111111';

function workout(overrides: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return {
    sessionId: '22222222-2222-4222-8222-222222222222',
    startedAt: '2026-09-30T10:00:00.000Z',
    finishedAt: '2026-09-30T11:00:00.000Z',
    programDayId: null,
    programLabel: null,
    exercises: [
      {
        exerciseId: 'bench',
        name: 'Bench',
        loadType: 'external',
        target: null,
        sets: [
          { id: 'set-a', weightKg: 60, reps: 8, effortLevel: 'hard', done: true },
          { id: 'set-b', weightKg: 60, reps: 8, effortLevel: null, done: false },
        ],
      },
      {
        exerciseId: 'row',
        name: 'Row',
        loadType: 'external',
        target: { sets: 3, repsMin: 8, repsMax: 12 },
        sets: [
          { id: 'set-c', weightKg: 50, reps: 10, effortLevel: null, done: false },
          { id: 'set-d', weightKg: 50, reps: 10, effortLevel: 'easy', done: true },
          { id: 'set-e', weightKg: 55, reps: 9, effortLevel: null, done: true },
        ],
      },
    ],
    ...overrides,
  };
}

describe('parseStoredDraft', () => {
  it('accepts a v2 draft for the same user', () => {
    const raw = { v: 2, kind: 'draft', userId, updatedAt: 5, draft: workout() };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it('accepts a v2 tombstone for the same user', () => {
    const raw = { v: 2, kind: 'synced', userId, updatedAt: 6, syncedSessionId: workout().sessionId };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it('rejects a record that belongs to another user', () => {
    const raw = { v: 2, kind: 'draft', userId: 'someone-else', updatedAt: 5, draft: workout() };
    expect(parseStoredDraft(raw, userId)).toBeNull();
  });

  it('rejects a v1 draft', () => {
    expect(parseStoredDraft({ v: 1, userId, draft: workout() }, userId)).toBeNull();
  });

  it.each([null, undefined, 'garbage', 42, [], {}, { v: 2, kind: 'draft', userId, updatedAt: 'soon', draft: {} }])(
    'rejects garbage %j',
    (raw) => {
      expect(parseStoredDraft(raw, userId)).toBeNull();
    },
  );
});

describe('nextUpdatedAt', () => {
  it('uses the clock when it is ahead of the last seen timestamp', () => {
    expect(nextUpdatedAt(100, 250)).toBe(250);
  });

  it('stays monotonic when the clock goes backwards', () => {
    expect(nextUpdatedAt(1_000, 400)).toBe(1_001);
    expect(nextUpdatedAt(1_001, 1_001)).toBe(1_002);
  });
});

describe('completeSessionPayload', () => {
  it('sends only done sets, numbered 0..n-1', () => {
    const payload = completeSessionPayload(workout());
    expect(payload.sets.map((set) => [set.id, set.position])).toEqual([
      ['set-a', 0],
      ['set-d', 1],
      ['set-e', 2],
    ]);
    expect(payload.sets[0]).toMatchObject({ exerciseId: 'bench', effort: { type: 'level', level: 'hard' } });
    expect(payload.sets[2]).toMatchObject({ exerciseId: 'row', weightKg: 55, reps: 9, effort: null });
  });

  it('sends a null programDayId for a freestyle workout', () => {
    expect(completeSessionPayload(workout()).programDayId).toBeNull();
  });

  it('sends the programDayId of a program workout', () => {
    const programDayId = '33333333-3333-4333-8333-333333333333';
    expect(completeSessionPayload(workout({ programDayId })).programDayId).toBe(programDayId);
  });
});

describe('startDraftFromDay', () => {
  const day = {
    id: '55555555-5555-4555-8555-555555555555',
    name: 'Upper',
    programName: 'My UL',
    exercises: [
      { exerciseId: 'bench', targetSets: 3, targetRepsMin: 6, targetRepsMax: 10 },
      { exerciseId: 'pullup', targetSets: 2, targetRepsMin: 5, targetRepsMax: 8 },
      { exerciseId: 'old', targetSets: 1, targetRepsMin: 10, targetRepsMax: 12 },
      { exerciseId: 'gone', targetSets: 2, targetRepsMin: 8, targetRepsMax: 12 },
      { exerciseId: 'dip', targetSets: 2, targetRepsMin: 8, targetRepsMax: 12 },
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
    expect(started.draft.exercises[0].target).toEqual({ sets: 3, repsMin: 6, repsMax: 10 });
    expect(started.draft.exercises.flatMap((exercise) => exercise.sets).every((set) => !set.done)).toBe(true);
    expect(doneSetCount(started.draft)).toBe(0);
    expect(notDoneSetCount(started.draft)).toBe(8);
  });

  it('carries the last logged weight, else 20 kg external or 0 for bodyweight, with reps at the target minimum', () => {
    const [bench, pullup, old, dip] = started.draft.exercises;
    expect(bench.sets.map((set) => [set.weightKg, set.reps])).toEqual([
      [72.5, 6],
      [72.5, 6],
      [72.5, 6],
    ]);
    expect(pullup.sets[0]).toMatchObject({ weightKg: 0, reps: 5 });
    expect(old.sets[0]).toMatchObject({ weightKg: 20, reps: 10 });
    expect(dip.sets[0]).toMatchObject({ weightKg: 0, reps: 8 });
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

describe('planned set editing', () => {
  const planned = startDraftFromDay(
    {
      id: 'day',
      name: 'Push',
      programName: 'PPL',
      exercises: [{ exerciseId: 'bench', targetSets: 2, targetRepsMin: 8, targetRepsMax: 12 }],
    },
    new Map<string, CatalogEntry>([['bench', { name: 'Bench', loadType: 'external', archived: false }]]),
    new Map(),
    new Date(),
  ).draft;
  const setId = planned.exercises[0].sets[0].id;

  it('lets the Done toggle undo itself', () => {
    const done = toggleSetDone(planned, 0, setId);
    expect(done.exercises[0].sets[0].done).toBe(true);
    expect(toggleSetDone(done, 0, setId).exercises[0].sets[0].done).toBe(false);
  });

  it('swaps an exercise with no done sets, keeping the target and set count and resetting weights', () => {
    const heavy = updateSet(planned, 0, setId, { weightKg: 100 });
    const swapped = swapExercise(heavy, 0, { id: 'dip', name: 'Dip', loadType: 'bodyweight' });
    expect(swapped?.exercises[0]).toMatchObject({
      exerciseId: 'dip',
      name: 'Dip',
      loadType: 'bodyweight',
      target: { sets: 2, repsMin: 8, repsMax: 12 },
    });
    expect(swapped?.exercises[0].sets.map((set) => set.weightKg)).toEqual([0, 0]);
  });

  it('refuses a swap once a set is done', () => {
    const done = toggleSetDone(planned, 0, setId);
    expect(canSwapExercise(done, 0)).toBe(false);
    expect(swapExercise(done, 0, { id: 'dip', name: 'Dip', loadType: 'bodyweight' })).toBeNull();
  });

  it('marks sets added with + Add set as done', () => {
    const added = addSet(planned, 0);
    expect(added.exercises[0].sets.at(-1)?.done).toBe(true);
  });
});
