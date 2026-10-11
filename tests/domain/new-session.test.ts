import { describe, expect, it } from 'vitest';
import { EDIT_WINDOW_DAYS, planNewSession, resolveHistoryOnlySets } from '@domain/index.ts';
import { aBout, aSet, catalog, DAY_MS, hard, TEST_BALANCE } from './fixtures.ts';

const NOW = Date.parse('2026-10-10T12:00:00.000Z');
const BODYWEIGHT_KG = 80;

function draftStartedDaysAgo(days: number) {
  return {
    id: 'new-session',
    startedAt: new Date(NOW - days * DAY_MS).toISOString(),
    sets: [aSet('bench', 60, 8, hard), aSet('weighted-pull-up', 10, 5, hard), aBout('run', 1800, null)],
  };
}

describe('planNewSession', () => {
  it('scores a session inside the edit window and records the effective load of every lift', () => {
    const draft = draftStartedDaysAgo(EDIT_WINDOW_DAYS);
    const plan = planNewSession(draft, catalog, BODYWEIGHT_KG, NOW, TEST_BALANCE);
    expect(plan.mode).toBe('scored');
    expect(plan.session).toEqual({
      id: draft.id,
      startedAt: draft.startedAt,
      sets: [
        { ...draft.sets[0], effectiveLoadKg: 60, recordedEffectiveLoadKg: 60 },
        { ...draft.sets[1], effectiveLoadKg: 90, recordedEffectiveLoadKg: 90 },
        draft.sets[2],
      ],
    });
  });

  it('stores an older session as history only, with its sets resolved but unscored', () => {
    const draft = draftStartedDaysAgo(EDIT_WINDOW_DAYS + 1);
    const plan = planNewSession(draft, catalog, BODYWEIGHT_KG, NOW, TEST_BALANCE);
    if (plan.mode !== 'history_only') throw new Error(`expected history_only, got ${plan.mode}`);
    expect(plan.sets).toEqual(resolveHistoryOnlySets(plan.session, TEST_BALANCE, { catalog }));
    expect(plan.sets.map((result) => result.set.id)).toEqual(draft.sets.map((set) => set.id));
    expect(plan.sets.every((result) => result.xp === 0)).toBe(true);
  });
});
