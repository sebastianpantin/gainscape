import { describe, expect, it } from 'vitest';
import {
  addCardioExercise,
  addSet,
  canSwapExercise,
  type CardioDraftExercise,
  type CatalogEntry,
  doneSetCount,
  type LiftDraftExercise,
  nextUpdatedAt,
  notDoneSetCount,
  parseStoredDraft,
  programLabelFor,
  removeSet,
  seedUntouchedSet,
  startDraftFromDay,
  swapExercise,
  toggleSetDone,
  updateSet,
  withCurrentLoadTypes,
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
    program: null,
    exercises: [
      {
        exerciseId: 'bench',
        name: 'Bench',
        modality: 'lift',
        loadType: 'external',
        target: null,
        sets: [
          {
            id: 'set-a',
            weightKg: 60,
            reps: 8,
            effort: { type: 'level', level: 'hard' },
            done: true,
            prescription: null,
          },
          { id: 'set-b', weightKg: 60, reps: 8, effort: null, done: false, prescription: null },
        ],
      },
      {
        exerciseId: 'row',
        name: 'Row',
        modality: 'lift',
        loadType: 'external',
        target: { sets: 3, repsMin: 8, repsMax: 12 },
        sets: [
          { id: 'set-c', weightKg: 50, reps: 10, effort: null, done: false, prescription: null },
          {
            id: 'set-d',
            weightKg: 50,
            reps: 10,
            effort: { type: 'level', level: 'easy' },
            done: true,
            prescription: null,
          },
          { id: 'set-e', weightKg: 55, reps: 9, effort: null, done: true, prescription: null },
        ],
      },
    ],
    ...overrides,
  };
}

function withoutModality(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'modality'));
}

function liftsOf(draft: WorkoutDraft | null | undefined): LiftDraftExercise[] {
  return (draft?.exercises ?? []).filter((exercise): exercise is LiftDraftExercise => exercise.modality === 'lift');
}

