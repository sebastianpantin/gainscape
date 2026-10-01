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

function set(
  id: string,
  exerciseId: string,
  position: number,
  weightKg: number,
  reps: number,
  overrides: Partial<FeedSourceSet> = {},
): FeedSourceSet {
  return { id, exerciseId, position, weightKg, reps, isWarmup: false, effectiveLoadKg: weightKg, ...overrides };
}

function repMaxPr(exerciseId: string, reps: number, loadKg: number, previousLoadKg: number | null = null) {
  return { exerciseId, kind: 'rep_max', reps, loadKg, previousLoadKg, previousReps: null } as PersonalRecordSummary;
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
  const sets = [
    set('set-60x5', 'bench', 0, 60, 5),
    set('set-80x5', 'bench', 1, 80, 5),
    set('set-80x6', 'bench', 2, 80, 6),
    set('warmup-80x8', 'bench', 3, 80, 8, { isWarmup: true }),
  ];

  it('links the lowest-position working set that matches the record', () => {
    const [event] = feedEventsForSession(summaryWith({ prs: [repMaxPr('bench', 5, 80, 60)] }), sets, exercises, rarity);
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

  it('ignores warm-ups when matching the source set', () => {
    const [event] = feedEventsForSession(summaryWith({ prs: [repMaxPr('bench', 6, 80)] }), sets, exercises, rarity);
    expect(event.setId).toBe('set-80x6');
    const [none] = feedEventsForSession(summaryWith({ prs: [repMaxPr('bench', 8, 80)] }), sets, exercises, rarity);
    expect(none.setId).toBeNull();
  });

  it('reports the added weight and the total for bodyweight-plus', () => {
    const dipSets = [set('dip', 'weighted_dip', 0, 20, 5, { effectiveLoadKg: 100 })];
    const [event] = feedEventsForSession(
      summaryWith({ prs: [repMaxPr('weighted_dip', 5, 20, 10)] }),
      dipSets,
      exercises,
      rarity,
    );
    expect(event.setId).toBe('dip');
    expect(event.payload).toMatchObject({ loadKg: 20, previousLoadKg: 10, totalLoadKg: 100 });
  });

  it('matches a pure bodyweight record by exact reps', () => {
    const pullUpSets = [set('pull-12', 'pull_up', 0, 0, 12), set('pull-15', 'pull_up', 1, 0, 15)];
    const pr: PersonalRecordSummary = {
      exerciseId: 'pull_up',
      kind: 'bodyweight_reps',
      reps: 15,
      loadKg: null,
      previousLoadKg: null,
      previousReps: 12,
    };
    const [event] = feedEventsForSession(summaryWith({ prs: [pr] }), pullUpSets, exercises, rarity);
    expect(event.setId).toBe('pull-15');
    expect(event.payload).toMatchObject({ kind: 'bodyweight_reps', reps: 15, loadKg: null, totalLoadKg: null });
  });

  it('never posts a custom exercise PR', () => {
    const events = feedEventsForSession(
      summaryWith({ prs: [repMaxPr('landmine', 5, 40)] }),
      [set('landmine-set', 'landmine', 0, 40, 5)],
      exercises,
      rarity,
    );
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
    prs: [repMaxPr('bench', 5, 80), repMaxPr('weighted_dip', 5, 20)],
    drops: [drop('drop-1', 'item-legendary'), drop('drop-2', 'item-rare')],
  });
  const sets = [set('bench-set', 'bench', 0, 80, 5), set('dip-set', 'weighted_dip', 1, 20, 5)];

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
