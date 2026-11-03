import { describe, expect, it } from 'vitest';
import { mergedSummaries, splitSetsByDay } from '../../supabase/functions/_shared/domain/session-days.ts';
import { type SessionSummary } from '../../supabase/functions/_shared/domain/types.ts';

function summary(overrides: Partial<SessionSummary>): SessionSummary {
  return { sessionId: 'first', xpBySkill: {}, levelUps: [], prs: [], drops: [], ...overrides };
}

describe('splitSetsByDay', () => {
  const sets = [
    { id: 'a', position: 0 },
    { id: 'b', position: 1 },
    { id: 'c', position: 2 },
    { id: 'd', position: 3 },
  ];

  it('puts the listed sets in the second Day and numbers each Day from zero in order', () => {
    expect(splitSetsByDay(sets, ['b', 'd'])).toEqual({
      first: [
        { id: 'a', position: 0 },
        { id: 'c', position: 1 },
      ],
      second: [
        { id: 'b', position: 0 },
        { id: 'd', position: 1 },
      ],
    });
  });

  it('ignores ids that are not sets of the payload', () => {
    expect(splitSetsByDay(sets, ['zzz']).second).toEqual([]);
  });
});

describe('mergedSummaries', () => {
  it('adds XP and bonuses per skill and keeps the first Session id', () => {
    const merged = mergedSummaries(
      summary({ xpBySkill: { chest: 100, arms: 20 }, gearBonusBySkill: { chest: 5 } }),
      summary({ sessionId: 'second', xpBySkill: { legs: 150, arms: 10 }, gearBonusBySkill: { legs: 7 } }),
    );
    expect(merged.sessionId).toBe('first');
    expect(merged.xpBySkill).toEqual({ chest: 100, arms: 30, legs: 150 });
    expect(merged.gearBonusBySkill).toEqual({ chest: 5, legs: 7 });
  });

  it('joins level-ups of one skill from the first level to the last', () => {
    const merged = mergedSummaries(
      summary({ levelUps: [{ skill: 'arms', from: 10, to: 11 }] }),
      summary({
        levelUps: [
          { skill: 'arms', from: 11, to: 12 },
          { skill: 'legs', from: 4, to: 5 },
        ],
      }),
    );
    expect(merged.levelUps).toEqual([
      { skill: 'arms', from: 10, to: 12 },
      { skill: 'legs', from: 4, to: 5 },
    ]);
  });

  it('lists the records and drops of both Sessions', () => {
    const drop = (dropId: string) => ({
      dropId,
      setId: 's',
      itemId: 'i',
      itemKey: 'k',
      quantity: 1,
      source: 'regular' as const,
    });
    const record = (exerciseId: string) => ({ exerciseId }) as unknown as SessionSummary['prs'][number];
    const merged = mergedSummaries(
      summary({ prs: [record('bench')], drops: [drop('d1')] }),
      summary({ prs: [record('squat')], drops: [drop('d2')] }),
    );
    expect(merged.prs).toEqual([record('bench'), record('squat')]);
    expect(merged.drops.map((each) => each.dropId)).toEqual(['d1', 'd2']);
  });

  it('keeps the latest progress of a quest and every completion and unlock once', () => {
    const progress = (stepProgress: number) => ({ questId: 'q', stepIndex: 0, stepProgress, stepTarget: 3 });
    const merged = mergedSummaries(
      summary({ quests: { completed: [], progressed: [progress(1)], unlocked: ['a'], levelUps: [] } }),
      summary({ quests: { completed: [], progressed: [progress(2)], unlocked: ['a', 'b'], levelUps: [] } }),
    );
    expect(merged.quests).toEqual({ completed: [], progressed: [progress(2)], unlocked: ['a', 'b'], levelUps: [] });
  });

  it('is history only only when both Sessions are', () => {
    expect(mergedSummaries(summary({ historyOnly: true }), summary({})).historyOnly).toBeUndefined();
    expect(mergedSummaries(summary({ historyOnly: true }), summary({ historyOnly: true })).historyOnly).toBe(true);
  });
});
