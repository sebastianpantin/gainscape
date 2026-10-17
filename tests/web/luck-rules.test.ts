import { describe, expect, it } from 'vitest';
import { dryRollsOf, luckView } from '../../web/src/lib/collection/luck-rules.ts';

describe('the loot luck meter', () => {
  it('starts at the base chance with an empty meter when no roll has missed', () => {
    expect(luckView(0)).toEqual({
      chanceText: 'Next drop chance 10%',
      meterFraction: 0,
      dryRollsText: '0 rolls without a drop',
      explanation: 'Every set without a drop raises the chance, up to 40%.',
    });
  });

  it('adds three points per roll without a drop', () => {
    const view = luckView(3);
    expect(view.chanceText).toBe('Next drop chance 19%');
    expect(view.meterFraction).toBeCloseTo(0.3, 10);
    expect(view.dryRollsText).toBe('3 rolls without a drop');
  });

  it('says roll, not rolls, after one miss', () => {
    expect(luckView(1).dryRollsText).toBe('1 roll without a drop');
  });

  it('caps the chance at the maximum and fills the meter', () => {
    const view = luckView(25);
    expect(view.chanceText).toBe('Next drop chance 40%');
    expect(view.meterFraction).toBe(1);
    expect(view.dryRollsText).toBe('25 rolls without a drop');
  });
});

describe('dry rolls from the drop luck rows', () => {
  it('counts zero for a player without a row', () => {
    expect(dryRollsOf([])).toBe(0);
  });

  it('reads the dry rolls of the regular table row', () => {
    expect(dryRollsOf([{ dry_rolls: 7 }])).toBe(7);
  });
});
