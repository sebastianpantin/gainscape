import { describe, expect, it } from 'vitest';
import {
  addCardioExercise,
  addExercise,
  addSet,
  addWarmupSets,
  canSwapExercise,
  type CardioDraftExercise,
  type CatalogEntry,
  type DraftExercise,
  doneSetCount,
  firstWorkingSet,
  type LiftDraftExercise,
  type PlannedProgression,
  nextUpdatedAt,
  canQuickFill,
  fillWorkingSets,
  mostQuickFillSets,
  markPlannedSetsDone,
  notDoneSetCount,
  plannedSetsLeftToLifter,
  parseStoredDraft,
  discardedRecord,
  forgottenRecord,
  storableRecord,
  syncedRecord,
  programLabelFor,
  removeExercise,
  seedUntouchedSet,
  startDraftFromDay,
  swapExercise,
  toggleSetDone,
  withCurrentLoadTypes,
  withSessionRpe,
  type DraftSet,
  type WorkoutDraft,
} from '../../web/src/offline/draft-format.ts';
import { canAddSet, removeSet, updateSet } from '../../web/src/lib/exercise-edit-rules.ts';
import { completeSessionPayload } from '../../web/src/offline/session-payload.ts';
import { MAX_SETS_PER_SESSION } from '../../supabase/functions/_shared/domain/types.ts';

const userId = '11111111-1111-4111-8111-111111111111';

function workout(overrides: Partial<WorkoutDraft> = {}): WorkoutDraft {
  return {
    sessionId: '22222222-2222-4222-8222-222222222222',
    startedAt: '2026-09-30T10:00:00.000Z',
    finishedAt: '2026-09-30T11:00:00.000Z',
    programDayId: null,
    programLabel: null,
    program: null,
    challenge: null,
    exercises: [
      {
        clientId: 'card-bench',
        exerciseId: 'bench',
        name: 'Bench',
        modality: 'lift',
        loadType: 'external',
        target: null,
        supersetId: null,
        sets: [
          {
            id: 'set-a',
            weightKg: 60,
            reps: 8,
            effort: { type: 'level', level: 'hard' },
            done: true,
            isWarmup: false,
            prescription: null,
          },
          { id: 'set-b', weightKg: 60, reps: 8, effort: null, done: false, isWarmup: false, prescription: null },
        ],
      },
      {
        clientId: 'card-row',
        exerciseId: 'row',
        name: 'Row',
        modality: 'lift',
        loadType: 'external',
        target: { sets: 3, repsMin: 8, repsMax: 12 },
        supersetId: null,
        sets: [
          { id: 'set-c', weightKg: 50, reps: 10, effort: null, done: false, isWarmup: false, prescription: null },
          {
            id: 'set-d',
            weightKg: 50,
            reps: 10,
            effort: { type: 'level', level: 'easy' },
            done: true,
            isWarmup: false,
            prescription: null,
          },
          { id: 'set-e', weightKg: 55, reps: 9, effort: null, done: true, isWarmup: false, prescription: null },
        ],
      },
    ],
    ...overrides,
  };
}

function withoutModality(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'modality'));
}

function withoutSupersetId(value: object): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'supersetId'));
}

function liftsOf(draft: WorkoutDraft | null | undefined): LiftDraftExercise[] {
  return (draft?.exercises ?? []).filter((exercise): exercise is LiftDraftExercise => exercise.modality === 'lift');
}

