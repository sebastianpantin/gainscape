import { describe, expect, it } from 'vitest';
import { currentSetId } from '../../web/src/lib/workout/current-set-rules.ts';
import { cardioExercise, draftOf, lift, set } from './draft-fixtures.ts';

describe('currentSetId', () => {
  it('is null for a workout with no sets left to do', () => {
    expect(currentSetId(draftOf([]))).toBeNull();
    expect(currentSetId(draftOf([lift('squat', [set('a', { done: true })])]))).toBeNull();
  });

  it('is the first set not done, in exercise order', () => {
    const draft = draftOf([
      lift('squat', [set('s1', { done: true }), set('s2', { done: true })]),
      lift('bench', [set('b1', { done: true }), set('b2'), set('b3')]),
    ]);
    expect(currentSetId(draft)).toBe('b2');
  });

  it('counts a warm-up set as a set to do', () => {
    const draft = draftOf([lift('squat', [set('w1', { isWarmup: true }), set('s1')])]);
    expect(currentSetId(draft)).toBe('w1');
  });

  it('stays on an earlier set the user skipped', () => {
    const draft = draftOf([lift('squat', [set('s1'), set('s2', { done: true })])]);
    expect(currentSetId(draft)).toBe('s1');
  });

  it('includes cardio bouts', () => {
    expect(currentSetId(draftOf([cardioExercise()]))).toBe('bout-c');
  });

  it('walks a superset round by round', () => {
    const superset = { supersetId: 'pair' };
    const draft = (doneIds: string[]) =>
      draftOf([
        lift(
          'row',
          ['r1', 'r2', 'r3'].map((id) => set(id, { done: doneIds.includes(id) })),
          superset,
        ),
        lift(
          'press',
          ['p1', 'p2'].map((id) => set(id, { done: doneIds.includes(id) })),
          superset,
        ),
        lift('curl', [set('c1')]),
      ]);
    expect(currentSetId(draft([]))).toBe('r1');
    expect(currentSetId(draft(['r1']))).toBe('p1');
    expect(currentSetId(draft(['r1', 'p1']))).toBe('r2');
    expect(currentSetId(draft(['r1', 'p1', 'r2', 'p2']))).toBe('r3');
    expect(currentSetId(draft(['r1', 'p1', 'r2', 'p2', 'r3']))).toBe('c1');
  });
});
