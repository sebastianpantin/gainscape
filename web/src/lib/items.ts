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
}

export async function craftItem(
  recipeId: string,
): Promise<{ kind: 'ok'; result: CraftResult } | { kind: 'problem'; problem: CraftProblem }> {
  const { data, error } = await supabase.rpc('craft', { recipe_id: recipeId });
  if (error) return { kind: 'problem', problem: craftProblem(error) };
  return { kind: 'ok', result: data as CraftResult };
}
