import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LOOT,
  eligibleRolls,
  type LootCandidate,
  type LootDayState,
  lootRollKey,
  MAX_LEVEL,
  petChance,
  qualifies,
  revokedInReplayOrder,
  rollSessionLoot,
  type SkillXp,
  xpForLevel,
} from '@domain/index.ts';
import { candidate, FIXTURE_TABLES, fixedRngFor, FRESH_DAY, scriptedRng } from './loot-fixtures.ts';

const HIT = 0;
const MISS = 0.999999;

const trained = (xpBySkill: Record<string, number>): SkillXp[] =>
  Object.entries(xpBySkill).map(([skillId, xp]) => ({ skillId, xp }));

const petRolls = (candidates: readonly LootCandidate[], day: LootDayState, values: readonly number[]) =>
  rollSessionLoot(candidates, FIXTURE_TABLES, day, DEFAULT_LOOT, () => scriptedRng(values)).rolls.filter(
    (roll) => roll.kind === 'pet',
  );

describe('pet chance', () => {
  it('is the XP a set earns in skills whose pet is still missing over the expected XP per pet', () => {
    expect(petChance(DEFAULT_LOOT.petExpectedXp / 1000, DEFAULT_LOOT)).toBe(0.001);
    expect(petChance(0, DEFAULT_LOOT)).toBe(0);
    expect(petChance(DEFAULT_LOOT.petExpectedXp * 2, DEFAULT_LOOT)).toBe(1);
  });

  it('expects a pet about a third of the way to level 99', () => {
    const share = DEFAULT_LOOT.petExpectedXp / xpForLevel(MAX_LEVEL);
    expect(share).toBeGreaterThan(0.25);
    expect(share).toBeLessThan(0.4);
  });

  it('rolls at the chance of the unowned skills the set trained', () => {
    const set = candidate('s', 0, { skillXp: trained({ legs: 3000, chest: 1000, grip: 500 }) });
    const owned = { ...FRESH_DAY, ownedPetItemIds: new Set(['item-chest-pet']) };
    const [roll] = petRolls([set], owned, [MISS]);
    expect(roll).toMatchObject({ setId: 's', tableId: 'table-pets', hit: false, drop: null });
    expect(roll.chance).toBe(petChance(3000, DEFAULT_LOOT));
  });
});

