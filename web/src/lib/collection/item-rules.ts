import { type SupabaseClient } from '@supabase/supabase-js';
import { rateLimitedMessage } from '../platform/rate-limit.ts';
import { GEAR_SLOTS, type GearSlot, ITEM_TIERS, type ItemTier, type Recipe } from '@domain/crafting.ts';
import type { DropSummary } from '@domain/types.ts';
import type { ItemIconKind } from '../../components/pixel-sprites.ts';
import type { CatalogChallenge } from './challenge-rules.ts';
import { capitalized } from '../names.ts';
import { z } from 'zod';
import { parsedJson } from '../json-rules.ts';
import { parsedRows } from '../rows.ts';

export const ITEM_KINDS = ['gear', 'material', 'pet', 'scroll'] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];
export const ITEM_RARITIES = ['common', 'uncommon', 'rare', 'legendary'] as const;
export type ItemRarity = (typeof ITEM_RARITIES)[number];

export const ITEM_ACTIONS_OFFLINE_TEXT = "You're offline. Equipping and crafting need a connection.";

export const ITEM_COLUMNS =
  'id,key,name,kind,rarity,tier,gear_slot,icon_key,description,grants_challenge_id,sort_order';
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
  grantsChallengeId: string | null;
  sortOrder: number;
}

export interface ItemCatalog {
  items: CatalogItem[];
  recipes: Recipe[];
  challenges: CatalogChallenge[];
}

export interface HeldItem {
  itemId: string;
  quantity: number;
  firstObtainedAt: string;
}

type HeldItems = ReadonlyMap<string, HeldItem>;

interface ItemSlot {
  item: CatalogItem;
  held: HeldItem | null;
  isNew: boolean;
}

interface ItemGroup {
  title: 'Gear' | 'Materials' | 'Pets' | 'Scrolls';
  slots: number;
  found: number;
  entries: ItemSlot[];
}

export const itemRowSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  kind: z.enum(ITEM_KINDS),
  rarity: z.enum(ITEM_RARITIES),
  tier: z.enum(ITEM_TIERS).nullable(),
  gear_slot: z.enum(GEAR_SLOTS).nullable(),
  icon_key: z.string(),
  description: z.string(),
  grants_challenge_id: z.string().nullable(),
  sort_order: z.number(),
});

type ItemRow = z.infer<typeof itemRowSchema>;

export const recipeRowSchema = z.object({
  id: z.string(),
  key: z.string(),
  output_item_id: z.string(),
  output_quantity: z.number(),
  recipe_inputs: z.array(z.object({ item_id: z.string(), quantity: z.number() })),
});

type RecipeRow = z.infer<typeof recipeRowSchema>;

export const inventoryRowSchema = z.object({
  item_id: z.string(),
  quantity: z.number(),
  first_obtained_at: z.string(),
});

type InventoryRow = z.infer<typeof inventoryRowSchema>;

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
    grantsChallengeId: row.grants_challenge_id,
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

export function itemNameLookup(items: readonly CatalogItem[], fallback: string): (itemId: string) => string {
  const names = new Map(items.map((item) => [item.id, item.name]));
  return (itemId) => names.get(itemId) ?? fallback;
}

export function colorFor(item: Pick<CatalogItem, 'tier'>): string {
  return item.tier ? TIER_COLORS[item.tier] : UNTIERED_COLOR;
}

export function companionPet(
  items: readonly CatalogItem[],
  held: HeldItems,
  chosenId: string | null,
): CatalogItem | null {
  const pets = items.filter((item) => item.kind === 'pet' && held.has(item.id));
  const chosen = pets.find((pet) => pet.id === chosenId);
  if (chosen) return chosen;
  const foundAt = (pet: CatalogItem) => {
    const time = Date.parse(held.get(pet.id)?.firstObtainedAt ?? '');
    return Number.isNaN(time) ? -Infinity : time;
  };
  return pets.reduce<CatalogItem | null>(
    (newest, pet) => (newest && foundAt(newest) >= foundAt(pet) ? newest : pet),
    null,
  );
}