describe('parseStoredDraft', () => {
  it('accepts a v4 draft for the same user', () => {
    const raw = { v: 4, kind: 'draft', userId, updatedAt: 5, draft: workout() };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it('accepts a v4 tombstone for the same user', () => {
    const raw = { v: 4, kind: 'synced', userId, updatedAt: 6, syncedSessionId: workout().sessionId };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it('upgrades a v3 draft, marking every exercise as a lift', () => {
    const v3Draft = {
      ...workout(),
      exercises: workout().exercises.map(withoutModality),
    };
    const upgraded = parseStoredDraft({ v: 3, kind: 'draft', userId, updatedAt: 5, draft: v3Draft }, userId);
    expect(upgraded).toEqual({ v: 4, kind: 'draft', userId, updatedAt: 5, draft: workout() });
  });

  it('upgrades a v3 tombstone', () => {
    const raw = { v: 3, kind: 'synced', userId, updatedAt: 6, syncedSessionId: workout().sessionId };
    expect(parseStoredDraft(raw, userId)).toEqual({ ...raw, v: 4 });
  });

  it('upgrades a v2 draft, turning effortLevel into an effort input', () => {
    const v2Sets = [
      { id: 'set-a', weightKg: 60, reps: 8, effortLevel: 'hard', done: true },
      { id: 'set-b', weightKg: 60, reps: 8, effortLevel: null, done: false },
    ];
    const v2Exercise = withoutModality(workout().exercises[0]);
    const v2Draft = { ...workout(), exercises: [{ ...v2Exercise, sets: v2Sets }] };
    const upgraded = parseStoredDraft({ v: 2, kind: 'draft', userId, updatedAt: 5, draft: v2Draft }, userId);
    expect(upgraded).toEqual({
      v: 4,
      kind: 'draft',
      userId,
      updatedAt: 5,
      draft: { ...workout(), exercises: [workout().exercises[0]] },
    });
  });

  it('upgrades a v2 tombstone', () => {
    const raw = { v: 2, kind: 'synced', userId, updatedAt: 6, syncedSessionId: workout().sessionId };
    expect(parseStoredDraft(raw, userId)).toEqual({ ...raw, v: 4 });
  });

  it('drops an unknown v2 effort level instead of inventing one', () => {
    const v2Draft = {
      ...workout(),
      exercises: [
        { ...workout().exercises[0], sets: [{ id: 'x', weightKg: 60, reps: 8, effortLevel: 'max', done: true }] },
      ],
    };
    const upgraded = parseStoredDraft({ v: 2, kind: 'draft', userId, updatedAt: 5, draft: v2Draft }, userId);
    expect(upgraded?.kind === 'draft' && upgraded.draft.exercises[0].sets[0].effort).toBeNull();
  });

  it.each([
    [{ type: 'rir', value: 11 }],
    [{ type: 'rpe', value: 4 }],
    [{ type: 'rpe', value: 8.25 }],
    [{ type: 'level', level: 'max' }],
    [{ type: 'cardio', level: 'hard' }],
    [{ type: 'mystery' }],
    ['hard'],
  ])('replaces a malformed stored effort %j with no effort instead of crashing', (effort) => {
    const broken = {
      ...workout(),
      exercises: [{ ...workout().exercises[0], sets: [{ id: 'x', weightKg: 60, reps: 8, effort, done: true }] }],
    };
    const parsed = parseStoredDraft({ v: 4, kind: 'draft', userId, updatedAt: 5, draft: broken }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.exercises[0].sets[0].effort).toBeNull();
  });

  it('keeps valid RIR and RPE efforts', () => {
    const sets = [
      { id: 'r', weightKg: 60, reps: 8, effort: { type: 'rir', value: 2 }, done: true },
      { id: 'p', weightKg: 60, reps: 8, effort: { type: 'rpe', value: 8.5 }, done: true },
    ];
    const draft = { ...workout(), exercises: [{ ...workout().exercises[0], sets }] };
    const parsed = parseStoredDraft({ v: 4, kind: 'draft', userId, updatedAt: 5, draft }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.exercises[0].sets.map((set) => set.effort)).toEqual([
      { type: 'rir', value: 2 },
      { type: 'rpe', value: 8.5 },
    ]);
  });

  it('rejects unknown future versions', () => {
    expect(parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 5, draft: workout() }, userId)).toBeNull();
  });

  it('rejects a record that belongs to another user', () => {
    const raw = { v: 4, kind: 'draft', userId: 'someone-else', updatedAt: 5, draft: workout() };
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
    expect(liftsOf(swapped)[0].sets.map((set) => set.weightKg)).toEqual([0, 0]);
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

  it('seeds a set with last session values only while it is untouched', () => {
    const empty = workout({ exercises: [{ ...liftsOf(planned)[0], sets: [] }] });
    const added = addSet(empty, 0);
    const original = liftsOf(added)[0].sets[0];
    const seed = { weightKg: 72.5, reps: 6 };
    const seeded = seedUntouchedSet(added, 0, original, seed);
    expect(liftsOf(seeded)[0].sets[0]).toEqual({ ...original, ...seed });

    const edited = updateSet(added, 0, original.id, { reps: 3 });
    expect(seedUntouchedSet(edited, 0, original, seed)).toBe(edited);
    const removed = removeSet(added, 0, original.id);
    expect(seedUntouchedSet(removed, 0, original, seed)).toBe(removed);
  });

  it('seeds the first set of an exercise and copies the previous set after that', () => {
    const empty = workout({ exercises: [{ ...liftsOf(planned)[0], sets: [] }] });
    const seeded = addSet(empty, 0, { weightKg: 72.5, reps: 6 });
    expect(liftsOf(seeded)[0].sets.map(({ weightKg, reps }) => [weightKg, reps])).toEqual([[72.5, 6]]);
    const next = addSet(seeded, 0, { weightKg: 100, reps: 1 });
    expect(liftsOf(next)[0].sets.map(({ weightKg, reps }) => [weightKg, reps])).toEqual([
      [72.5, 6],
      [72.5, 6],
    ]);
  });
});

function cardioExercise(overrides: Partial<CardioDraftExercise> = {}): CardioDraftExercise {
  return {
    exerciseId: 'run',
    name: 'Running',
    modality: 'cardio',
    activity: {
      paceUnit: 'per_km',
      referencePaceSPerKm: 360,
      maxEffort: 'max',
      shares: [{ skillKey: 'endurance', shareBasisPoints: 10_000 }],
    },
    sets: [
      {
        id: 'bout-a',
        kind: 'cardio',
        durationS: 1800,
        distanceM: 5000,
        interval: null,
        effort: { type: 'cardio', level: 'moderate' },
        done: true,
      },
      {
        id: 'bout-b',
        kind: 'cardio',
        durationS: 1800,
        distanceM: null,
        interval: { workS: 30, restS: 30, rounds: 10 },
        effort: null,
        done: true,
      },
      {
        id: 'bout-c',
        kind: 'cardio',
        durationS: 600,
        distanceM: null,
        interval: null,
        effort: null,
        done: false,
      },
    ],
    ...overrides,
  };
}

function mixedWorkout(): WorkoutDraft {
  return workout({ exercises: [cardioExercise(), ...workout().exercises] });
}

describe('cardio drafts', () => {
  it('keeps cardio bouts through a parse', () => {
    const raw = { v: 4, kind: 'draft', userId, updatedAt: 5, draft: mixedWorkout() };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it.each([
    [{ type: 'level', level: 'hard' }],
    [{ type: 'rir', value: 2 }],
    [{ type: 'cardio', level: 'extreme' }],
    ['moderate'],
  ])('replaces an invalid cardio effort %j with no effort', (effort) => {
    const [bout] = cardioExercise().sets;
    const broken = workout({ exercises: [cardioExercise({ sets: [{ ...bout, effort } as typeof bout] })] });
    const parsed = parseStoredDraft({ v: 4, kind: 'draft', userId, updatedAt: 5, draft: broken }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.exercises[0].sets[0].effort).toBeNull();
  });

  it('removes one set or bout by id from the chosen exercise only', () => {
    const draft = mixedWorkout();
    const withoutBout = removeSet(draft, 0, 'bout-b');
    expect(withoutBout.exercises[0].sets.map((set) => set.id)).toEqual(['bout-a', 'bout-c']);
    expect(withoutBout.exercises.slice(1)).toEqual(draft.exercises.slice(1));
    const withoutSet = removeSet(draft, 1, 'set-a');
    expect(withoutSet.exercises[1].sets.map((set) => set.id)).toEqual(['set-b']);
    expect(removeSet(draft, 2, 'set-a')).toEqual(draft);
  });

  it('toggles a bout done like a set', () => {
    const toggled = toggleSetDone(mixedWorkout(), 0, 'bout-c');
    expect(toggled.exercises[0].sets.map((set) => set.done)).toEqual([true, true, true]);
  });

  it('keeps every valid cardio effort level', () => {
    const [bout] = cardioExercise().sets;
    const levels = ['easy', 'moderate', 'hard', 'max'] as const;
    const sets = levels.map((level, index) => ({ ...bout, id: `bout-${index}`, effort: { type: 'cardio', level } }));
    const draft = workout({ exercises: [cardioExercise({ sets: sets as CardioDraftExercise['sets'] })] });
    const parsed = parseStoredDraft({ v: 4, kind: 'draft', userId, updatedAt: 5, draft }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.exercises[0].sets.map((set) => set.effort)).toEqual(
      levels.map((level) => ({ type: 'cardio', level })),
    );
  });

  it('adds a cardio exercise with one steady 30-minute bout that is done', () => {
    const empty = workout({ exercises: [] });
    const { activity } = cardioExercise();
    const added = addSet(addCardioExercise(empty, 'run', 'Running', activity), 0);
    expect(added.exercises[0]).toMatchObject({ exerciseId: 'run', name: 'Running', modality: 'cardio', activity });
    expect(added.exercises[0].sets).toEqual([
      {
        id: expect.any(String),
        kind: 'cardio',
        durationS: 1800,
        distanceM: null,
        interval: null,
        effort: null,
        done: true,
      },
    ]);
  });

  it('copies the previous bout when adding another, with a fresh id', () => {
    const intervals = cardioExercise({ sets: [cardioExercise().sets[1]] });
    const added = addSet(workout({ exercises: [intervals] }), 0);
    const [previous, copy] = added.exercises[0].sets;
    expect(copy).toEqual({ ...previous, id: expect.any(String), done: true });
    expect(copy.id).not.toBe(previous.id);
  });

  it('counts done and planned bouts like sets', () => {
    expect(doneSetCount(mixedWorkout())).toBe(5);
    expect(notDoneSetCount(mixedWorkout())).toBe(3);
  });

  it('leaves cardio exercises alone when checking load types', () => {
    const checked = withCurrentLoadTypes(mixedWorkout(), new Map([['run', 'bodyweight']]));
    expect(checked).toEqual({ draft: mixedWorkout(), changedNames: [] });
  });

  it('refuses to swap a cardio exercise for a lift', () => {
    const planned = workout({ exercises: [cardioExercise({ sets: [] })] });
    expect(canSwapExercise(planned, 0)).toBe(false);
    expect(swapExercise(planned, 0, { id: 'dip', name: 'Dip', loadType: 'bodyweight' })).toBeNull();
  });
});

describe('completeSessionPayload with cardio', () => {
  it('sends a steady bout with its duration and distance', () => {
    const payload = completeSessionPayload(mixedWorkout());
    expect(payload.sets[0]).toEqual({
      kind: 'cardio',
      id: 'bout-a',
      exerciseId: 'run',
      position: 0,
      durationS: 1800,
      distanceM: 5000,
      interval: null,
      effort: { type: 'cardio', level: 'moderate' },
    });
  });

  it('never sends durationS for an interval bout', () => {
    const payload = completeSessionPayload(mixedWorkout());
    expect(payload.sets[1]).toEqual({
      kind: 'cardio',
      id: 'bout-b',
      exerciseId: 'run',
      position: 1,
      distanceM: null,
      interval: { workS: 30, restS: 30, rounds: 10 },
      effort: null,
    });
  });

  it('numbers lifts after the bouts and leaves planned bouts out', () => {
    const payload = completeSessionPayload(mixedWorkout());
    expect(payload.sets.map((set) => [set.id, set.position])).toEqual([
      ['bout-a', 0],
      ['bout-b', 1],
      ['set-a', 2],
      ['set-d', 3],
      ['set-e', 4],
    ]);
  });
});
