import { rateLimitedMessage } from './rate-limit.ts';
import { GEAR_SLOTS, type GearSlot, ITEM_TIERS, type ItemTier, type Recipe } from '@domain/crafting.ts';
import type { DropSummary } from '@domain/types.ts';
import type { ItemIconKind } from '../components/pixel-sprites.ts';
import { capitalized } from './names.ts';

export type ItemKind = 'gear' | 'material' | 'pet' | 'scroll';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export const ITEM_COLUMNS = 'id,key,name,kind,rarity,tier,gear_slot,icon_key,description,grants_exercise_id,sort_order';
export const RECIPE_COLUMNS = 'id,key,output_item_id,output_quantity,recipe_inputs(item_id,quantity)';
export const INVENTORY_COLUMNS = 'item_id,quantity,first_obtained_at';

export const TIER_COLORS: Record<ItemTier, string> = {
  rookie: '#8a7d66',
  grinder: '#a9b4bd',
  tempered: '#7fd46a',
  forged: '#e0823d',
  titan: '#6fa8dc',
  mythic: '#b784e0',
  ascendant: '#ffb000',
};

const UNTIERED_COLOR = '#d8c8a8';
export const LOCKED_COLOR = '#5c4f3d';

export interface CatalogItem {
  id: string;
  key: string;
  name: string;
  kind: ItemKind;
  rarity: ItemRarity;
  tier: ItemTier | null;
  gearSlot: GearSlot | null;
  icon: ItemIconKind;
  description: string;
  grantsExerciseId: string | null;
  sortOrder: number;
}

export interface ItemCatalog {
  items: CatalogItem[];
  recipes: Recipe[];
}

export interface HeldItem {
  itemId: string;
  quantity: number;
  firstObtainedAt: string;
}

export type HeldItems = ReadonlyMap<string, HeldItem>;

export interface ItemSlot {
  item: CatalogItem;
  held: HeldItem | null;
  isNew: boolean;
}

export interface ItemGroup {
  title: 'Gear' | 'Materials' | 'Pets' | 'Scrolls';
  slots: number;
  found: number;
  entries: ItemSlot[];
}

export interface ItemRow {
  id: string;
  key: string;
  name: string;
  kind: ItemKind;
  rarity: ItemRarity;
  tier: ItemTier | null;
  gear_slot: GearSlot | null;
  icon_key: string;
  description: string;
  grants_exercise_id: string | null;
  sort_order: number;
}

export interface RecipeRow {
  id: string;
  key: string;
  output_item_id: string;
  output_quantity: number;
  recipe_inputs: { item_id: string; quantity: number }[];
}

export interface InventoryRow {
  item_id: string;
  quantity: number;
  first_obtained_at: string;
}

export function toCatalogItem(row: ItemRow): CatalogItem {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    kind: row.kind,
    rarity: row.rarity,
    tier: row.tier,
    gearSlot: row.gear_slot,
    icon: row.icon_key as ItemIconKind,
    description: row.description,
    grantsExerciseId: row.grants_exercise_id,
    sortOrder: row.sort_order,
  };
}

export function toRecipe(row: RecipeRow): Recipe {
  return {
    id: row.id,
    key: row.key,
    outputItemId: row.output_item_id,
    outputQuantity: row.output_quantity,
    inputs: [...row.recipe_inputs]
      .sort((a, b) => a.item_id.localeCompare(b.item_id))
      .map((input) => ({ itemId: input.item_id, quantity: input.quantity })),
  };
}

export function toHeldItems(rows: readonly InventoryRow[]): Map<string, HeldItem> {
  return new Map(
    rows.map((row) => [
      row.item_id,
      { itemId: row.item_id, quantity: row.quantity, firstObtainedAt: row.first_obtained_at },
    ]),
  );
}

export function quantities(held: HeldItems): Map<string, number> {
  return new Map([...held.values()].map((entry) => [entry.itemId, entry.quantity]));
}

export function tiersOf(items: readonly CatalogItem[]): Map<string, ItemTier | null> {
  return new Map(items.map((item) => [item.id, item.tier]));
}

export function colorFor(item: Pick<CatalogItem, 'tier'>): string {
  return item.tier ? TIER_COLORS[item.tier] : UNTIERED_COLOR;
}

export function showsQuantity(item: Pick<CatalogItem, 'kind'>, held: Pick<HeldItem, 'quantity'>): boolean {
  return item.kind === 'material' || held.quantity !== 1;
}

