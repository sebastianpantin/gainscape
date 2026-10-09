import { GEAR_SLOTS, ITEM_TIERS } from '@domain/crafting.ts';
import type { StrengthState } from '@domain/types.ts';
import { z } from 'zod';
import type { ItemIconKind } from '../components/pixel-sprites.ts';
import { type Exercise, isLiftExercise, LOAD_TYPES, type LoadType } from '../lib/catalog-rules.ts';
import { type CatalogChallenge, catalogChallengeSchema } from '../lib/challenge-rules.ts';
import type { HeldItem, ItemCatalog } from '../lib/item-rules.ts';

export const OFFLINE_ITEMS_NOTICE = 'Offline: using your saved items.';

const CACHE_VERSION = 1;
const ITEMS_CACHE_PREFIX = 'gainscape.items.v1.';

export interface ChallengeExerciseEntry {
  id: string;
  name: string;
  archived: boolean;
  modality: 'lift';
  loadType: LoadType;
  equipment?: string;
}

export interface ItemsCache {
  catalog: ItemCatalog;
  inventory: HeldItem[];
  strength: StrengthState;
  strengthAsOf: string;
  challengeExercises: ChallengeExerciseEntry[];
}

const catalogItemSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  kind: z.enum(['gear', 'material', 'pet', 'scroll']),
  rarity: z.enum(['common', 'uncommon', 'rare', 'legendary']),
  tier: z.enum(ITEM_TIERS).nullable(),
  gearSlot: z.enum(GEAR_SLOTS).nullable(),
  icon: z.string().transform((icon) => icon as ItemIconKind),
  description: z.string(),
  grantsChallengeId: z.string().nullable(),
  sortOrder: z.number(),
});

const recipeSchema = z.object({
  id: z.string(),
  key: z.string(),
  outputItemId: z.string(),
  outputQuantity: z.number(),
  inputs: z.array(z.object({ itemId: z.string(), quantity: z.number() })),
});

const itemsCacheSchema = z.object({
  v: z.literal(CACHE_VERSION),
  userId: z.string(),
  cache: z.object({
    catalog: z.object({
      items: z.array(catalogItemSchema),
      recipes: z.array(recipeSchema),
      challenges: z.array(catalogChallengeSchema),
    }),
    inventory: z.array(z.object({ itemId: z.string(), quantity: z.number(), firstObtainedAt: z.string() })),
    strength: z.record(
      z.string(),
      z.object({ windowMax: z.number().nullable(), fallbackMax: z.number().nullable(), hasPriorSession: z.boolean() }),
    ),
    strengthAsOf: z.string(),
    challengeExercises: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        archived: z.boolean(),
        modality: z.literal('lift'),
        loadType: z.enum(LOAD_TYPES),
        equipment: z.string().optional(),
      }),
    ),
  }),
});

function itemsCacheKey(userId: string): string {
  return `${ITEMS_CACHE_PREFIX}${userId}`;
}

export function readItemsCache(storage: Storage | null, userId: string): ItemsCache | null {
  try {
    const raw = storage?.getItem(itemsCacheKey(userId));
    if (!raw) return null;
    const parsed = itemsCacheSchema.safeParse(JSON.parse(raw));
    if (!parsed.success || parsed.data.userId !== userId) return null;
    return parsed.data.cache;
  } catch {
    return null;
  }
}

export function saveItemsCache(storage: Storage | null, userId: string, cache: ItemsCache): void {
  try {
    storage?.setItem(itemsCacheKey(userId), JSON.stringify({ v: CACHE_VERSION, userId, cache }));
  } catch {
    return;
  }
}

export function forgetItemsCache(storage: Storage, userId: string): void {
  try {
    storage.removeItem(itemsCacheKey(userId));
  } catch {
    return;
  }
}

export function challengeExercisesOf(
  challenges: readonly CatalogChallenge[],
  exercises: readonly Exercise[],
): ChallengeExerciseEntry[] {
  const needed = new Set(
    challenges.flatMap(({ definition }) =>
      definition.kind === 'prescription'
        ? definition.groups.flatMap((group) => group.exercises.map((exercise) => exercise.exerciseId))
        : definition.exerciseId === null
          ? []
          : [definition.exerciseId],
    ),
  );
  return exercises
    .filter(isLiftExercise)
    .filter((exercise) => needed.has(exercise.id))
    .map(({ id, name, archived, loadType, equipment }) => ({
      id,
      name,
      archived,
      modality: 'lift',
      loadType,
      equipment,
    }));
}
