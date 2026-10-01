import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEED,
  type DropSummary,
  type FeedExercise,
  feedEventsForSession,
  type FeedSourceSet,
  type ItemRarityRank,
  isFeedLevelUp,
  type PersonalRecordSummary,
  type SessionSummary,
} from '@domain/index.ts';

const exercises = new Map<string, FeedExercise>([
  ['bench', { builtIn: true, loadType: 'external' }],
  ['weighted_dip', { builtIn: true, loadType: 'bodyweight_plus' }],
  ['pull_up', { builtIn: true, loadType: 'bodyweight' }],
  ['landmine', { builtIn: false, loadType: 'external' }],
  ['run', { builtIn: true, loadType: null }],
  ['my_bike', { builtIn: false, loadType: null }],
]);

const rarity = new Map<string, ItemRarityRank>([
  ['item-common', 'common'],
  ['item-uncommon', 'uncommon'],
  ['item-rare', 'rare'],
  ['item-legendary', 'legendary'],
]);

function summaryWith(overrides: Partial<SessionSummary>): SessionSummary {
  return { sessionId: 'session-1', xpBySkill: {}, levelUps: [], prs: [], drops: [], ...overrides };
}

function set(id: string, effectiveLoadKg: number | null): FeedSourceSet {
  return { id, effectiveLoadKg };
}

function repMaxPr(
  exerciseId: string,
  setId: string,
  reps: number,
  loadKg: number,
  previousLoadKg: number | null = null,
): PersonalRecordSummary {
  return { exerciseId, kind: 'rep_max', setId, reps, loadKg, previousLoadKg, previousReps: null };
}

function drop(dropId: string, itemId: string): DropSummary {
  return { dropId, setId: 'set-a', itemId, itemKey: `${itemId}-key`, quantity: 1, source: 'pr' };
}

describe('isFeedLevelUp', () => {
  it.each([
    [11, 12, false],
    [19, 21, true],
    [9, 10, true],
    [89, 90, true],
    [90, 91, true],
    [1, 9, false],
  ])('%i to %i is %s', (from, to, expected) => {
    expect(isFeedLevelUp(from, to, DEFAULT_FEED)).toBe(expected);
  });

  it('gives level 99 its own type', () => {
    const events = feedEventsForSession(
      summaryWith({ levelUps: [{ skill: 'legs', from: 98, to: 99 }] }),
      [],
      exercises,
      rarity,
    );
    expect(events).toEqual([
      { key: 'level:legs', type: 'level_99', setId: null, payload: { skill: 'legs', from: 98, to: 99 } },
    ]);
  });

  it('emits only level_99 for a jump from 1 to 99', () => {
    const events = feedEventsForSession(
      summaryWith({ levelUps: [{ skill: 'core', from: 1, to: 99 }] }),
      [],
      exercises,
      rarity,
    );
    expect(events.map((event) => event.type)).toEqual(['level_99']);
  });

  it('skips level ups that cross no milestone', () => {
    const events = feedEventsForSession(
      summaryWith({ levelUps: [{ skill: 'core', from: 11, to: 12 }] }),
      [],
      exercises,
      rarity,
    );
    expect(events).toEqual([]);
  });
});

describe('PR events', () => {
  const sets = [set('set-60x5', 60), set('set-80x5', 80), set('set-80x6', 80)];

  it('links the set the summary names', () => {
    const [event] = feedEventsForSession(
      summaryWith({ prs: [repMaxPr('bench', 'set-80x5', 5, 80, 60)] }),
      sets,
      exercises,
      rarity,
    );
    expect(event).toEqual({
      key: 'pr:bench',
      type: 'pr',
      setId: 'set-80x5',
      payload: {
        exerciseId: 'bench',
        kind: 'rep_max',
        reps: 5,
        loadKg: 80,
        previousLoadKg: 60,
        previousReps: null,
        totalLoadKg: null,
      },
    });
  });

  it('links no set when the named set is gone', () => {
    const [event] = feedEventsForSession(
      summaryWith({ prs: [repMaxPr('bench', 'gone', 8, 80)] }),
      sets,
      exercises,
      rarity,
    );
    expect(event.setId).toBeNull();
  });

  it('reports the added weight and the total for bodyweight-plus', () => {
    const [event] = feedEventsForSession(
      summaryWith({ prs: [repMaxPr('weighted_dip', 'dip', 5, 20, 10)] }),
      [set('dip', 100)],
      exercises,
      rarity,
    );
    expect(event.setId).toBe('dip');
    expect(event.payload).toMatchObject({ loadKg: 20, previousLoadKg: 10, totalLoadKg: 100 });
  });

  it('posts a pure bodyweight record with its set', () => {
    const pr: PersonalRecordSummary = {
      exerciseId: 'pull_up',
      kind: 'bodyweight_reps',
      setId: 'pull-15',
      reps: 15,
      loadKg: null,
      previousLoadKg: null,
      previousReps: 12,
    };
    const [event] = feedEventsForSession(summaryWith({ prs: [pr] }), [set('pull-15', 80)], exercises, rarity);
    expect(event.setId).toBe('pull-15');
    expect(event.payload).toMatchObject({ kind: 'bodyweight_reps', reps: 15, loadKg: null, totalLoadKg: null });
  });

  it('never posts a custom exercise PR', () => {
    const events = feedEventsForSession(
      summaryWith({ prs: [repMaxPr('landmine', 'landmine-set', 5, 40)] }),
      [set('landmine-set', 40)],
      exercises,
      rarity,
    );
    expect(events).toEqual([]);
  });
});

