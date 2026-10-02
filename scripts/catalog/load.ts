import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const CATALOG_DIR = join(import.meta.dirname, '../../catalog');

export type ItemKind = 'gear' | 'material' | 'pet' | 'scroll';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type CatalogModality = 'lift' | 'cardio';

export interface CatalogSkill {
  key: string;
  name: string;
  sortOrder: number;
  combatWeight: number;
  modality: CatalogModality;
}

export interface CatalogShare {
  skill: string;
  shareBp: number;
}

export interface CatalogCardio {
  referencePaceSPerKm: number | null;
  paceUnit: 'per_km' | 'per_100m';
  maxEffort: string;
  recordMinDistanceM: number | null;
}

export interface CatalogExercise {
  key: string;
  name: string;
  modality: CatalogModality;
  loadType: string | null;
  equipment: string;
  shares: CatalogShare[];
  variationOf: string | null;
  requiresUnlock: boolean;
  cardio: CatalogCardio | null;
}

export interface CatalogDayExercise {
  exercise: string;
  sets: number;
  repsMin: number;
  repsMax: number;
}

export interface CatalogDay {
  key: string;
  name: string;
  exercises: CatalogDayExercise[];
}

export interface CatalogProgram {
  key: string;
  name: string;
  days: CatalogDay[];
}

export interface CatalogItem {
  key: string;
  name: string;
  kind: ItemKind;
  rarity: ItemRarity;
  tier: string | null;
  gearSlot: string | null;
  icon: string;
  description: string;
  grants: string | null;
  sortOrder: number;
  retired: boolean;
}

export interface CatalogDropEntry {
  item: string;
  weight: number;
  min: number;
  max: number;
}

export interface CatalogDropTable {
  key: string;
  name: string;
  retired: boolean;
  entries: CatalogDropEntry[];
}

export interface CatalogRecipeInput {
  item: string;
  quantity: number;
}

export interface CatalogRecipe {
  key: string;
  output: string;
  outputQuantity: number;
  inputs: CatalogRecipeInput[];
}

export interface CatalogData {
  skills: CatalogSkill[];
  exercises: CatalogExercise[];
  programs: CatalogProgram[];
  items: CatalogItem[];
  dropTables: CatalogDropTable[];
  recipes: CatalogRecipe[];
  gearTiers: string[];
  gearSlots: string[];
}

const rarity = z.enum(['common', 'uncommon', 'rare', 'legendary']);

const modality = z.enum(['lift', 'cardio']);

const skillsSchema = z.array(
  z.strictObject({
    key: z.string(),
    name: z.string(),
    sort_order: z.int(),
    combat_weight: z.number(),
    modality: modality.optional(),
  }),
);

