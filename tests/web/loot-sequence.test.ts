import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DropSummary } from '../../supabase/functions/_shared/domain/types.ts';
import type { CatalogItem, ItemKind, ItemRarity } from '../../web/src/lib/collection/item-rules.ts';
import { LOOT_SEQUENCE_MAX_S, lootSequence } from '../../web/src/features/summary/loot-rules.ts';

function item(id: string, rarity: ItemRarity, kind: ItemKind = 'gear'): CatalogItem {
  return {
    id,
    key: id,
    name: id,
    kind,
    rarity,
    tier: null,
    gearSlot: null,
    icon: kind === 'pet' ? 'pet' : 'scraps',
    description: `${id} description`,
    grantsChallengeId: null,
    sortOrder: 0,
  };
}

function drop(itemId: string, index = 0): DropSummary {
  return { dropId: `${itemId}-${index}`, setId: 'set', itemId, itemKey: itemId, quantity: 1, source: 'regular' };
}

const CATALOG = [
  item('scraps', 'common', 'material'),
  item('belt', 'uncommon'),
  item('straps', 'rare'),
  item('crown', 'legendary'),
  item('pup', 'legendary', 'pet'),
];

describe('lootSequence', () => {
  it('brings the loot out from the commonest to the rarest, with a pet last', () => {
    const sequence = lootSequence([drop('pup'), drop('crown'), drop('straps'), drop('scraps'), drop('belt')], CATALOG);
    expect(sequence.steps.map((step) => step.drop.itemId)).toEqual(['scraps', 'belt', 'straps', 'crown', 'pup']);
    expect(sequence.steps.map((step) => step.beat)).toEqual(['plain', 'plain', 'rare', 'legendary', 'pet']);
  });

  it('keeps the order drops arrived in among drops of the same rarity', () => {
    const sequence = lootSequence([drop('scraps', 1), drop('belt'), drop('scraps', 2)], CATALOG);
    expect(sequence.steps.map((step) => step.drop.dropId)).toEqual(['scraps-1', 'scraps-2', 'belt-0']);
  });

  it('opens the lid before the first drop and pauses longer before a rarer one', () => {
    const { steps } = lootSequence([drop('scraps'), drop('belt'), drop('straps'), drop('crown')], CATALOG);
    const gaps = steps.map((step, index) => step.landsAtS - (index === 0 ? 0 : steps[index - 1].landsAtS));
    expect(gaps[0]).toBeGreaterThan(gaps[1]);
    expect(gaps[2]).toBeGreaterThan(gaps[1]);
    expect(gaps[3]).toBeGreaterThan(gaps[2]);
  });

  it('plays the fanfare and shakes the panel as the rarest drop lands', () => {
    const sequence = lootSequence([drop('crown'), drop('scraps'), drop('straps')], CATALOG);
    const crown = sequence.steps.find((step) => step.drop.itemId === 'crown');
    expect(sequence.fanfare).toEqual({ kind: 'legendary', atS: crown?.landsAtS });
    expect(sequence.shakeAtS).toBe(crown?.landsAtS);
  });

  it('plays a rare fanfare without a shake when nothing legendary dropped', () => {
    const sequence = lootSequence([drop('straps'), drop('scraps')], CATALOG);
    expect(sequence.fanfare?.kind).toBe('rare');
    expect(sequence.shakeAtS).toBeNull();
  });

  it('has no fanfare for common loot', () => {
    expect(lootSequence([drop('scraps'), drop('belt')], CATALOG).fanfare).toBeNull();
  });

  it('brings an unknown item out first, as a plain drop', () => {
    const sequence = lootSequence([drop('straps'), drop('retired')], CATALOG);
    expect(sequence.steps[0]).toMatchObject({ item: null, beat: 'plain' });
  });

  it('ends after the last drop has landed', () => {
    const sequence = lootSequence([drop('scraps'), drop('crown')], CATALOG);
    expect(sequence.endS).toBeGreaterThan(sequence.steps.at(-1)!.landsAtS);
  });

  it('is empty without drops', () => {
    expect(lootSequence([], CATALOG)).toEqual({ steps: [], fanfare: null, shakeAtS: null, endS: 0 });
  });

  it('never runs longer than the cap, however much dropped, and lands every drop in order', () => {
    const rarities = fc.constantFrom('scraps', 'belt', 'straps', 'crown', 'pup');
    fc.assert(
      fc.property(fc.array(rarities, { minLength: 1, maxLength: 40 }), (itemIds) => {
        const sequence = lootSequence(
          itemIds.map((itemId, index) => drop(itemId, index)),
          CATALOG,
        );
        expect(sequence.steps).toHaveLength(itemIds.length);
        expect(sequence.endS).toBeLessThanOrEqual(LOOT_SEQUENCE_MAX_S);
        for (const [index, step] of sequence.steps.entries())
          if (index > 0) expect(step.landsAtS).toBeGreaterThan(sequence.steps[index - 1].landsAtS);
      }),
    );
  });
});
