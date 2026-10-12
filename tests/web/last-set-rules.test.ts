import { describe, expect, it } from 'vitest';
import {
  lastSetChangesFor,
  lastSetDelta,
  lastSetForRow,
  lastSetName,
  lastSetText,
} from '../../web/src/features/workout/last-set-rules.ts';

const working = { isWarmup: false };
const warmup = { isWarmup: true };

describe('lastSetForRow', () => {
  const lastSession = [
    { weightKg: 60, reps: 5 },
    { weightKg: 65, reps: 5 },
  ];

  it('pairs each working set with the working set in the same place last session', () => {
    const rows = [working, working, working];
    expect(rows.map((_, index) => lastSetForRow(rows, index, lastSession))).toEqual([
      { weightKg: 60, reps: 5 },
      { weightKg: 65, reps: 5 },
      null,
    ]);
  });

  it('skips warm-ups on both counts, since last session lists working sets only', () => {
    const rows = [warmup, warmup, working, working];
    expect(rows.map((_, index) => lastSetForRow(rows, index, lastSession))).toEqual([
      null,
      null,
      { weightKg: 60, reps: 5 },
      { weightKg: 65, reps: 5 },
    ]);
  });

  it('has nothing to show without a last session', () => {
    expect(lastSetForRow([working], 0, undefined)).toBeNull();
    expect(lastSetForRow([working], 0, [])).toBeNull();
  });
});

describe('lastSetText', () => {
  it('shows weight × reps in the preferred unit', () => {
    expect(lastSetText({ weightKg: 60, reps: 5 }, 'external', 'kg')).toBe('Last 60×5');
    expect(lastSetText({ weightKg: 100, reps: 3 }, 'external', 'lb')).toBe('Last 220.5×3');
  });

  it('shows only reps for a bodyweight lift or an unloaded weighted bodyweight lift', () => {
    expect(lastSetText({ weightKg: 0, reps: 12 }, 'bodyweight', 'kg')).toBe('Last 12 reps');
    expect(lastSetText({ weightKg: 0, reps: 1 }, 'bodyweight_plus', 'kg')).toBe('Last 1 rep');
  });

  it('marks added load on a weighted bodyweight lift with a plus', () => {
    expect(lastSetText({ weightKg: 10, reps: 8 }, 'bodyweight_plus', 'kg')).toBe('Last +10×8');
  });
});

describe('lastSetName', () => {
  it('spells out the unit and the action for a screen reader', () => {
    expect(lastSetName({ weightKg: 60, reps: 5 }, 'external', 'kg', 2)).toBe('Last time 60 kg × 5, fill set 2');
    expect(lastSetName({ weightKg: 0, reps: 12 }, 'bodyweight', 'kg', 1)).toBe('Last time 12 reps, fill set 1');
    expect(lastSetName({ weightKg: 10, reps: 8 }, 'bodyweight_plus', 'lb', 1)).toBe('Last time +22 lb × 8, fill set 1');
  });
});

describe('lastSetChangesFor', () => {
  it('copies weight and reps', () => {
    expect(lastSetChangesFor({ weightKg: 62.5, reps: 4 }, 'external')).toEqual({ weightKg: 62.5, reps: 4 });
  });

  it('leaves the weight of a bodyweight lift alone', () => {
    expect(lastSetChangesFor({ weightKg: 0, reps: 10 }, 'bodyweight')).toEqual({ reps: 10 });
  });
});

describe('lastSetDelta', () => {
  const last = { weightKg: 60, reps: 5 };

  it('reports heavier weight first', () => {
    expect(lastSetDelta({ weightKg: 62.5, reps: 5 }, last, 'external', 'kg')).toEqual({
      direction: 'up',
      text: '▲ +2.5 kg',
      label: '2.5 kg more than last time',
    });
  });

  it('reports lighter weight', () => {
    expect(lastSetDelta({ weightKg: 55, reps: 5 }, last, 'external', 'kg')).toEqual({
      direction: 'down',
      text: '▼ −5 kg',
      label: '5 kg less than last time',
    });
  });

  it('reports reps when the weight held', () => {
    expect(lastSetDelta({ weightKg: 60, reps: 6 }, last, 'external', 'kg')).toEqual({
      direction: 'up',
      text: '▲ +1 rep',
      label: '1 more rep than last time',
    });
    expect(lastSetDelta({ weightKg: 60, reps: 3 }, last, 'external', 'kg')).toEqual({
      direction: 'down',
      text: '▼ −2 reps',
      label: '2 fewer reps than last time',
    });
  });

  it('names both changes, pointing the arrow by weight', () => {
    expect(lastSetDelta({ weightKg: 65, reps: 3 }, last, 'external', 'kg')).toEqual({
      direction: 'up',
      text: '▲ +5 kg −2 reps',
      label: '5 kg more and 2 fewer reps than last time',
    });
  });

  it('says when the set matched last time', () => {
    expect(lastSetDelta({ weightKg: 60, reps: 5 }, last, 'external', 'kg')).toEqual({
      direction: 'same',
      text: '= last',
      label: 'Same as last time',
    });
  });

  it('compares in the shown unit so lb rounding does not invent a change', () => {
    expect(lastSetDelta({ weightKg: 60.0001, reps: 5 }, last, 'external', 'lb').direction).toBe('same');
    expect(lastSetDelta({ weightKg: 60 + 2.267962, reps: 5 }, last, 'external', 'lb').text).toBe('▲ +5 lb');
  });

  it('ignores weight on a bodyweight lift', () => {
    expect(lastSetDelta({ weightKg: 0, reps: 11 }, { weightKg: 0, reps: 10 }, 'bodyweight', 'kg').text).toBe(
      '▲ +1 rep',
    );
  });
});
