import {
  type CraftProblem,
  craftProblem,
  type HeldItem,
  INVENTORY_COLUMNS,
  ITEM_COLUMNS,
  type InventoryRow,
  type ItemCatalog,
  type ItemRow,
  type OwnedPets,
  queryOwnedPets,
  RECIPE_COLUMNS,
  type RecipeRow,
  toCatalogItem,
  toHeldItems,
  toRecipe,
} from './item-rules.ts';
import type { GearSlot } from '@domain/crafting.ts';
import { DEFAULT_BALANCE } from '@domain/index.ts';
import type { StrengthState } from '@domain/types.ts';
import {
  type CacheFirstLoad,
  failFastWhenOffline,
  isDeviceOffline,
  loadCacheFirstWhenOffline,
} from '../offline/cache-first.ts';
import {
  type ChallengeExerciseEntry,
  type ItemsCache,
  itemsFromLiveAndCache,
  readItemsCache,
  saveItemsCache,
} from '../offline/items-cache.ts';
import { fetchExercises } from './catalog.ts';
import { readCachedExercises } from './catalog-cache.ts';
import { CHALLENGE_COLUMNS, type ChallengeRow, toCatalogChallenge } from './challenge-rules.ts';
import { fetchStrengthState } from './collection-data.ts';
import type { LoadoutView } from './gear-rules.ts';
import { deviceStorage } from './keyed-store.ts';
import { supabase } from './supabase.ts';

export async function fetchItemCatalog(): Promise<ItemCatalog> {
  const [items, recipes, challenges] = await Promise.all([
    supabase.from('items').select(ITEM_COLUMNS).is('retired_at', null).order('sort_order'),
    supabase.from('recipes').select(RECIPE_COLUMNS).is('retired_at', null),
    supabase.from('challenges').select(CHALLENGE_COLUMNS).is('retired_at', null),
  ]);
  if (items.error) throw items.error;
  if (recipes.error) throw recipes.error;
  if (challenges.error) throw challenges.error;
  return {
    items: (items.data as ItemRow[]).map(toCatalogItem),
    recipes: (recipes.data as RecipeRow[]).map(toRecipe),
    challenges: (challenges.data as ChallengeRow[]).flatMap((row) => toCatalogChallenge(row) ?? []),
  };
}

export async function fetchOwnedPets(userId: string): Promise<OwnedPets> {
  failFastWhenOffline();
  return queryOwnedPets(supabase, userId);
}

export async function fetchInventory(userId: string): Promise<Map<string, HeldItem>> {
  const { data, error } = await supabase.from('user_items').select(INVENTORY_COLUMNS).eq('user_id', userId);
  if (error) throw error;
  return toHeldItems(data as InventoryRow[]);
}

export interface CraftResult {
  craftId: string;
  itemId: string;
  quantity: number;
  equippedSlot: GearSlot | null;
}

export async function craftItem(
  recipeId: string,
): Promise<{ kind: 'ok'; result: CraftResult } | { kind: 'problem'; problem: CraftProblem }> {
  const { data, error } = await supabase.rpc('craft', { recipe_id: recipeId });
  if (error) return { kind: 'problem', problem: craftProblem(error) };
  return { kind: 'ok', result: data as CraftResult };
}

export async function fetchLoadout(userId: string): Promise<LoadoutView | null> {
  const { data, error } = await supabase.rpc('get_loadout', { target: userId });
  if (error) throw error;
  return data as LoadoutView | null;
}

export async function equipGear(slot: GearSlot, itemId: string): Promise<void> {
  const { error } = await supabase.rpc('equip_gear', { slot, item_id: itemId });
  if (error) throw error;
}

export async function unequipGear(slot: GearSlot): Promise<void> {
  const { error } = await supabase.rpc('unequip_gear', { slot });
  if (error) throw error;
}

export interface LoadedItems {
  catalog: ItemCatalog;
  held: Map<string, HeldItem>;
  challengeExercises: ChallengeExerciseEntry[];
  strength: StrengthState | null;
}

function loadedFrom(cache: ItemsCache, strength: StrengthState | null): LoadedItems {
  return {
    catalog: cache.catalog,
    held: new Map(cache.inventory.map((entry) => [entry.itemId, entry])),
    challengeExercises: cache.challengeExercises,
    strength,
  };
}

async function loadItemsOnline(userId: string, signal: AbortSignal | undefined): Promise<LoadedItems> {
  const strengthAsOf = new Date().toISOString();
  const [catalog, held, exercises, strength] = await Promise.all([
    fetchItemCatalog(),
    fetchInventory(userId),
    fetchExercises({ includeArchived: true }).catch(() => null),
    fetchStrengthState(strengthAsOf, DEFAULT_BALANCE.e1rmWindowDays).catch(() => null),
  ]);
  const storage = deviceStorage();
  const cached = readItemsCache(storage, userId);
  const live = { catalog, inventory: [...held.values()], exercises, strength, strengthAsOf };
  const saved = itemsFromLiveAndCache(live, cached, storage && readCachedExercises(storage, userId));
  if (!signal?.aborted) saveItemsCache(storage, userId, saved);
  return loadedFrom(saved, strength ?? cached?.strength ?? null);
}

function loadItemsFromCache(userId: string): LoadedItems | null {
  const cached = readItemsCache(deviceStorage(), userId);
  return cached && loadedFrom(cached, cached.strength);
}

export function loadItemsCacheFirst(userId: string, signal?: AbortSignal): Promise<CacheFirstLoad<LoadedItems>> {
  return loadCacheFirstWhenOffline(
    isDeviceOffline,
    () => loadItemsFromCache(userId),
    () => loadItemsOnline(userId, signal),
  );
}