export interface OwnedPets {
  items: CatalogItem[];
  held: Map<string, HeldItem>;
}

const ownedPetRowSchema = z.object({
  quantity: z.number(),
  first_obtained_at: z.string(),
  items: itemRowSchema,
});

export async function queryOwnedPets(client: SupabaseClient, userId: string): Promise<OwnedPets> {
  const { data, error } = await client
    .from('user_items')
    .select(`quantity,first_obtained_at,items!inner(${ITEM_COLUMNS})`)
    .eq('user_id', userId)
    .eq('items.kind', 'pet')
    .gt('quantity', 0);
  if (error) throw error;
  const rows = parsedRows(ownedPetRowSchema, data);
  return {
    items: rows.map((row) => toCatalogItem(row.items)),
    held: new Map(
      rows.map((row) => [
        row.items.id,
        { itemId: row.items.id, quantity: row.quantity, firstObtainedAt: row.first_obtained_at },
      ]),
    ),
  };
}

const recentDropRowSchema = z.object({ created_at: z.string(), items: itemRowSchema });

const RECENT_DROPS_READ = 100;

export interface RecentDrop {
  item: CatalogItem;
  droppedAt: string;
}

export async function queryRecentDrops(client: SupabaseClient, userId: string, since: string): Promise<RecentDrop[]> {
  const { data, error } = await client
    .from('drops')
    .select(`created_at,items!inner(${ITEM_COLUMNS})`)
    .eq('user_id', userId)
    .is('revoked_at', null)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(RECENT_DROPS_READ);
  if (error) throw error;
  return parsedRows(recentDropRowSchema, data).map((row) => ({
    item: toCatalogItem(row.items),
    droppedAt: row.created_at,
  }));
}

function isRarerOrNewer(candidate: RecentDrop, best: RecentDrop): boolean {
  const rarity = ITEM_RARITIES.indexOf(candidate.item.rarity) - ITEM_RARITIES.indexOf(best.item.rarity);
  return rarity === 0 ? Date.parse(candidate.droppedAt) > Date.parse(best.droppedAt) : rarity > 0;
}

export function rarestRecentDrop(drops: readonly RecentDrop[]): RecentDrop | null {
  return drops.reduce<RecentDrop | null>(
    (best, drop) => (best === null || isRarerOrNewer(drop, best) ? drop : best),
    null,
  );
}

export type Fanfare = Extract<ItemRarity, 'rare' | 'legendary'>;

export function fanfareFor(rarities: readonly ItemRarity[]): Fanfare | null {
  const rarest = Math.max(-1, ...rarities.map((rarity) => ITEM_RARITIES.indexOf(rarity)));
  const rarity = ITEM_RARITIES[rarest];
  return rarity === 'rare' || rarity === 'legendary' ? rarity : null;
}

export function showsQuantity(item: Pick<CatalogItem, 'kind'>, held: Pick<HeldItem, 'quantity'>): boolean {
  return item.kind === 'material' || held.quantity !== 1;
}

export function newItemIds(drops: readonly Pick<DropSummary, 'itemId'>[] | undefined): Set<string> {
  return new Set((drops ?? []).map((drop) => drop.itemId));
}

export function firstPickedItemId(
  items: readonly CatalogItem[],
  held: HeldItems,
  newIds: ReadonlySet<string>,
): string | null {
  const found = items.filter((item) => held.has(item.id));
  return (found.find((item) => newIds.has(item.id)) ?? found[0])?.id ?? null;
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

export const craftResultSchema = z.object({
  craftId: z.string(),
  itemId: z.string(),
  quantity: z.number(),
  equippedSlot: z.enum(GEAR_SLOTS).nullable(),
});

export type CraftResult = z.infer<typeof craftResultSchema>;

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
  const parsed = parsedJson(details ?? '[]');
  return Array.isArray(parsed) ? (parsed as CraftShortfall[]) : [];
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
