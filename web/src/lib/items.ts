import {
  type CraftProblem,
  craftProblem,
  type HeldItem,
  INVENTORY_COLUMNS,
  ITEM_COLUMNS,
  type InventoryRow,
  type ItemCatalog,
  type ItemRow,
  RECIPE_COLUMNS,
  type RecipeRow,
  toCatalogItem,
  toHeldItems,
  toRecipe,
} from './item-rules.ts';
import type { GearSlot } from '@domain/crafting.ts';
import type { LoadoutView } from './gear-rules.ts';
import { supabase } from './supabase.ts';

export async function fetchItemCatalog(): Promise<ItemCatalog> {
  const [items, recipes] = await Promise.all([
    supabase.from('items').select(ITEM_COLUMNS).is('retired_at', null).order('sort_order'),
    supabase.from('recipes').select(RECIPE_COLUMNS).is('retired_at', null),
  ]);
  if (items.error) throw items.error;
  if (recipes.error) throw recipes.error;
  return {
    items: (items.data as ItemRow[]).map(toCatalogItem),
    recipes: (recipes.data as RecipeRow[]).map(toRecipe),
  };
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
