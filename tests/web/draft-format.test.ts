import { describe, expect, it } from 'vitest';
import {
  type CardioDraftExercise,
  type DraftExercise,
  type LiftDraftExercise,
  nextUpdatedAt,
  parseStoredDraft,
  discardedRecord,
  forgottenRecord,
  storableRecord,
  syncedRecord,
  type DraftSet,
} from '../../web/src/offline/draft-format.ts';
import {
  addCardioExercise,
  addExercise,
  addSet,
  canSwapExercise,
  doneSetCount,
  markPlannedSetsDone,
  notDoneSetCount,
  plannedSetsLeftToLifter,
  ratedNotDoneSetCount,
  removeExercise,
  swapExercise,
  toggleSetDone,
  withCurrentLoadTypes,
  withSessionRpe,
} from '../../web/src/offline/draft-edits.ts';
import { type CatalogEntry, startDraftFromDay } from '../../web/src/offline/draft-starts.ts';
import { removeSet } from '../../web/src/lib/workout/exercise-edit-rules.ts';
import { completeSessionPayload } from '../../web/src/offline/session-payload.ts';
import {
  cardioExercise,
  DRAFT_USER_ID as userId,
  liftsOf,
  mixedWorkout,
  withoutModality,
  withoutSupersetId,
  workout,
} from './draft-fixtures.ts';

const NO_PROGRESSION = { kind: 'none' } as const;

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

  it('keeps every effort level, moderate included', () => {
    const levels = ['easy', 'moderate', 'hard', 'near_failure', 'failure'] as const;
    const sets = levels.map((level) => ({
      id: level,
      weightKg: 60,
      reps: 8,
      effort: { type: 'level', level },
      done: true,
    }));
    const draft = { ...workout(), exercises: [{ ...workout().exercises[0], sets }] };
    const parsed = parseStoredDraft({ v: 5, kind: 'draft', userId, updatedAt: 5, draft }, userId);
    expect(parsed?.kind === 'draft' && parsed.draft.exercises[0].sets.map((set) => set.effort)).toEqual(
      levels.map((level) => ({ type: 'level', level })),
    );
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

  it('adds a cardio exercise with one steady 30-minute bout that is not done yet', () => {
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
        done: false,
      },
    ]);
  });

  it('copies the previous bout when adding another, with a fresh id', () => {
    const intervals = cardioExercise({ sets: [cardioExercise().sets[1]] });
    const added = addSet(workout({ exercises: [intervals] }), 0);
    const [previous, copy] = added.exercises[0].sets;
    expect(copy).toEqual({ ...previous, id: expect.any(String), done: false });
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

  it('logs a rated 5RM test or optional set, since the rating says it was lifted', () => {
    const snapshot = { weightKg: 60, reps: 5, minReps: null, amrap: false };
    const hard = { type: 'level', level: 'hard' } as const;
    const rated = (id: string, extra: Partial<DraftSet>): DraftSet => ({
      id,
      weightKg: 60,
      reps: 5,
      effort: hard,
      done: false,
      isWarmup: false,
      ...extra,
    });
    const retest = rated('retest', { prescription: { ...snapshot, ref: 't1:retest' } });
    const optional = rated('optional', {
      prescription: { ...snapshot, ref: 't3-1' },
      prescriptionDetail: { pct: null, optional: true },
    });
    const bench = workout().exercises[0];
    if (bench.modality !== 'lift') throw new Error('expected a lift');
    const draft = workout({ exercises: [{ ...bench, sets: [retest, optional] }] });
    expect(plannedSetsLeftToLifter(draft)).toBe(0);
    expect(markPlannedSetsDone(draft).exercises[0].sets.map((set) => set.done)).toEqual([true, true]);
  });

  it('counts the sets that are rated but not ticked done', () => {
    const hard = { type: 'level', level: 'hard' } as const;
    const bench = workout().exercises[0];
    if (bench.modality !== 'lift') throw new Error('expected a lift');
    const sets: DraftSet[] = [
      { id: 'a', weightKg: 60, reps: 5, effort: hard, done: false, isWarmup: false },
      { id: 'b', weightKg: 60, reps: 5, effort: hard, done: true, isWarmup: false },
      { id: 'c', weightKg: 60, reps: 5, effort: null, done: false, isWarmup: false },
    ];
    expect(ratedNotDoneSetCount(workout({ exercises: [{ ...bench, sets }] }))).toBe(1);
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
