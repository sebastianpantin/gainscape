import { describe, expect, it } from 'vitest';
import { canCraft, ITEM_TIERS, type ItemTier, type Recipe, recipeFor } from '@domain/index.ts';
import { loadCatalogData } from '../../scripts/catalog/load.ts';

const catalog = loadCatalogData();
const recipes: Recipe[] = catalog.recipes.map((recipe) => ({
  id: recipe.key,
  key: recipe.key,
  outputItemId: recipe.output,
  outputQuantity: recipe.outputQuantity,
  inputs: recipe.inputs.map((input) => ({ itemId: input.item, quantity: input.quantity })),
}));
const tierOf = new Map<string, ItemTier | null>(catalog.items.map((item) => [item.key, item.tier as ItemTier | null]));
const slots = ['belt', 'chalk', 'straps', 'sleeves', 'shoes', 'gloves'];

const rookieBelt: Recipe = {
  id: 'r',
  key: 'grinder_belt',
  outputItemId: 'grinder_belt',
  outputQuantity: 1,
  inputs: [
    { itemId: 'rookie_belt', quantity: 1 },
    { itemId: 'grinder_scraps', quantity: 8 },
  ],
};

describe('canCraft', () => {
  it('is true with exactly the needed quantities', () => {
    expect(
      canCraft(
        rookieBelt,
        new Map([
          ['rookie_belt', 1],
          ['grinder_scraps', 8],
        ]),
      ),
    ).toBe(true);
  });

  it('is false one short', () => {
    expect(
      canCraft(
        rookieBelt,
        new Map([
          ['rookie_belt', 1],
          ['grinder_scraps', 7],
        ]),
      ),
    ).toBe(false);
  });

  it('is false with an input missing from the inventory', () => {
    expect(canCraft(rookieBelt, new Map([['grinder_scraps', 20]]))).toBe(false);
  });

  it('is false for a recipe without inputs', () => {
    expect(canCraft({ inputs: [] }, new Map())).toBe(false);
  });
});

describe('recipeFor', () => {
  it.each(slots)('upgrades every %s tier into the next one', (slot) => {
    ITEM_TIERS.forEach((tier, index) => {
      const next = ITEM_TIERS[index + 1];
      const recipe = recipeFor(`${tier}_${slot}`, recipes, tierOf);
      if (next === undefined) {
        expect(recipe).toBeUndefined();
        return;
      }
      expect(recipe?.outputItemId).toBe(`${next}_${slot}`);
      expect(recipe?.inputs).toEqual([
        { itemId: `${tier}_${slot}`, quantity: 1 },
        { itemId: `${next}_scraps`, quantity: expect.any(Number) },
      ]);
    });
  });

  it('has no single upgrade for scraps, pets or scrolls', () => {
    for (const key of ['grinder_scraps', 'spotter_pup', 'scroll_pause_squat']) {
      expect(recipeFor(key, recipes, tierOf), key).toBeUndefined();
    }
  });
});