export function newItemIds(drops: readonly Pick<DropSummary, 'itemId'>[] | undefined): Set<string> {
  return new Set((drops ?? []).map((drop) => drop.itemId));
}

function gearOrder(item: CatalogItem): number {
  return (
    GEAR_SLOTS.indexOf(item.gearSlot ?? GEAR_SLOTS[0]) * ITEM_TIERS.length + ITEM_TIERS.indexOf(item.tier ?? 'rookie')
  );
}

const GROUPS: { title: ItemGroup['title']; kind: ItemKind }[] = [
  { title: 'Gear', kind: 'gear' },
  { title: 'Materials', kind: 'material' },
  { title: 'Pets', kind: 'pet' },
  { title: 'Scrolls', kind: 'scroll' },
];

export function groupItems(
  items: readonly CatalogItem[],
  held: HeldItems,
  newIds: ReadonlySet<string> = new Set(),
): ItemGroup[] {
  return GROUPS.map(({ title, kind }) => {
    const ofKind = items
      .filter((item) => item.kind === kind)
      .sort((a, b) => (kind === 'gear' ? gearOrder(a) - gearOrder(b) : 0) || a.sortOrder - b.sortOrder);
    const entries = ofKind.map((item) => ({
      item,
      held: held.get(item.id) ?? null,
      isNew: newIds.has(item.id),
    }));
    return { title, slots: entries.length, found: entries.filter((entry) => entry.held).length, entries };
  });
}

export function kindLabel(item: CatalogItem): string {
  const tierName = item.tier ? capitalized(item.tier) : '';
  switch (item.kind) {
    case 'gear':
      return `Gear · ${tierName} tier · ${item.rarity}`;
    case 'material':
      return `Material · ${tierName} · ${item.rarity}`;
    case 'pet':
      return `Pet · ${item.rarity}`;
    case 'scroll':
      return `Scroll · ${item.rarity}`;
  }
}

export interface CraftShortfall {
  itemId: string;
  have: number;
  need: number;
}

export type CraftProblem =
  | { kind: 'insufficient_items'; shortfall: CraftShortfall[] }
  | { kind: 'unknown_recipe' }
  | { kind: 'not_authenticated' }
  | { kind: 'other'; message: string };

function parsedShortfall(details: string | null | undefined): CraftShortfall[] {
  try {
    const parsed: unknown = JSON.parse(details ?? '[]');
    return Array.isArray(parsed) ? (parsed as CraftShortfall[]) : [];
  } catch {
    return [];
  }
}

export function craftProblem(error: { message: string; code?: string; details?: string | null }): CraftProblem {
  const rateLimited = rateLimitedMessage(error);
  if (rateLimited !== null) return { kind: 'other', message: rateLimited };
  switch (error.message) {
    case 'insufficient_items':
      return { kind: 'insufficient_items', shortfall: parsedShortfall(error.details) };
    case 'unknown_recipe':
      return { kind: 'unknown_recipe' };
    case 'not_authenticated':
      return { kind: 'not_authenticated' };
    default:
      return { kind: 'other', message: error.message };
  }
}

export function craftProblemText(problem: CraftProblem, nameOf: (itemId: string) => string): string {
  switch (problem.kind) {
    case 'insufficient_items':
      return problem.shortfall.length === 0
        ? 'Not enough materials any more.'
        : `Not enough materials: ${problem.shortfall
            .map((entry) => `${nameOf(entry.itemId)} ${entry.have} / ${entry.need}`)
            .join(', ')}.`;
    case 'unknown_recipe':
      return 'That recipe is no longer available.';
    case 'not_authenticated':
      return 'Sign in again to craft.';
    case 'other':
      return `Couldn't craft: ${problem.message}`;
  }
}

export function describeDrops(
  drops: readonly { itemId: string; quantity: number }[],
  nameOf: (itemId: string) => string,
): string {
  const totals = new Map<string, number>();
  for (const drop of drops) totals.set(drop.itemId, (totals.get(drop.itemId) ?? 0) + drop.quantity);
  return [...totals]
    .filter(([, quantity]) => quantity > 0)
    .map(([itemId, quantity]) => (quantity > 1 ? `${nameOf(itemId)} ×${quantity}` : nameOf(itemId)))
    .join(', ');
}