describe('pet rolls', () => {
  it('needs XP in a skill whose pet the user does not own yet', () => {
    const owned = { ...FRESH_DAY, ownedPetItemIds: new Set(['item-legs-pet']) };
    expect(petRolls([candidate('none', 0)], FRESH_DAY, [HIT])).toEqual([]);
    expect(petRolls([candidate('grip', 0, { skillXp: trained({ grip: 900 }) })], FRESH_DAY, [HIT])).toEqual([]);
    expect(petRolls([candidate('legs', 0, { skillXp: trained({ legs: 900 }) })], owned, [HIT])).toEqual([]);
  });

  it('needs a set that earns a regular roll', () => {
    const easy = candidate('easy', 0, { effectiveReps: 0, skillXp: trained({ legs: 900 }) });
    expect(qualifies('pet', easy, DEFAULT_LOOT)).toBe(false);
    expect(petRolls([easy], FRESH_DAY, [HIT])).toEqual([]);
  });

  it('picks the pet weighted by the XP the set earned in each unowned skill', () => {
    const set = candidate('s', 0, { skillXp: trained({ legs: 3000, back: 1000 }) });
    const pick = (u: number) => petRolls([set], FRESH_DAY, [HIT, u])[0].drop;
    expect(pick(0.74)).toEqual({ itemId: 'item-legs-pet', itemKey: 'legs_pet', quantity: 1 });
    expect(pick(0.24)).toEqual({ itemId: 'item-back-pet', itemKey: 'back_pet', quantity: 1 });
    expect(pick(0.26)).toEqual({ itemId: 'item-legs-pet', itemKey: 'legs_pet', quantity: 1 });
  });

  it('never drops a pet twice, even within one session', () => {
    const sets = [0, 1, 2].map((position) => candidate(`s${position}`, position, { skillXp: trained({ legs: 900 }) }));
    const rolls = petRolls(sets, FRESH_DAY, [HIT, 0.5]);
    expect(rolls.map((roll) => [roll.setId, roll.drop?.itemKey])).toEqual([['s0', 'legs_pet']]);
  });

  it('has no daily cap and numbers rolls on from the ones already made today', () => {
    const sets = Array.from({ length: 40 }, (_, index) =>
      candidate(`s${index}`, index, { skillXp: trained({ legs: 900 }) }),
    );
    const rolls = petRolls(sets, { ...FRESH_DAY, petUsed: 7 }, [MISS]);
    expect(rolls.map((roll) => roll.rollIndex)).toEqual(sets.map((_, index) => 7 + index));
  });

  it('skips sets that already rolled for a pet', () => {
    const set = candidate('s', 0, { skillXp: trained({ legs: 900 }) });
    const day = { ...FRESH_DAY, alreadyRolled: new Set([lootRollKey('s', 'pet')]) };
    expect(petRolls([set], day, [HIT])).toEqual([]);
    expect(eligibleRolls([set], day, DEFAULT_LOOT).map(({ kind }) => kind)).toEqual(['regular']);
  });

  it('lists the pet roll after the regular and PR rolls of a set', () => {
    const set = candidate('s', 0, { personalRecord: true, skillXp: trained({ legs: 900 }) });
    expect(eligibleRolls([set], FRESH_DAY, DEFAULT_LOOT).map(({ kind }) => kind)).toEqual(['regular', 'pr', 'pet']);
  });

  it('hits at the rolled chance over many sets', () => {
    const xp = DEFAULT_LOOT.petExpectedXp / 200;
    const sets = Array.from({ length: 200_000 }, (_, index) =>
      candidate(`s${index}`, index, { skillXp: trained({ chest: xp }) }),
    );
    const rngFor = fixedRngFor('pet-rate');
    const hits = sets.filter(
      (set) => rollSessionLoot([set], FIXTURE_TABLES, FRESH_DAY, DEFAULT_LOOT, rngFor).rolls.at(-1)?.hit,
    ).length;
    expect(hits / sets.length).toBeGreaterThan(0.0045);
    expect(hits / sets.length).toBeLessThan(0.0055);
  });

  it('keeps every chance within (0, 1] and every drop a pet the user lacked', () => {
    fc.assert(
      fc.property(
        fc.array(fc.dictionary(fc.constantFrom('legs', 'chest', 'back', 'grip'), fc.nat(5_000_000)), { maxLength: 8 }),
        fc.subarray(['item-legs-pet', 'item-chest-pet', 'item-back-pet']),
        (xpPerSet, ownedIds) => {
          const sets = xpPerSet.map((xp, index) => candidate(`s${index}`, index, { skillXp: trained(xp) }));
          const rolls = rollSessionLoot(
            sets,
            FIXTURE_TABLES,
            { ...FRESH_DAY, ownedPetItemIds: new Set(ownedIds) },
            DEFAULT_LOOT,
            fixedRngFor('pet-property'),
          ).rolls.filter((roll) => roll.kind === 'pet');
          const dropped = rolls.flatMap((roll) => (roll.drop === null ? [] : [roll.drop.itemId]));
          expect(rolls.every((roll) => roll.chance > 0 && roll.chance <= 1)).toBe(true);
          expect(new Set(dropped).size).toBe(dropped.length);
          expect(dropped.some((itemId) => ownedIds.includes(itemId))).toBe(false);
        },
      ),
    );
  });
});

describe('revoked pets', () => {
  it('order after the regular and PR drops of the same set', () => {
    const revoked = (dropId: string, source: 'regular' | 'pr' | 'pet') => ({
      dropId,
      sessionId: 'session',
      setId: 'set',
      itemId: `item-${dropId}`,
      itemKey: dropId,
      quantity: 1,
      source,
      revokedQuantity: 1,
    });
    const ordered = revokedInReplayOrder(
      [revoked('pet', 'pet'), revoked('pr', 'pr'), revoked('regular', 'regular')],
      [{ setId: 'set', position: 0 }],
      ['session'],
    );
    expect(ordered.map((drop) => drop.source)).toEqual(['regular', 'pr', 'pet']);
  });
});
