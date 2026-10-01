import { describe, expect, it } from 'vitest';
import {
  percentsFromShares,
  sharesToSave,
  shareTotal,
  skillsForModality,
} from '../../web/src/features/exercises/share-form.ts';

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

describe('skillsForModality', () => {
  const skills = [
    { id: 'chest', modality: 'lift' as const },
    { id: 'endurance', modality: 'cardio' as const },
    { id: 'legs', modality: 'lift' as const },
    { id: 'agility', modality: 'cardio' as const },
  ];

  it('offers only the skills of the exercise kind, in order', () => {
    expect(skillsForModality(skills, 'lift').map((skill) => skill.id)).toEqual(['chest', 'legs']);
    expect(skillsForModality(skills, 'cardio').map((skill) => skill.id)).toEqual(['endurance', 'agility']);
  });

  it('saves no share for a skill of the other kind left over from before a switch', () => {
    const percents = { chest: '100', endurance: '60', agility: '40' };
    const skillIds = skillsForModality(skills, 'cardio').map((skill) => skill.id);
    expect(sharesToSave({ skillIds, percents, locked: false, storedShares: [] })).toEqual([
      { skillId: 'endurance', shareBp: 6000 },
      { skillId: 'agility', shareBp: 4000 },
    ]);
  });
});
