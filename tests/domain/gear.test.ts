import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BALANCE,
  GEAR_SLOT_SKILLS,
  GEAR_SLOTS,
  gearBonusXp,
  type GearLoadout,
  gearLoadoutFromStored,
  gearSkillBonus,
} from '@domain/index.ts';

const ALL_SKILLS = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'endurance', 'agility'];

const fullAscendant: GearLoadout = Object.fromEntries(GEAR_SLOTS.map((slot) => [slot, 'ascendant']));
const ascendantBelt: GearLoadout = { belt: 'ascendant' };
const rookieGloves: GearLoadout = { gloves: 'rookie' };

function expectBonuses(actual: Record<string, number>, expected: Record<string, number>): void {
  expect(Object.keys(actual).sort()).toEqual([...ALL_SKILLS].sort());
  for (const skill of ALL_SKILLS) expect(actual[skill], skill).toBeCloseTo(expected[skill] ?? 0, 10);
}

describe('GEAR_SLOT_SKILLS', () => {
  it('touches every skill from at least one slot', () => {
    const touched = new Set(Object.values(GEAR_SLOT_SKILLS).flat());
    expect([...touched].sort()).toEqual([...ALL_SKILLS].sort());
  });

  it('keeps the full-tier percent an integer', () => {
    expect(Number.isInteger(DEFAULT_BALANCE.gearBonusPercentAtFullTier)).toBe(true);
  });
});

describe('gearSkillBonus', () => {
  it('gives every skill 10% with full Ascendant gear', () => {
    expectBonuses(
      gearSkillBonus(fullAscendant, DEFAULT_BALANCE),
      Object.fromEntries(ALL_SKILLS.map((skill) => [skill, 0.1])),
    );
  });

  it('gives nothing with an empty, null or missing loadout', () => {
    expectBonuses(gearSkillBonus({}, DEFAULT_BALANCE), {});
    expectBonuses(gearSkillBonus(null, DEFAULT_BALANCE), {});
    expectBonuses(gearSkillBonus(undefined, DEFAULT_BALANCE), {});
  });

  it('averages an Ascendant belt over every slot that touches a skill', () => {
    expectBonuses(gearSkillBonus(ascendantBelt, DEFAULT_BALANCE), { core: 0.1, legs: 1 / 30, back: 1 / 30 });
  });

  it('scales Rookie gloves by the lowest tier factor', () => {
    expectBonuses(gearSkillBonus(rookieGloves, DEFAULT_BALANCE), {
      chest: 1 / 70,
      shoulders: 1 / 70,
      arms: 1 / 280,
    });
  });
});

describe('gearBonusXp', () => {
  it.each<[number, string, GearLoadout, number]>([
    [1000, 'core', ascendantBelt, 100],
    [1000, 'legs', ascendantBelt, 33],
    [1000, 'chest', rookieGloves, 14],
    [1000, 'arms', rookieGloves, 4],
    [5, 'legs', fullAscendant, 1],
    [4, 'legs', fullAscendant, 0],
    [15, 'legs', fullAscendant, 2],
    [0, 'core', fullAscendant, 0],
    [1000, 'chest', ascendantBelt, 0],
    [1000, 'unknown', fullAscendant, 0],
  ])('rounds %i base %s XP to the nearest whole bonus', (baseXp, skillKey, loadout, expected) => {
    expect(gearBonusXp(baseXp, skillKey, loadout, DEFAULT_BALANCE)).toBe(expected);
  });

  it('gives no bonus without a loadout', () => {
    expect(gearBonusXp(1000, 'core', null, DEFAULT_BALANCE)).toBe(0);
    expect(gearBonusXp(1000, 'core', undefined, DEFAULT_BALANCE)).toBe(0);
  });

  it.each([7.5, -1, Number.NaN])('rejects a full-tier percent of %d', (gearBonusPercentAtFullTier) => {
    expect(() => gearBonusXp(1000, 'core', ascendantBelt, { gearBonusPercentAtFullTier })).toThrow(RangeError);
  });
});

describe('gearLoadoutFromStored', () => {
  it('reads a stored slot to tier object', () => {
    expect(gearLoadoutFromStored({ belt: 'ascendant', gloves: 'rookie' })).toEqual({
      belt: 'ascendant',
      gloves: 'rookie',
    });
  });

  it('keeps an empty loadout apart from a missing one', () => {
    expect(gearLoadoutFromStored({})).toEqual({});
    expect(gearLoadoutFromStored(null)).toBeNull();
    expect(gearLoadoutFromStored(undefined)).toBeNull();
  });

  it.each<[string, unknown]>([
    ['an unknown slot', { cape: 'rookie' }],
    ['an unknown tier', { belt: 'celestial' }],
    ['a non-string tier', { belt: 3 }],
    ['an array', ['rookie']],
    ['a string', 'belt'],
  ])('rejects %s', (_case, stored) => {
    expect(() => gearLoadoutFromStored(stored)).toThrow(RangeError);
  });
});