describe('parseStoredDraft', () => {
  it('accepts a v5 draft for the same user', () => {
    const raw = { v: 5, kind: 'draft', userId, updatedAt: 5, draft: workout() };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it('accepts a v5 tombstone for the same user', () => {
    const raw = { v: 5, kind: 'synced', userId, updatedAt: 6, syncedSessionId: workout().sessionId };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it('accepts a discard tombstone for the same user', () => {
    const raw = { v: 5, kind: 'discarded', userId, updatedAt: 6, discardedSessionId: workout().sessionId };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
    expect(parseStoredDraft({ ...raw, discardedSessionId: 7 }, userId)).toBeNull();
  });

  it('stores discard and forget tombstones in the synced shape an older app version reads as occupied', () => {
    const sessionId = workout().sessionId;
    for (const tombstone of [discardedRecord(userId, 6, sessionId), forgottenRecord(userId, 6, sessionId)]) {
      const stored = storableRecord(tombstone);
      expect(stored).toMatchObject({ v: 5, kind: 'synced', userId, updatedAt: 6, syncedSessionId: sessionId });
      expect(parseStoredDraft(JSON.parse(JSON.stringify(stored)), userId)).toEqual(tombstone);
    }
    expect(storableRecord(syncedRecord(userId, 6, sessionId))).toEqual(syncedRecord(userId, 6, sessionId));
  });

  it('keeps a warm-up flag through a v5 parse', () => {
    const [bench, row] = liftsOf(workout());
    const warmup = { ...bench.sets[0], isWarmup: true };
    const draft = workout({ exercises: [{ ...bench, sets: [warmup, bench.sets[1]] }, row] });
    const parsed = parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 5, draft }, userId);
    expect(liftsOf(parsed?.kind === 'draft' ? parsed.draft : null)[0].sets.map((set) => set.isWarmup)).toEqual([
      true,
      false,
    ]);
  });

  it('keeps a session RPE through a v5 parse', () => {
    const raw = { v: 5, kind: 'draft', userId, updatedAt: 5, draft: workout({ sessionRpe: 8 }) };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it.each([0, 11, 6.5, '8', null])('reads a stored session RPE of %j as not rated', (sessionRpe) => {
    const raw = { v: 5, kind: 'draft', userId, updatedAt: 5, draft: { ...workout(), sessionRpe } };
    const parsed = parseStoredDraft(raw, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.sessionRpe).toBeNull();
  });

  it('upgrades a v4 draft, marking every lift set as a working set', () => {
    const v4Draft = {
      ...workout(),
      exercises: liftsOf(workout()).map((exercise) => ({
        ...exercise,
        sets: exercise.sets.map((set) => Object.fromEntries(Object.entries(set).filter(([key]) => key !== 'isWarmup'))),
      })),
    };
    const upgraded = parseStoredDraft({ v: 4, kind: 'draft', userId, updatedAt: 5, draft: v4Draft }, userId);
    expect(upgraded).toEqual({ v: 5, kind: 'draft', userId, updatedAt: 5, draft: workout() });
  });

  it('upgrades a v4 tombstone', () => {
    const raw = { v: 4, kind: 'synced', userId, updatedAt: 6, syncedSessionId: workout().sessionId };
    expect(parseStoredDraft(raw, userId)).toEqual({ ...raw, v: 5 });
  });

  it.each([['yes'], [1], [null]])('reads a malformed stored warm-up flag %j as a working set', (isWarmup) => {
    const broken = {
      ...workout(),
      exercises: [
        { ...workout().exercises[0], sets: [{ id: 'x', weightKg: 60, reps: 8, effort: null, done: true, isWarmup }] },
      ],
    };
    const parsed = parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 5, draft: broken }, userId);
    expect(liftsOf(parsed?.kind === 'draft' ? parsed.draft : null)[0].sets[0].isWarmup).toBe(false);
  });

  it('upgrades a v3 draft, marking every exercise as a lift', () => {
    const v3Draft = {
      ...workout(),
      exercises: workout().exercises.map(withoutModality),
    };
    const upgraded = parseStoredDraft({ v: 3, kind: 'draft', userId, updatedAt: 5, draft: v3Draft }, userId);
    expect(upgraded).toEqual({ v: 5, kind: 'draft', userId, updatedAt: 5, draft: workout() });
  });

  it('upgrades a v3 tombstone', () => {
    const raw = { v: 3, kind: 'synced', userId, updatedAt: 6, syncedSessionId: workout().sessionId };
    expect(parseStoredDraft(raw, userId)).toEqual({ ...raw, v: 5 });
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
      v: 5,
      kind: 'draft',
      userId,
      updatedAt: 5,
      draft: { ...workout(), exercises: [workout().exercises[0]] },
    });
  });

  it('upgrades a v2 tombstone', () => {
    const raw = { v: 2, kind: 'synced', userId, updatedAt: 6, syncedSessionId: workout().sessionId };
    expect(parseStoredDraft(raw, userId)).toEqual({ ...raw, v: 5 });
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
    const parsed = parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 5, draft: broken }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.exercises[0].sets[0].effort).toBeNull();
  });

  it('keeps valid RIR and RPE efforts', () => {
    const sets = [
      { id: 'r', weightKg: 60, reps: 8, effort: { type: 'rir', value: 2 }, done: true },
      { id: 'p', weightKg: 60, reps: 8, effort: { type: 'rpe', value: 8.5 }, done: true },
    ];
    const draft = { ...workout(), exercises: [{ ...workout().exercises[0], sets }] };
    const parsed = parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 5, draft }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.exercises[0].sets.map((set) => set.effort)).toEqual([
      { type: 'rir', value: 2 },
      { type: 'rpe', value: 8.5 },
    ]);
  });

  describe('superset groups', () => {
    function parsedLifts(exercises: unknown[]): LiftDraftExercise[] {
      const raw = { v: 5, kind: 'draft', userId, updatedAt: 5, draft: { ...workout(), exercises } };
      const parsed = parseStoredDraft(raw, userId);
      return liftsOf(parsed?.kind === 'draft' ? parsed.draft : null);
    }

    function bareLift(exerciseId: string, supersetId?: unknown): Record<string, unknown> {
      const base = { exerciseId, name: exerciseId, modality: 'lift', loadType: 'external', target: null, sets: [] };
      return supersetId === undefined ? base : { ...base, supersetId };
    }

    it('gives a v5 draft without supersetId a null supersetId on every lift', () => {
      const [bench, row] = liftsOf(workout());
      const stored = [bench, row].map(withoutSupersetId);
      const parsed = parseStoredDraft(
        { v: 5, kind: 'draft', userId, updatedAt: 5, draft: { ...workout(), exercises: stored } },
        userId,
      );
      expect(parsed).toMatchObject({ v: 5 });
      expect(liftsOf(parsed?.kind === 'draft' ? parsed.draft : null).map((lift) => lift.supersetId)).toEqual([
        null,
        null,
      ]);
    });

    it('keeps a group of adjacent lifts', () => {
      expect(
        parsedLifts([bareLift('a', 'g'), bareLift('b', 'g'), bareLift('c', 'h')]).map((l) => l.supersetId),
      ).toEqual(['g', 'g', null]);
    });

    it('resets a group with one member', () => {
      expect(parsedLifts([bareLift('a', 'g'), bareLift('b', null)]).map((l) => l.supersetId)).toEqual([null, null]);
    });

    it('resets every member of an id that repeats without being adjacent', () => {
      const lifts = parsedLifts([bareLift('a', 'g'), bareLift('b', 'g'), bareLift('c', null), bareLift('d', 'g')]);
      expect(lifts.map((l) => l.supersetId)).toEqual([null, null, null, null]);
    });

    it.each([7, true, {}, ['g']])('reads a supersetId of %j as null', (supersetId) => {
      expect(parsedLifts([bareLift('a', supersetId), bareLift('b', supersetId)]).map((l) => l.supersetId)).toEqual([
        null,
        null,
      ]);
    });

    it('never groups a cardio exercise', () => {
      const cardioWithGroup = {
        exerciseId: 'run',
        name: 'Run',
        modality: 'cardio',
        activity: 'run',
        sets: [],
        supersetId: 'g',
      };
      const raw = {
        v: 5,
        kind: 'draft',
        userId,
        updatedAt: 5,
        draft: { ...workout(), exercises: [bareLift('a', 'g'), cardioWithGroup] },
      };
      const parsed = parseStoredDraft(raw, userId);
      const exercises = parsed?.kind === 'draft' ? parsed.draft.exercises : [];
      expect(exercises.map((exercise) => ('supersetId' in exercise ? exercise.supersetId : 'absent'))).toEqual([
        null,
        'absent',
      ]);
    });
  });

  describe('challenge', () => {
    const challenge = {
      challengeId: 'challenge-dl',
      name: 'Deadlift and Pull-up',
      definition: {
        kind: 'prescription',
        groups: [
          {
            rounds: 5,
            exercises: [
              { exerciseId: 'deadlift', reps: 5, pct: 70 },
              { exerciseId: 'pull_up', reps: 5, pct: null },
            ],
          },
        ],
      },
      targetLoadsKg: { deadlift: 100, pull_up: null },
    };

    function parsedChallenge(draft: object) {
      const parsed = parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 5, draft }, userId);
      return parsed?.kind === 'draft' ? parsed.draft.challenge : 'not parsed';
    }

    it('gives a v5 draft without a challenge a null challenge', () => {
      const withoutChallenge = Object.fromEntries(Object.entries(workout()).filter(([key]) => key !== 'challenge'));
      expect(parsedChallenge(withoutChallenge)).toBeNull();
    });

    it('keeps a challenge through a v5 parse', () => {
      expect(parsedChallenge({ ...workout(), challenge })).toEqual(challenge);
    });

    it.each([
      7,
      'deadlift',
      { ...challenge, challengeId: null },
      { ...challenge, definition: { kind: 'timed' } },
      { ...challenge, targetLoadsKg: [100] },
    ])('reads a malformed challenge %j as null', (malformed) => {
      expect(parsedChallenge({ ...workout(), challenge: malformed })).toBeNull();
    });
  });

  it('rejects unknown future versions', () => {
    expect(parseStoredDraft({ v: 7, kind: 'draft', userId, updatedAt: 5, draft: workout() }, userId)).toBeNull();
  });

  it('rejects a record that belongs to another user', () => {
    const raw = { v: 5, kind: 'draft', userId: 'someone-else', updatedAt: 5, draft: workout() };
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

  it('sends each set with its warm-up flag', () => {
    const [bench, row] = liftsOf(workout());
    const warmup = { ...bench.sets[0], isWarmup: true };
    const payload = completeSessionPayload(workout({ exercises: [{ ...bench, sets: [warmup] }, row] }));
    expect(payload.sets.map((set) => ('isWarmup' in set ? set.isWarmup : null))).toEqual([true, false, false]);
  });

  it('sends the start, the finish and the session RPE', () => {
    expect(completeSessionPayload(withSessionRpe(workout(), 9))).toMatchObject({
      startedAt: '2026-09-30T10:00:00.000Z',
      endedAt: '2026-09-30T11:00:00.000Z',
      sessionRpe: 9,
    });
  });

  it('sends a null session RPE for a workout that was not rated, also from an older draft', () => {
    expect(completeSessionPayload(workout()).sessionRpe).toBeNull();
    expect(completeSessionPayload(withSessionRpe(workout({ sessionRpe: 4 }), null)).sessionRpe).toBeNull();
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

const NO_PROGRESSION = { kind: 'none' } as const;

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

describe('planned set editing', () => {
  const planned = startDraftFromDay(
    {
      id: 'day',
      name: 'Push',
      programName: 'PPL',
      exercises: [
        { exerciseId: 'bench', targetSets: 2, targetRepsMin: 8, targetRepsMax: 12, progression: NO_PROGRESSION },
      ],
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

  it('plans every set as a working set', () => {
    expect(liftsOf(planned)[0].sets.map((set) => set.isWarmup)).toEqual([false, false]);
  });

  it('marks a set as a warm-up and back', () => {
    const warmup = updateSet(planned, 0, setId, { isWarmup: true });
    expect(liftsOf(warmup)[0].sets.map((set) => set.isWarmup)).toEqual([true, false]);
    expect(liftsOf(updateSet(warmup, 0, setId, { isWarmup: false }))[0].sets[0].isWarmup).toBe(false);
  });

  it('adds a working set after a warm-up', () => {
    const warmup = updateSet(planned, 0, planned.exercises[0].sets[1].id, { isWarmup: true });
    expect(liftsOf(addSet(warmup, 0))[0].sets.at(-1)?.isWarmup).toBe(false);
  });

  it('puts generated warm-ups before the sets as planned warm-up sets', () => {
    const withWarmups = addWarmupSets(planned, 0, [
      { weightKg: 20, reps: 10 },
      { weightKg: 40, reps: 5 },
    ]);
    const sets = liftsOf(withWarmups)[0].sets;
    expect(sets.map(({ weightKg, reps, isWarmup, done, effort }) => [weightKg, reps, isWarmup, done, effort])).toEqual([
      [20, 10, true, false, null],
      [40, 5, true, false, null],
      [20, 8, false, false, null],
      [20, 8, false, false, null],
    ]);
    expect(new Set(sets.map((set) => set.id)).size).toBe(4);
  });

  it('finds the first working set after the warm-ups', () => {
    const [first, second] = planned.exercises[0].sets;
    const warmedUp = updateSet(updateSet(planned, 0, first.id, { isWarmup: true }), 0, second.id, { weightKg: 90 });
    expect(firstWorkingSet(liftsOf(warmedUp)[0])?.weightKg).toBe(90);
    const allWarmups = updateSet(warmedUp, 0, second.id, { isWarmup: true });
    expect(firstWorkingSet(liftsOf(allWarmups)[0])).toBeUndefined();
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
    clientId: 'card-run',
    exerciseId: 'run',
    name: 'Running',
    modality: 'cardio',
    activity: {
      paceUnit: 'per_km',
      referencePaceSPerKm: 360,
      maxEffort: 'max',
      tracksDistance: true,
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
    const raw = { v: 5, kind: 'draft', userId, updatedAt: 5, draft: mixedWorkout() };
    expect(parseStoredDraft(raw, userId)).toEqual(raw);
  });

  it('reads an activity saved before distance tracking was stored as one that tracks distance', () => {
    const exercise = cardioExercise();
    const olderActivity: Partial<CardioDraftExercise['activity']> = { ...exercise.activity };
    delete olderActivity.tracksDistance;
    const older = workout({ exercises: [{ ...exercise, activity: olderActivity } as CardioDraftExercise] });
    const parsed = parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 5, draft: older }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.exercises[0]).toMatchObject({ activity: { tracksDistance: true } });
  });

  it('drops a distance from the bouts of an activity that tracks none', () => {
    const exercise = cardioExercise();
    const stretching = {
      ...exercise,
      activity: { ...exercise.activity, referencePaceSPerKm: null, tracksDistance: false },
    };
    const parsed = parseStoredDraft(
      { v: 5, kind: 'draft', userId, updatedAt: 5, draft: workout({ exercises: [stretching] }) },
      userId,
    );
    expect(
      parsed?.kind === 'draft' && parsed.draft.exercises[0].sets.map((bout) => 'distanceM' in bout && bout.distanceM),
    ).toEqual([null, null, null]);
  });

  it.each([
    [{ type: 'level', level: 'hard' }],
    [{ type: 'rir', value: 2 }],
    [{ type: 'cardio', level: 'extreme' }],
    ['moderate'],
  ])('replaces an invalid cardio effort %j with no effort', (effort) => {
    const [bout] = cardioExercise().sets;
    const broken = workout({ exercises: [cardioExercise({ sets: [{ ...bout, effort } as typeof bout] })] });
    const parsed = parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 5, draft: broken }, userId);
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
    const parsed = parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 5, draft }, userId);
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

  it('marks every planned set and bout done, keeping everything else', () => {
    const marked = markPlannedSetsDone(mixedWorkout());
    expect(notDoneSetCount(marked)).toBe(0);
    expect(doneSetCount(marked)).toBe(8);
    const allDone = mixedWorkout().exercises.map((exercise) => exercise.sets.map((set) => ({ ...set, done: true })));
    expect(marked.exercises.map((exercise) => exercise.sets)).toEqual(allDone);
  });

  it('leaves a 5RM test and optional sets for the lifter to log, since their numbers are only placeholders', () => {
    const snapshot = { weightKg: 60, reps: 5, minReps: null, amrap: false };
    const planned = (id: string, extra: Partial<DraftSet>): DraftSet => ({
      id,
      weightKg: 60,
      reps: 5,
      effort: null,
      done: false,
      isWarmup: false,
      ...extra,
    });
    const retest = planned('retest', { prescription: { ...snapshot, ref: 't1:retest' } });
    const optional = planned('optional', {
      prescription: { ...snapshot, ref: 't3-1' },
      prescriptionDetail: { pct: null, optional: true },
    });
    const working = planned('working', {
      prescription: { ...snapshot, ref: 't1-1' },
      prescriptionDetail: { pct: 0.85, optional: false },
    });
    const bench = workout().exercises[0];
    if (bench.modality !== 'lift') throw new Error('expected a lift');
    const draft = workout({ exercises: [{ ...bench, sets: [retest, optional, working] }] });
    expect(plannedSetsLeftToLifter(draft)).toBe(2);
    const marked = markPlannedSetsDone(draft);
    expect(marked.exercises[0].sets.map((set) => [set.id, set.done])).toEqual([
      ['retest', false],
      ['optional', false],
      ['working', true],
    ]);
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

describe('fillWorkingSets', () => {
  const liftAt = (draft: WorkoutDraft, index: number) => {
    const exercise = draft.exercises[index];
    if (exercise.modality !== 'lift') throw new Error('expected a lift');
    return exercise;
  };
  const freshBench = () => {
    const lift = liftAt(workout(), 0);
    return workout({ exercises: [{ ...lift, sets: [lift.sets[0]] }] });
  };

  it('turns a fresh lift into the count of done sets at its weight and the reps', () => {
    const filled = liftAt(fillWorkingSets(freshBench(), 0, 3, 5), 0);
    expect(filled.sets.map(({ id, weightKg, reps, done, effort }) => ({ id, weightKg, reps, done, effort }))).toEqual([
      { id: 'set-a', weightKg: 60, reps: 5, done: true, effort: { type: 'level', level: 'hard' } },
      { id: expect.any(String), weightKg: 60, reps: 5, done: true, effort: null },
      { id: expect.any(String), weightKg: 60, reps: 5, done: true, effort: null },
    ]);
    expect(new Set(filled.sets.map((set) => set.id)).size).toBe(3);
  });

  it('leaves warm-ups alone and starts an empty lift at the default weight', () => {
    const warmup = { id: 'w', weightKg: 20, reps: 10, effort: null, done: false, isWarmup: true, prescription: null };
    const draft = workout({ exercises: [{ ...liftAt(workout(), 0), sets: [warmup] }] });
    const sets = liftAt(fillWorkingSets(draft, 0, 3, 8), 0).sets;
    expect(sets[0]).toEqual(warmup);
    expect(sets.slice(1).map(({ weightKg, reps, done, isWarmup }) => [weightKg, reps, done, isWarmup])).toEqual([
      [20, 8, true, false],
      [20, 8, true, false],
      [20, 8, true, false],
    ]);
  });

  it('only fills a fresh freestyle lift, so logged sets and program sets stay as they are', () => {
    expect(canQuickFill(liftAt(freshBench(), 0))).toBe(true);
    expect(canQuickFill(liftAt(workout(), 0))).toBe(false);
    expect(fillWorkingSets(workout(), 0, 3, 5)).toEqual(workout());
    const lift = liftAt(freshBench(), 0);
    const prescribed = {
      ...lift.sets[0],
      prescription: { ref: 't1-1', weightKg: 60, reps: 3, minReps: null, amrap: true },
    };
    const programDraft = workout({ exercises: [{ ...lift, sets: [prescribed] }] });
    expect(canQuickFill(liftAt(programDraft, 0))).toBe(false);
    expect(fillWorkingSets(programDraft, 0, 3, 8)).toEqual(programDraft);
  });

  it('does not quick fill a lift that is part of a superset', () => {
    const grouped = { ...liftAt(freshBench(), 0), supersetId: 'g' };
    expect(canQuickFill(grouped)).toBe(false);
    expect(fillWorkingSets(workout({ exercises: [grouped] }), 0, 3, 8).exercises).toEqual([grouped]);
  });
});

describe('superset leftovers', () => {
  function supersetIdsOf(draft: WorkoutDraft | null): (string | null | undefined)[] {
    return liftsOf(draft).map((lift) => lift.supersetId);
  }

  function undone(exercise: LiftDraftExercise, supersetId: string | null): LiftDraftExercise {
    return { ...exercise, supersetId, sets: exercise.sets.map((set) => ({ ...set, done: false })) };
  }

  const [bench, row] = liftsOf(workout());

  it('ungroups the member left alone when its partner is removed', () => {
    const singleSetBench = { ...bench, sets: bench.sets.slice(0, 1) };
    const draft = workout({ exercises: [undone(singleSetBench, 'g'), undone(row, 'g')] });
    const removed = removeExercise(draft, 1);
    expect(supersetIdsOf(removed)).toEqual([null]);
    expect(canQuickFill(liftsOf(removed)[0])).toBe(true);
  });

  it('keeps a group that still has two members after a removal', () => {
    const draft = workout({ exercises: [undone(bench, 'g'), undone(row, 'g'), undone(row, 'g')] });
    expect(supersetIdsOf(removeExercise(draft, 0))).toEqual(['g', 'g']);
  });

  it('drops a lone superset id when an exercise is swapped', () => {
    const draft = workout({ exercises: [undone(bench, 'g'), undone(row, null)] });
    const swapped = swapExercise(draft, 0, { id: 'dip', name: 'Dip', loadType: 'bodyweight' });
    expect(supersetIdsOf(swapped)).toEqual([null, null]);
  });
});

describe('exercise client ids', () => {
  const withoutClientId = (exercise: DraftExercise) =>
    Object.fromEntries(Object.entries(exercise).filter(([key]) => key !== 'clientId'));

  it('gives each exercise of a stored draft without client ids a positional one, the same on every parse', () => {
    const draft = { ...workout(), exercises: workout().exercises.map(withoutClientId) };
    const raw = { v: 5, kind: 'draft', userId, updatedAt: 5, draft };
    const parsed = parseStoredDraft(raw, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.exercises.map((exercise) => exercise.clientId)).toEqual([
      'exercise-0',
      'exercise-1',
    ]);
    expect(parseStoredDraft(raw, userId)).toEqual(parsed);
  });

  it('keeps stored client ids', () => {
    const parsed = parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 5, draft: workout() }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.exercises.map((exercise) => exercise.clientId)).toEqual([
      'card-bench',
      'card-row',
    ]);
  });

  it('keys every added exercise apart, even a repeat, and keeps the others when one is removed', () => {
    const empty = workout({ exercises: [] });
    const twice = addExercise(addExercise(empty, 'bench', 'Bench', 'external'), 'bench', 'Bench', 'external');
    const withCardio = addCardioExercise(twice, 'run', 'Running', cardioExercise().activity);
    const clientIds = withCardio.exercises.map((exercise) => exercise.clientId);
    expect(new Set(clientIds).size).toBe(3);
    expect(removeExercise(withCardio, 0).exercises.map((exercise) => exercise.clientId)).toEqual(clientIds.slice(1));
  });

  it('keys every exercise of a started program day apart', () => {
    const benchTwice = startDraftFromDay(
      {
        id: 'day',
        name: 'Push',
        programName: 'PPL',
        exercises: [
          { exerciseId: 'bench', targetSets: 1, targetRepsMin: 5, targetRepsMax: 5, progression: NO_PROGRESSION },
          { exerciseId: 'bench', targetSets: 1, targetRepsMin: 8, targetRepsMax: 8, progression: NO_PROGRESSION },
        ],
      },
      new Map<string, CatalogEntry>([['bench', { name: 'Bench', loadType: 'external', archived: false }]]),
      new Map(),
      new Date('2026-09-30T10:00:00.000Z'),
    );
    const [first, second] = benchTwice.draft.exercises.map((exercise) => exercise.clientId);
    expect(first).not.toBe(second);
  });
});

describe('set limit', () => {
  const liftWithSets = (count: number): LiftDraftExercise => ({
    clientId: 'card-squat',
    exerciseId: 'squat',
    name: 'Squat',
    modality: 'lift',
    loadType: 'external',
    target: null,
    supersetId: null,
    sets: Array.from({ length: count }, (_, index) => ({
      id: `squat-${index}`,
      weightKg: 100,
      reps: 5,
      effort: null,
      done: true,
      isWarmup: false,
      prescription: null,
    })),
  });
  const freshLift = (): LiftDraftExercise => ({ ...liftWithSets(0), clientId: 'card-press', exerciseId: 'press' });
  const fullDraft = () => workout({ exercises: [liftWithSets(MAX_SETS_PER_SESSION - 2), cardioExercise()] });

  it('allows a set only while the workout holds fewer sets than the server accepts', () => {
    expect(canAddSet(workout({ exercises: [liftWithSets(MAX_SETS_PER_SESSION - 1)] }))).toBe(true);
    expect(canAddSet(fullDraft())).toBe(false);
  });

  it('adds no set or bout once the workout is full', () => {
    expect(addSet(fullDraft(), 0)).toEqual(fullDraft());
    expect(addSet(fullDraft(), 1)).toEqual(fullDraft());
  });

  it('adds no warm-ups that would not fit', () => {
    const draft = workout({ exercises: [liftWithSets(MAX_SETS_PER_SESSION - 1)] });
    const warmups = [
      { weightKg: 20, reps: 10 },
      { weightKg: 60, reps: 5 },
    ];
    expect(addWarmupSets(draft, 0, warmups)).toEqual(draft);
    expect(addWarmupSets(draft, 0, warmups.slice(0, 1)).exercises[0].sets).toHaveLength(MAX_SETS_PER_SESSION);
  });

  it('quick fills only up to the set limit', () => {
    const draft = workout({ exercises: [liftWithSets(MAX_SETS_PER_SESSION - 2), freshLift()] });
    expect(fillWorkingSets(draft, 1, 5, 8).exercises[1].sets).toHaveLength(2);
  });

  it('offers a quick fill of only as many working sets as still fit', () => {
    const nearlyFull = workout({ exercises: [liftWithSets(MAX_SETS_PER_SESSION - 2), freshLift()] });
    expect(mostQuickFillSets(nearlyFull, 1)).toBe(2);
    const oneWorkingSet = { ...freshLift(), sets: liftWithSets(1).sets };
    const full = workout({ exercises: [liftWithSets(MAX_SETS_PER_SESSION - 1), oneWorkingSet] });
    expect(mostQuickFillSets(full, 1)).toBe(1);
    expect(mostQuickFillSets(workout({ exercises: [freshLift()] }), 0)).toBe(20);
    expect(mostQuickFillSets(workout({ exercises: [liftWithSets(MAX_SETS_PER_SESSION), freshLift()] }), 1)).toBe(0);
  });
});
