export const ITEM_TIERS = ['rookie', 'grinder', 'tempered', 'forged', 'titan', 'mythic', 'ascendant'] as const;

export type ItemTier = (typeof ITEM_TIERS)[number];

export const GEAR_SLOTS = ['belt', 'chalk', 'straps', 'sleeves', 'shoes', 'gloves'] as const;

export type GearSlot = (typeof GEAR_SLOTS)[number];

export const ITEM_ICON_KINDS = [...GEAR_SLOTS, 'scraps', 'pet', 'scroll'] as const;

export type ItemIconKey = (typeof ITEM_ICON_KINDS)[number];

export interface RecipeInput {
  itemId: string;
  quantity: number;
}

export interface Recipe {
  id: string;
  key: string;
  outputItemId: string;
  outputQuantity: number;
  inputs: readonly RecipeInput[];
}

export type Inventory = ReadonlyMap<string, number>;

export function canCraft(recipe: Pick<Recipe, 'inputs'>, inventory: Inventory): boolean {
  return (
    recipe.inputs.length > 0 && recipe.inputs.every((input) => (inventory.get(input.itemId) ?? 0) >= input.quantity)
  );
}

function tierIndex(tier: ItemTier | null | undefined): number {
  return tier ? ITEM_TIERS.indexOf(tier) : -1;
}

export function recipeFor<R extends Recipe>(
  itemId: string,
  recipes: readonly R[],
  tierOf: ReadonlyMap<string, ItemTier | null>,
): R | undefined {
  const from = tierIndex(tierOf.get(itemId));
  if (from < 0) return undefined;
  return recipes.find(
    (recipe) =>
      recipe.inputs.some((input) => input.itemId === itemId) && tierIndex(tierOf.get(recipe.outputItemId)) === from + 1,
  );
}
