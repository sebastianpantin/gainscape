import { describe, expect, it } from 'vitest';
import { painActions, painLabel } from '../../web/src/lib/workout/pain-rules.ts';

describe('painLabel', () => {
  it('words a logged pain out of 10 and says nothing when none was logged', () => {
    expect(painLabel(0)).toBe('pain 0/10');
    expect(painLabel(7)).toBe('pain 7/10');
    expect(painLabel(null)).toBeNull();
    expect(painLabel(undefined)).toBeNull();
  });
});

describe('painActions', () => {
  it('offers to log pain, starting at 0, when none was logged', () => {
    const chosen: (number | null)[] = [];
    const actions = painActions(undefined, 'set 2', (pain) => chosen.push(pain));
    expect(actions.map(({ label, accessibleName }) => [label, accessibleName])).toEqual([
      ['Log pain', 'Log pain, set 2'],
    ]);
    actions[0].onChoose();
    expect(chosen).toEqual([0]);
  });

  it('offers to clear a logged pain, even a pain of 0', () => {
    const chosen: (number | null)[] = [];
    const actions = painActions(0, 'bout 1', (pain) => chosen.push(pain));
    expect(actions.map(({ label, accessibleName }) => [label, accessibleName])).toEqual([
      ['Clear pain', 'Clear pain, bout 1'],
    ]);
    actions[0].onChoose();
    expect(chosen).toEqual([null]);
  });
});
