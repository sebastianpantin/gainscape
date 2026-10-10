import { describe, expect, it } from 'vitest';
import { MAX_SETS_PER_SESSION } from '../../supabase/functions/_shared/domain/types.ts';
import type { CardioActivity } from '../../web/src/lib/catalog-rules.ts';
import type { DraftExercise, DraftSet, WorkoutDraft } from '../../web/src/offline/draft-format.ts';
import {
  addRound,
  groupWithNext,
  nextInRound,
  restsAfter,
  roundRows,
  supersetGroups,
  ungroup,
} from '../../web/src/lib/superset-rules.ts';

function set(id: string, weightKg = 60, reps = 8): DraftSet {
  return { id, weightKg, reps, effort: null, done: false, isWarmup: false, prescription: null };
}

function lift(exerciseId: string, setIds: string[], supersetId: string | null = null): DraftExercise {
  return {
    clientId: `card-${exerciseId}`,
    exerciseId,
    name: exerciseId,
    modality: 'lift',
    loadType: 'external',
    target: null,
    sets: setIds.map((id) => set(id)),
    supersetId,
  };
}

function cardio(exerciseId: string): DraftExercise {
  const activity: CardioActivity = { paceUnit: 'per_km', referencePaceSPerKm: 360, maxEffort: 'max', shares: [] };
  return { clientId: `card-${exerciseId}`, exerciseId, name: exerciseId, modality: 'cardio', activity, sets: [] };
}

function draftOf(exercises: DraftExercise[]): WorkoutDraft {
  return {
    sessionId: 's',
    startedAt: '2026-09-30T10:00:00.000Z',
    finishedAt: null,
    programDayId: null,
    programLabel: null,
    program: null,
    exercises,
  };
}

function supersetIds(draft: WorkoutDraft): (string | null | undefined)[] {
  return draft.exercises.map((exercise) => (exercise.modality === 'lift' ? exercise.supersetId : undefined));
}

const grouped = draftOf([lift('a', ['a1', 'a2'], 'g'), lift('b', ['b1', 'b2'], 'g'), lift('c', ['c1'])]);

describe('supersetGroups', () => {
  it('lists each run of adjacent exercises sharing an id', () => {
    expect(supersetGroups(grouped)).toEqual([{ id: 'g', exerciseIndexes: [0, 1] }]);
  });

  it('lists several groups in order and ignores ungrouped exercises', () => {
    const draft = draftOf([
      lift('a', ['a1'], 'g'),
      lift('b', ['b1'], 'g'),
      lift('c', ['c1']),
      lift('d', [], 'h'),
      lift('e', [], 'h'),
    ]);
    expect(supersetGroups(draft)).toEqual([
      { id: 'g', exerciseIndexes: [0, 1] },
      { id: 'h', exerciseIndexes: [3, 4] },
    ]);
  });

  it('returns nothing for a draft without groups', () => {
    expect(supersetGroups(draftOf([lift('a', ['a1']), cardio('run')]))).toEqual([]);
  });
});

describe('groupWithNext', () => {
  it('starts a new group of the exercise and the next one', () => {
    const result = groupWithNext(draftOf([lift('a', ['a1']), lift('b', ['b1'])]), 0);
    const [first, second] = supersetIds(result);
    expect(typeof first).toBe('string');
    expect(second).toBe(first);
  });

  it('joins the group of the next exercise', () => {
    const draft = draftOf([lift('a', ['a1']), lift('b', ['b1'], 'g'), lift('c', ['c1'], 'g')]);
    expect(supersetIds(groupWithNext(draft, 0))).toEqual(['g', 'g', 'g']);
  });

  it('brings the next exercise into the group of this one', () => {
    const draft = draftOf([lift('a', ['a1'], 'g'), lift('b', ['b1'], 'g'), lift('c', ['c1'])]);
    expect(supersetIds(groupWithNext(draft, 1))).toEqual(['g', 'g', 'g']);
  });

  it('merges the group of this exercise with the group of the next one', () => {
    const draft = draftOf([
      lift('a', ['a1'], 'x'),
      lift('b', ['b1'], 'x'),
      lift('c', ['c1'], 'y'),
      lift('d', ['d1'], 'y'),
    ]);
    expect(supersetIds(groupWithNext(draft, 1))).toEqual(['x', 'x', 'x', 'x']);
  });

  it('does nothing on the last exercise', () => {
    const draft = draftOf([lift('a', ['a1']), lift('b', ['b1'])]);
    expect(groupWithNext(draft, 1)).toEqual(draft);
  });

  it('does nothing next to a cardio exercise', () => {
    const before = draftOf([lift('a', ['a1']), cardio('run')]);
    const after = draftOf([cardio('run'), lift('a', ['a1'])]);
    expect(groupWithNext(before, 0)).toEqual(before);
    expect(groupWithNext(after, 0)).toEqual(after);
  });
});

