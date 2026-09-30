import { describe, expect, it } from 'vitest';
import { percentsFromShares, sharesToSave, shareTotal } from '../../web/src/features/exercises/share-form.ts';

const skillIds = ['chest', 'shoulders', 'arms'];
const storedShares = [
  { skillId: 'chest', shareBp: 3334 },
  { skillId: 'shoulders', shareBp: 3333 },
  { skillId: 'arms', shareBp: 3333 },
];

describe('sharesToSave', () => {
  it('converts whole percents to basis points and drops empty skills', () => {
    const form = { skillIds, percents: { chest: '40', shoulders: '60', arms: '' }, locked: false, storedShares: [] };
    expect(shareTotal(form)).toBe(100);
    expect(sharesToSave(form)).toEqual([
      { skillId: 'chest', shareBp: 4000 },
      { skillId: 'shoulders', shareBp: 6000 },
    ]);
  });

  it('refuses editable shares that are not whole percents or do not total 100', () => {
    expect(
      sharesToSave({ skillIds, percents: { chest: '50', shoulders: '49' }, locked: false, storedShares }),
    ).toBeNull();
    expect(
      sharesToSave({ skillIds, percents: percentsFromShares(storedShares), locked: false, storedShares }),
    ).toBeNull();
  });

  it('keeps the stored shares of a locked exercise even when they are not whole percents', () => {
    const form = { skillIds, percents: percentsFromShares(storedShares), locked: true, storedShares };
    expect(sharesToSave(form)).toEqual(storedShares);
  });
});