const exercisesSchema = z.array(
  z.strictObject({
    key: z.string(),
    name: z.string(),
    modality: modality.optional(),
    load_type: z.enum(['external', 'bodyweight', 'bodyweight_plus']).optional(),
    equipment: z.enum(['barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'other']),
    shares: z.record(z.string(), z.int()),
    variation_of: z.string().optional(),
    requires_unlock: z.boolean().optional(),
    cardio: z
      .strictObject({
        reference_pace_s_per_km: z.int().optional(),
        pace_unit: z.enum(['per_km', 'per_100m']),
        max_effort: z.string(),
        record_min_distance_m: z.int().optional(),
      })
      .optional(),
  }),
);

const programsSchema = z.array(
  z.strictObject({
    key: z.string(),
    name: z.string(),
    days: z.array(
      z.strictObject({
        key: z.string(),
        name: z.string(),
        exercises: z.array(
          z.strictObject({ exercise: z.string(), sets: z.int(), reps_min: z.int(), reps_max: z.int() }),
        ),
      }),
    ),
  }),
);

const gearSchema = z.strictObject({
  tiers: z.array(z.strictObject({ key: z.string(), name: z.string(), rarity, upgrade_scraps: z.int().optional() })),
  slots: z.array(z.strictObject({ key: z.string(), name: z.string(), icon: z.string() })),
});

const itemsSchema = z.array(
  z.strictObject({
    key: z.string(),
    name: z.string(),
    kind: z.enum(['pet', 'scroll']),
    rarity,
    icon: z.string(),
    description: z.string().optional(),
    grants: z.string().optional(),
    retired: z.boolean().optional(),
  }),
);

const dropTablesSchema = z.array(
  z.strictObject({
    key: z.string(),
    name: z.string(),
    retired: z.boolean().optional(),
    entries: z.array(
      z.strictObject({ item: z.string(), weight: z.number(), min: z.number().optional(), max: z.number().optional() }),
    ),
  }),
);

export interface CatalogSources {
  skills: unknown;
  exercises: unknown;
  programs: unknown;
  gear: unknown;
  items: unknown;
  dropTables: unknown;
}

export function readCatalogSources(): CatalogSources {
  const read = (name: string) => parse(readFileSync(join(CATALOG_DIR, `${name}.yaml`), 'utf8'));
  return {
    skills: read('skills'),
    exercises: read('exercises'),
    programs: read('programs'),
    gear: read('gear'),
    items: read('items'),
    dropTables: read('drop_tables'),
  };
}

const GEAR_SHORTHAND_PREFIX = 'gear:';

export function expandCatalog(sources: CatalogSources): CatalogData {
  const gear = gearSchema.parse(sources.gear);
  const items: CatalogItem[] = [];
  const addItem = (item: Omit<CatalogItem, 'sortOrder'>) => items.push({ ...item, sortOrder: items.length + 1 });

  for (const tier of gear.tiers) {
    for (const slot of gear.slots) {
      addItem({
        key: `${tier.key}_${slot.key}`,
        name: `${tier.name} ${slot.name}`,
        kind: 'gear',
        rarity: tier.rarity,
        tier: tier.key,
        gearSlot: slot.key,
        icon: slot.icon,
        description: '',
        grants: null,
        retired: false,
      });
    }
  }
  for (const tier of gear.tiers.filter((candidate) => candidate.upgrade_scraps !== undefined)) {
    addItem({
      key: `${tier.key}_scraps`,
      name: `${tier.name} scraps`,
      kind: 'material',
      rarity: tier.rarity,
      tier: tier.key,
      gearSlot: null,
      icon: 'scraps',
      description: '',
      grants: null,
      retired: false,
    });
  }
  for (const item of itemsSchema.parse(sources.items)) {
    addItem({
      key: item.key,
      name: item.name,
      kind: item.kind,
      rarity: item.rarity,
      tier: null,
      gearSlot: null,
      icon: item.icon,
      description: item.description ?? '',
      grants: item.grants ?? null,
      retired: item.retired ?? false,
    });
  }

  const recipes: CatalogRecipe[] = [];
  gear.tiers.forEach((tier, index) => {
    const previous = gear.tiers[index - 1];
    if (previous === undefined || tier.upgrade_scraps === undefined) return;
    for (const slot of gear.slots) {
      recipes.push({
        key: `${tier.key}_${slot.key}`,
        output: `${tier.key}_${slot.key}`,
        outputQuantity: 1,
        inputs: [
          { item: `${previous.key}_${slot.key}`, quantity: 1 },
          { item: `${tier.key}_scraps`, quantity: tier.upgrade_scraps },
        ],
      });
    }
  });

  const dropTables = dropTablesSchema.parse(sources.dropTables).map((table) => ({
    key: table.key,
    name: table.name,
    retired: table.retired ?? false,
    entries: table.entries.flatMap((entry) => {
      const quantity = { weight: entry.weight, min: entry.min ?? 1, max: entry.max ?? entry.min ?? 1 };
      if (!entry.item.startsWith(GEAR_SHORTHAND_PREFIX)) return [{ item: entry.item, ...quantity }];
      const tier = entry.item.slice(GEAR_SHORTHAND_PREFIX.length);
      return gear.slots.map((slot) => ({ item: `${tier}_${slot.key}`, ...quantity }));
    }),
  }));

  return {
    skills: skillsSchema.parse(sources.skills).map((skill) => ({
      key: skill.key,
      name: skill.name,
      sortOrder: skill.sort_order,
      combatWeight: skill.combat_weight,
      modality: skill.modality ?? 'lift',
    })),
    exercises: exercisesSchema.parse(sources.exercises).map((exercise) => ({
      key: exercise.key,
      name: exercise.name,
      modality: exercise.modality ?? 'lift',
      loadType: exercise.load_type ?? null,
      equipment: exercise.equipment,
      shares: Object.entries(exercise.shares).map(([skill, shareBp]) => ({ skill, shareBp })),
      variationOf: exercise.variation_of ?? null,
      requiresUnlock: exercise.requires_unlock ?? false,
      cardio:
        exercise.cardio === undefined
          ? null
          : {
              referencePaceSPerKm: exercise.cardio.reference_pace_s_per_km ?? null,
              paceUnit: exercise.cardio.pace_unit,
              maxEffort: exercise.cardio.max_effort,
              recordMinDistanceM: exercise.cardio.record_min_distance_m ?? null,
            },
    })),
    programs: programsSchema.parse(sources.programs).map((program) => ({
      key: program.key,
      name: program.name,
      days: program.days.map((day) => ({
        key: day.key,
        name: day.name,
        exercises: day.exercises.map((entry) => ({
          exercise: entry.exercise,
          sets: entry.sets,
          repsMin: entry.reps_min,
          repsMax: entry.reps_max,
        })),
      })),
    })),
    items,
    dropTables,
    recipes,
    gearTiers: gear.tiers.map((tier) => tier.key),
    gearSlots: gear.slots.map((slot) => slot.key),
  };
}

export function loadCatalogData(): CatalogData {
  return expandCatalog(readCatalogSources());
}

export const catalogNames = {
  skill: (key: string) => key,
  exercise: (key: string) => key,
  program: (key: string) => `program:${key}`,
  programDay: (programKey: string, dayKey: string) => `program:${programKey}:${dayKey}`,
  item: (key: string) => `item:${key}`,
  dropTable: (key: string) => `drop_table:${key}`,
  recipe: (key: string) => `recipe:${key}`,
};
