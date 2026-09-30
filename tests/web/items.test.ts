import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GEAR_SLOTS, ITEM_TIERS, type ItemTier } from '../../supabase/functions/_shared/domain/crafting.ts';
import { loadCatalogData } from '../../scripts/catalog/load.ts';
import {
  type CatalogItem,
  craftProblem,
  craftProblemText,
  describeDrops,
  groupItems,
  type HeldItem,
  newItemIds,
  showsQuantity,
  TIER_COLORS,
  toRecipe,
} from '../../web/src/lib/item-rules.ts';

const fixture: CatalogItem[] = loadCatalogData().items.map((item, index) => ({
  id: `id-${item.key}`,
  key: item.key,
  name: item.name,
  kind: item.kind,
  rarity: item.rarity,
  tier: item.tier as ItemTier | null,
  gearSlot: item.gearSlot as CatalogItem['gearSlot'],
  icon: item.icon as CatalogItem['icon'],
  description: item.description,
  grantsExerciseId: null,
  sortOrder: index + 1,
}));

function held(entries: Record<string, number>): Map<string, HeldItem> {
  return new Map(
    Object.entries(entries).map(([key, quantity]) => [
      `id-${key}`,
      { itemId: `id-${key}`, quantity, firstObtainedAt: '2026-09-30T00:00:00Z' },
    ]),
  );
}

describe('groupItems', () => {
  it('has a slot for every catalog item, by kind', () => {
    const groups = groupItems(fixture, new Map());
    expect(groups.map((group) => [group.title, group.slots, group.found])).toEqual([
      ['Gear', 42, 0],
      ['Materials', 6, 0],
      ['Pets', 4, 0],
      ['Scrolls', 6, 0],
    ]);
  });

  it('orders gear by slot, then tier', () => {
    const [gear] = groupItems(fixture, new Map());
    expect(gear.entries.map((entry) => entry.item.key)).toEqual(
      GEAR_SLOTS.flatMap((slot) => ITEM_TIERS.map((tier) => `${tier}_${slot}`)),
    );
  });

  it('counts found items, including ones held at zero', () => {
    const groups = groupItems(fixture, held({ rookie_belt: 0, grinder_belt: 1, grinder_scraps: 0, spotter_pup: 1 }));
    expect(groups.map((group) => group.found)).toEqual([2, 1, 1, 0]);
    const rookieBelt = groups[0].entries.find((entry) => entry.item.key === 'rookie_belt');
    expect(rookieBelt?.held?.quantity).toBe(0);
  });

  it('marks the items of the last summary as new', () => {
    const newIds = newItemIds([{ itemId: 'id-titan_gloves' }, { itemId: 'id-forged_scraps' }]);
    const groups = groupItems(fixture, held({ titan_gloves: 1, forged_scraps: 3 }), newIds);
    const marked = groups.flatMap((group) =>
      group.entries.filter((entry) => entry.isNew).map((entry) => entry.item.key),
    );
    expect(marked).toEqual(['titan_gloves', 'forged_scraps']);
    expect(newItemIds(undefined).size).toBe(0);
  });
});

describe('item display', () => {
  it('has a colour for every item tier in the schema', () => {
    const migration = readFileSync(
      join(import.meta.dirname, '../../supabase/migrations/20260930000008_008_item_catalog.sql'),
      'utf8',
    );
    const schemaTiers = [.../item_tier as enum \(([^)]*)\)/.exec(migration)![1].matchAll(/'([a-z_]+)'/g)].map(
      (match) => match[1],
    );
    expect(schemaTiers).toEqual([...ITEM_TIERS]);
    expect(Object.keys(TIER_COLORS).sort()).toEqual([...ITEM_TIERS].sort());
    expect(new Set(Object.values(TIER_COLORS)).size).toBe(ITEM_TIERS.length);
  });

  it('shows the quantity for materials and for gear held other than once', () => {
    expect(showsQuantity({ kind: 'material' }, { quantity: 1 })).toBe(true);
    expect(showsQuantity({ kind: 'gear' }, { quantity: 1 })).toBe(false);
    expect(showsQuantity({ kind: 'gear' }, { quantity: 0 })).toBe(true);
    expect(showsQuantity({ kind: 'pet' }, { quantity: 2 })).toBe(true);
  });

  it('sums drops per item and skips zero quantities', () => {
    const nameOf = (itemId: string) => itemId.toUpperCase();
    expect(
      describeDrops(
        [
          { itemId: 'a', quantity: 3 },
          { itemId: 'b', quantity: 1 },
          { itemId: 'a', quantity: 2 },
          { itemId: 'c', quantity: 0 },
        ],
        nameOf,
      ),
    ).toBe('A ×5, B');
    expect(describeDrops([], nameOf)).toBe('');
  });

  it('sorts recipe inputs by item id like the RPC locks them', () => {
    const recipe = toRecipe({
      id: 'r',
      key: 'grinder_belt',
      output_item_id: 'o',
      output_quantity: 1,
      recipe_inputs: [
        { item_id: 'z', quantity: 8 },
        { item_id: 'a', quantity: 1 },
      ],
    });
    expect(recipe.inputs).toEqual([
      { itemId: 'a', quantity: 1 },
      { itemId: 'z', quantity: 8 },
    ]);
  });
});

describe('craft errors', () => {
  it('maps insufficient_items with its shortfall', () => {
    const problem = craftProblem({
      message: 'insufficient_items',
      details: JSON.stringify([{ itemId: 'id-grinder_scraps', have: 7, need: 8 }]),
    });
    expect(problem).toEqual({
      kind: 'insufficient_items',
      shortfall: [{ itemId: 'id-grinder_scraps', have: 7, need: 8 }],
    });
    expect(craftProblemText(problem, () => 'Grinder scraps')).toBe('Not enough materials: Grinder scraps 7 / 8.');
  });

  it('maps unknown_recipe, not_authenticated and anything else', () => {
    expect(craftProblem({ message: 'unknown_recipe' })).toEqual({ kind: 'unknown_recipe' });
    expect(craftProblem({ message: 'not_authenticated' })).toEqual({ kind: 'not_authenticated' });
    expect(craftProblem({ message: 'boom' })).toEqual({ kind: 'other', message: 'boom' });
    expect(craftProblem({ message: 'insufficient_items', details: 'not json' })).toEqual({
      kind: 'insufficient_items',
      shortfall: [],
    });
  });
});