describe('cardio PR events', () => {
  const boutPr = (exerciseId: string, setId: string): PersonalRecordSummary => ({
    kind: 'cardio',
    exerciseId,
    setId,
    records: [
      { kind: 'distance', value: 6000, previous: 5000 },
      { kind: 'duration', value: 2160, previous: null },
    ],
  });

  it('posts one flat event per bout, keyed by the bout', () => {
    const events = feedEventsForSession(
      summaryWith({ prs: [boutPr('run', 'bout-a'), boutPr('run', 'bout-b')] }),
      [set('bout-a', null), set('bout-b', null)],
      exercises,
      rarity,
    );
    expect(events.map((event) => event.key)).toEqual(['pr:bout-a', 'pr:bout-b']);
    expect(events[0]).toEqual({
      key: 'pr:bout-a',
      type: 'pr',
      setId: 'bout-a',
      payload: {
        exerciseId: 'run',
        kind: 'cardio',
        recordKinds: 'distance,duration',
        distanceM: 6000,
        previousDistanceM: 5000,
        paceSPerKm: null,
        previousPaceSPerKm: null,
        countedWorkS: 2160,
        previousCountedWorkS: null,
      },
    });
  });

  it('never posts a custom cardio PR', () => {
    const events = feedEventsForSession(summaryWith({ prs: [boutPr('my_bike', 'bout-c')] }), [], exercises, rarity);
    expect(events).toEqual([]);
  });
});

describe('drop events', () => {
  it('posts rare and legendary drops only, skipping unknown items', () => {
    const drops = ['common', 'uncommon', 'rare', 'legendary', 'missing'].map((tier) =>
      drop(`drop-${tier}`, `item-${tier}`),
    );
    const events = feedEventsForSession(summaryWith({ drops }), [], exercises, rarity);
    expect(events.map((event) => event.key)).toEqual(['drop:drop-rare', 'drop:drop-legendary']);
    expect(events[0]).toEqual({
      key: 'drop:drop-rare',
      type: 'drop',
      setId: 'set-a',
      payload: { dropId: 'drop-rare', itemId: 'item-rare', itemKey: 'item-rare-key', quantity: 1, source: 'pr' },
    });
  });
});

describe('feedEventsForSession', () => {
  const full = summaryWith({
    levelUps: [
      { skill: 'chest', from: 19, to: 21 },
      { skill: 'core', from: 3, to: 4 },
      { skill: 'legs', from: 89, to: 90 },
    ],
    prs: [repMaxPr('bench', 'bench-set', 5, 80), repMaxPr('weighted_dip', 'dip-set', 5, 20)],
    drops: [drop('drop-1', 'item-legendary'), drop('drop-2', 'item-rare')],
  });
  const sets = [set('bench-set', 80), set('dip-set', 100)];

  it('returns nothing for a history-only session', () => {
    expect(feedEventsForSession({ ...full, historyOnly: true }, sets, exercises, rarity)).toEqual([]);
  });

  it('orders levels, then PRs, then drops, with unique keys', () => {
    const keys = feedEventsForSession(full, sets, exercises, rarity).map((event) => event.key);
    expect(keys).toEqual(['level:chest', 'level:legs', 'pr:bench', 'pr:weighted_dip', 'drop:drop-1', 'drop:drop-2']);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('is deterministic', () => {
    expect(feedEventsForSession(full, sets, exercises, rarity)).toEqual(
      feedEventsForSession(full, sets, exercises, rarity),
    );
  });
});