describe('ungroup', () => {
  it('dissolves a group of two', () => {
    expect(supersetIds(ungroup(grouped, 0))).toEqual([null, null, null]);
  });

  it('keeps a group that still has two members', () => {
    const draft = draftOf([lift('a', ['a1'], 'g'), lift('b', ['b1'], 'g'), lift('c', ['c1'], 'g')]);
    expect(supersetIds(ungroup(draft, 2))).toEqual(['g', 'g', null]);
  });

  it('moves an ungrouped middle member after the group and keeps the rest together', () => {
    const draft = draftOf([lift('a', ['a1'], 'g'), lift('b', ['b1'], 'g'), lift('c', ['c1'], 'g'), lift('d', ['d1'])]);
    const result = ungroup(draft, 1);
    expect(result.exercises.map((exercise) => exercise.exerciseId)).toEqual(['a', 'c', 'b', 'd']);
    expect(supersetIds(result)).toEqual(['g', 'g', null, null]);
  });

  it('keeps the other three members grouped when a middle member of four leaves', () => {
    const draft = draftOf([
      lift('a', ['a1'], 'g'),
      lift('b', ['b1'], 'g'),
      lift('c', ['c1'], 'g'),
      lift('d', ['d1'], 'g'),
    ]);
    const result = ungroup(draft, 2);
    expect(result.exercises.map((exercise) => exercise.exerciseId)).toEqual(['a', 'b', 'd', 'c']);
    expect(supersetIds(result)).toEqual(['g', 'g', 'g', null]);
  });

  it('keeps the order when the first member of three leaves', () => {
    const draft = draftOf([lift('a', ['a1'], 'g'), lift('b', ['b1'], 'g'), lift('c', ['c1'], 'g')]);
    const result = ungroup(draft, 0);
    expect(result.exercises.map((exercise) => exercise.exerciseId)).toEqual(['a', 'b', 'c']);
    expect(supersetIds(result)).toEqual([null, 'g', 'g']);
  });

  it('undoes groupWithNext', () => {
    const draft = draftOf([lift('a', ['a1']), lift('b', ['b1'])]);
    expect(ungroup(groupWithNext(draft, 0), 0)).toEqual(draft);
  });

  it('leaves a draft alone when the exercise is not grouped', () => {
    expect(ungroup(grouped, 2)).toEqual(grouped);
  });
});

describe('roundRows', () => {
  it('has one row per round with a cell per member in order', () => {
    const [group] = supersetGroups(grouped);
    expect(roundRows(grouped, group)).toEqual([
      {
        round: 1,
        cells: [
          { exerciseIndex: 0, setId: 'a1' },
          { exerciseIndex: 1, setId: 'b1' },
        ],
      },
      {
        round: 2,
        cells: [
          { exerciseIndex: 0, setId: 'a2' },
          { exerciseIndex: 1, setId: 'b2' },
        ],
      },
    ]);
  });

  it('leaves an empty cell where a member has no set in the round', () => {
    const draft = draftOf([lift('a', ['a1', 'a2'], 'g'), lift('b', ['b1'], 'g')]);
    const [group] = supersetGroups(draft);
    expect(roundRows(draft, group)[1].cells).toEqual([
      { exerciseIndex: 0, setId: 'a2' },
      { exerciseIndex: 1, setId: null },
    ]);
  });
});

describe('nextInRound', () => {
  it('points at the next member in the same round', () => {
    expect(nextInRound(grouped, 0, 'a2')).toEqual({ exerciseIndex: 1, setId: 'b2' });
  });

  it('is null after the last member of the round', () => {
    expect(nextInRound(grouped, 1, 'b1')).toBeNull();
  });

  it('skips a member without a set in the round', () => {
    const draft = draftOf([lift('a', ['a1', 'a2'], 'g'), lift('b', ['b1'], 'g'), lift('c', ['c1', 'c2'], 'g')]);
    expect(nextInRound(draft, 0, 'a2')).toEqual({ exerciseIndex: 2, setId: 'c2' });
  });

  it('is null for an exercise that is not grouped', () => {
    expect(nextInRound(grouped, 2, 'c1')).toBeNull();
  });
});

describe('restsAfter', () => {
  it('rests after a set of an ungrouped exercise', () => {
    expect(restsAfter(grouped, 2, 'c1')).toBe(true);
  });

  it('does not rest after the first member of a round', () => {
    expect(restsAfter(grouped, 0, 'a1')).toBe(false);
  });

  it('rests after the last member of a round', () => {
    expect(restsAfter(grouped, 1, 'b1')).toBe(true);
  });

  it('rests after the last member that has a set in the round', () => {
    const draft = draftOf([lift('a', ['a1', 'a2'], 'g'), lift('b', ['b1'], 'g')]);
    expect(restsAfter(draft, 0, 'a2')).toBe(true);
    expect(restsAfter(draft, 0, 'a1')).toBe(false);
  });
});

describe('addRound', () => {
  it('adds one set to every member, copying its last set', () => {
    const [group] = supersetGroups(grouped);
    const [a, b, c] = addRound(grouped, group).exercises;
    expect(a.sets).toHaveLength(3);
    expect(b.sets).toHaveLength(3);
    expect(c.sets).toHaveLength(1);
    expect(a.sets[2]).toMatchObject({ weightKg: 60, reps: 8, effort: null, isWarmup: false });
    expect(a.sets[2].id).not.toBe(b.sets[2].id);
  });

  it('adds no round that would not fit under the set limit', () => {
    const filler = lift(
      'c',
      Array.from({ length: MAX_SETS_PER_SESSION - 5 }, (_, index) => `c${index}`),
    );
    const nearlyFull = draftOf([lift('a', ['a1', 'a2'], 'g'), lift('b', ['b1', 'b2'], 'g'), filler]);
    const [group] = supersetGroups(nearlyFull);
    expect(addRound(nearlyFull, group)).toEqual(nearlyFull);
  });
});
