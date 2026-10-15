import { describe, expect, it } from 'vitest';
import { type LiftDraftExercise, type WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import {
  addCardioExercise,
  addExercise,
  addHoldExercise,
  addSet,
  addWarmupSets,
  canSwapExercise,
  firstWorkingSet,
  canQuickFill,
  fillWorkingSets,
  mostQuickFillSets,
  removeExercise,
  seedUntouchedSet,
  swapExercise,
  toggleSetDone,
} from '../../web/src/offline/draft-edits.ts';
import { type CatalogEntry, startDraftFromDay } from '../../web/src/offline/draft-starts.ts';
import { canAddSet, removeSet, updateSet } from '../../web/src/lib/workout/exercise-edit-rules.ts';
import { MAX_SETS_PER_SESSION } from '../../supabase/functions/_shared/domain/types.ts';
import { cardioExercise, liftsOf, workout } from './draft-fixtures.ts';

const NO_PROGRESSION = { kind: 'none' } as const;

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

  it('adds no bout and no cardio exercise once the bouts add up to 4 hours, but still adds a lift', () => {
    const fourHours = workout({
      exercises: [cardioExercise({ sets: [{ ...cardioExercise().sets[0], durationS: 14_400 }] })],
    });
    expect(addSet(fourHours, 0)).toBe(fourHours);
    expect(addCardioExercise(fourHours, 'row', 'Rowing', cardioExercise().activity)).toBe(fourHours);
    const withLift = addSet(addExercise(fourHours, 'press', 'Press', 'external'), 1);
    expect(withLift.exercises[1].sets).toHaveLength(1);
  });

  it('adds no lift or hold exercise once the workout holds as many sets as the server accepts', () => {
    const full = workout({ exercises: [liftWithSets(MAX_SETS_PER_SESSION)] });
    expect(addExercise(full, 'press', 'Press', 'external')).toBe(full);
    expect(addHoldExercise(full, 'plank', 'Plank', 'bodyweight', 'time')).toBe(full);
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
