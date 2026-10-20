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
  companionPet,
  fanfareFor,
  firstPickedItemId,
  groupItems,
  type HeldItem,
  itemNameLookup,
  kindLabel,
  newItemIds,
  rarestRecentDrop,
  showsQuantity,
  TIER_COLORS,
  toCatalogItem,
  toHeldItems,
  toRecipe,
} from '../../web/src/lib/collection/item-rules.ts';

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
  grantsChallengeId: null,
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
      ['Scrolls', 36, 0],
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

describe('firstPickedItemId', () => {
  it('picks the first new held item, else the first held item in catalog order, else nothing', () => {
    const items = fixture.filter((item) => ['rookie_belt', 'grinder_belt', 'spotter_pup'].includes(item.key));
    const owned = held({ grinder_belt: 1, spotter_pup: 1 });
    expect(firstPickedItemId(items, owned, new Set(['id-spotter_pup', 'id-rookie_belt']))).toBe('id-spotter_pup');
    expect(firstPickedItemId(items, owned, new Set())).toBe('id-grinder_belt');
    expect(firstPickedItemId(items, new Map(), new Set(['id-rookie_belt']))).toBeNull();
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

describe('row mapping', () => {
  it('maps an item row to a catalog item', () => {
    expect(
      toCatalogItem({
        id: 'item-1',
        key: 'iron_gloves',
        name: 'Iron Gloves',
        kind: 'gear',
        rarity: 'rare',
        tier: 'forged',
        gear_slot: 'gloves',
        icon_key: 'gloves',
        description: 'Grippy.',
        grants_challenge_id: null,
        sort_order: 7,
      }),
    ).toEqual({
      id: 'item-1',
      key: 'iron_gloves',
      name: 'Iron Gloves',
      kind: 'gear',
      rarity: 'rare',
      tier: 'forged',
      gearSlot: 'gloves',
      icon: 'gloves',
      description: 'Grippy.',
      grantsChallengeId: null,
      sortOrder: 7,
    });
  });

  it('keys held items by item id', () => {
    const rows = [
      { item_id: 'a', quantity: 2, first_obtained_at: '2026-09-30T00:00:00Z' },
      { item_id: 'b', quantity: 1, first_obtained_at: '2026-10-01T00:00:00Z' },
    ];
    expect([...toHeldItems(rows)]).toEqual([
      ['a', { itemId: 'a', quantity: 2, firstObtainedAt: '2026-09-30T00:00:00Z' }],
      ['b', { itemId: 'b', quantity: 1, firstObtainedAt: '2026-10-01T00:00:00Z' }],
    ]);
  });
});

describe('itemNameLookup', () => {
  it('names a known item and uses the fallback for any other id', () => {
    const nameOf = itemNameLookup(fixture, 'an item');
    expect(nameOf(fixture[0].id)).toBe(fixture[0].name);
    expect(nameOf('missing')).toBe('an item');
  });
});

describe('kindLabel', () => {
  const base = fixture[0];

  it('names the tier of gear and materials and the rarity of every kind', () => {
    expect(kindLabel({ ...base, kind: 'gear', tier: 'titan', rarity: 'rare' })).toBe('Gear · Titan tier · rare');
    expect(kindLabel({ ...base, kind: 'material', tier: 'rookie', rarity: 'common' })).toBe(
      'Material · Rookie · common',
    );
    expect(kindLabel({ ...base, kind: 'pet', tier: null, rarity: 'legendary' })).toBe('Pet · legendary');
    expect(kindLabel({ ...base, kind: 'scroll', tier: null, rarity: 'uncommon' })).toBe('Scroll · uncommon');
  });
});

describe('craft errors', () => {
  it('turns the craft rate limit into a wait message', () => {
    const problem = craftProblem({
      message: 'rate_limited',
      code: 'PT429',
      details: JSON.stringify({ bucket: 'craft_minute', retryAfterSeconds: 30 }),
    });
    expect(craftProblemText(problem, () => '')).toBe(
      "Couldn't craft: Too many changes in a short time. Try again in 1 min.",
    );
  });

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

describe('fanfareFor', () => {
  it('celebrates the rarest item found', () => {
    expect(fanfareFor(['common', 'rare', 'uncommon'])).toBe('rare');
    expect(fanfareFor(['rare', 'legendary', 'common'])).toBe('legendary');
  });

  it('stays quiet for common and uncommon finds', () => {
    expect(fanfareFor(['common', 'uncommon'])).toBeNull();
    expect(fanfareFor([])).toBeNull();
  });
});

describe('companionPet', () => {
  const pet = (id: string): CatalogItem =>
    ({
      id,
      key: id,
      name: id,
      kind: 'pet',
      rarity: 'legendary',
      tier: null,
      gearSlot: null,
      icon: 'pet',
    }) as CatalogItem;
  const belt = { ...pet('belt'), kind: 'gear' } as CatalogItem;
  const held = (entries: [string, string][]) =>
    new Map(entries.map(([itemId, firstObtainedAt]) => [itemId, { itemId, quantity: 1, firstObtainedAt }]));
  const items = [pet('pup'), pet('crab'), belt];

  it('shows the pet chosen on this device while it is held', () => {
    const owned = held([
      ['pup', '2026-10-01T00:00:00Z'],
      ['crab', '2026-10-05T00:00:00Z'],
    ]);
    expect(companionPet(items, owned, 'pup')?.id).toBe('pup');
  });

  it('falls back to the newest pet found', () => {
    const owned = held([
      ['pup', '2026-10-01T00:00:00Z'],
      ['crab', '2026-10-05T00:00:00Z'],
      ['belt', '2026-10-09T00:00:00Z'],
    ]);
    expect(companionPet(items, owned, null)?.id).toBe('crab');
    expect(companionPet(items, owned, 'gone')?.id).toBe('crab');
  });

  it('ranks a pet with no found date below a dated one', () => {
    const owned = held([
      ['crab', '2026-10-05T00:00:00Z'],
      ['pup', ''],
    ]);
    expect(companionPet([pet('crab'), pet('pup')], owned, null)?.id).toBe('crab');
  });

  it('has no companion without a pet', () => {
    expect(companionPet(items, held([['belt', '2026-10-09T00:00:00Z']]), null)).toBeNull();
  });
});

describe('rarestRecentDrop', () => {
  function item(key: string): CatalogItem {
    return fixture.find((candidate) => candidate.key === key)!;
  }

  it('picks the rarest item, the newest of equally rare ones', () => {
    const common = { item: item('rookie_belt'), droppedAt: '2026-10-20T10:00:00Z' };
    const olderPet = { item: item('spotter_pup'), droppedAt: '2026-10-10T10:00:00Z' };
    const newerPet = { item: item('plate_crab'), droppedAt: '2026-10-12T10:00:00Z' };
    expect(item('spotter_pup').rarity).toBe(item('plate_crab').rarity);
    expect(item('spotter_pup').rarity).not.toBe(item('rookie_belt').rarity);
    expect(rarestRecentDrop([common, olderPet, newerPet])).toEqual(newerPet);
  });

  it('has nothing without drops', () => {
    expect(rarestRecentDrop([])).toBeNull();
  });
});
