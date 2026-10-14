import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';

const CATALOG_DIR = join(import.meta.dirname, '../../catalog');

export type ItemKind = 'gear' | 'material' | 'pet' | 'scroll';
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'legendary';

export type CatalogModality = 'lift' | 'cardio';
export type CatalogMeasure = 'reps' | 'time' | 'distance';

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
  tracksDistance: boolean;
}

export interface CatalogExercise {
  key: string;
  name: string;
  modality: CatalogModality;
  loadType: string | null;
  equipment: string;
  shares: CatalogShare[];
  variationOf: string | null;
  measure: CatalogMeasure;
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

export interface CatalogChallengeExercise {
  exercise: string;
  reps: number;
  pct: number | null;
}

export interface CatalogChallengeSuperset {
  rounds: number;
  exercises: CatalogChallengeExercise[];
}

export interface CatalogChallengeVolume {
  metric: 'reps' | 'kg';
  target: number;
  exercise: string | null;
  minPct: number | null;
}

export interface CatalogChallengeDefinition {
  kind: 'prescription' | 'volume';
  supersets: CatalogChallengeSuperset[];
  volume: CatalogChallengeVolume | null;
}

export interface CatalogChallenge extends CatalogChallengeDefinition {
  key: string;
  name: string;
}

export interface CatalogQuestLevel {
  skill: string;
  level: number;
}

export interface CatalogQuestReward {
  skill: string;
  xp: number;
}

export type CatalogQuestStep =
  | { kind: 'workout'; challenge: CatalogChallengeDefinition }
  | { kind: 'volume'; metric: 'reps' | 'kg'; target: number; exercise: string | null }
  | { kind: 'record'; exercise: string | null }
  | { kind: 'sessions'; target: number; exercise: string | null };

export interface CatalogQuest {
  key: string;
  name: string;
  description: string;
  questPoints: number;
  requiredLevels: CatalogQuestLevel[];
  requiredQuests: string[];
  steps: CatalogQuestStep[];
  rewardXp: CatalogQuestReward[];
}

export interface CatalogData {
  skills: CatalogSkill[];
  exercises: CatalogExercise[];
  programs: CatalogProgram[];
  challenges: CatalogChallenge[];
  quests: CatalogQuest[];
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
    measure: z.enum(['time', 'distance']).optional(),
    cardio: z
      .strictObject({
        reference_pace_s_per_km: z.int().optional(),
        pace_unit: z.enum(['per_km', 'per_100m']),
        max_effort: z.string(),
        record_min_distance_m: z.int().optional(),
        distance: z.boolean().optional(),
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

const percentage = z.int().min(1).max(100);

const volumeMetric = z.enum(['reps', 'kg']);

const challengeSupersetsSchema = z.array(
  z.strictObject({
    rounds: z.int(),
    exercises: z.array(z.strictObject({ exercise: z.string(), reps: z.int(), pct: percentage.optional() })),
  }),
);

const challengeVolumeSchema = z.strictObject({
  metric: volumeMetric,
  target: z.number(),
  exercise: z.string().optional(),
  min_pct: percentage.optional(),
});

const challengesSchema = z.array(
  z.strictObject({
    key: z.string(),
    name: z.string(),
    kind: z.enum(['prescription', 'volume']),
    supersets: challengeSupersetsSchema.optional(),
    volume: challengeVolumeSchema.optional(),
  }),
);

const questsSchema = z.array(
  z.strictObject({
    key: z.string(),
    name: z.string(),
    description: z.string(),
    quest_points: z.number(),
    requires: z
      .strictObject({ levels: z.record(z.string(), z.number()).optional(), quests: z.array(z.string()).optional() })
      .optional(),
    steps: z.array(
      z.discriminatedUnion('kind', [
        z.strictObject({
          kind: z.literal('workout'),
          supersets: challengeSupersetsSchema.optional(),
          volume: challengeVolumeSchema.optional(),
        }),
        z.strictObject({
          kind: z.literal('volume'),
          metric: volumeMetric,
          target: z.number(),
          exercise: z.string().optional(),
        }),
        z.strictObject({ kind: z.literal('record'), exercise: z.string().optional() }),
        z.strictObject({ kind: z.literal('sessions'), target: z.number(), exercise: z.string().optional() }),
      ]),
    ),
    rewards: z.strictObject({ xp: z.record(z.string(), z.number()) }),
  }),
);

type ChallengeSupersetsSource = z.infer<typeof challengeSupersetsSchema>;
type ChallengeVolumeSource = z.infer<typeof challengeVolumeSchema>;
type QuestStepSource = z.infer<typeof questsSchema>[number]['steps'][number];

function expandChallengeDefinition(
  kind: CatalogChallengeDefinition['kind'],
  supersets: ChallengeSupersetsSource | undefined,
  volume: ChallengeVolumeSource | undefined,
): CatalogChallengeDefinition {
  return {
    kind,
    supersets: (supersets ?? []).map((superset) => ({
      rounds: superset.rounds,
      exercises: superset.exercises.map((entry) => ({
        exercise: entry.exercise,
        reps: entry.reps,
        pct: entry.pct ?? null,
      })),
    })),
    volume:
      volume === undefined
        ? null
        : {
            metric: volume.metric,
            target: volume.target,
            exercise: volume.exercise ?? null,
            minPct: volume.min_pct ?? null,
          },
  };
}

function expandQuestStep(step: QuestStepSource): CatalogQuestStep {
  switch (step.kind) {
    case 'workout':
      return {
        kind: 'workout',
        challenge: expandChallengeDefinition(
          step.volume === undefined ? 'prescription' : 'volume',
          step.supersets,
          step.volume,
        ),
      };
    case 'volume':
      return { kind: 'volume', metric: step.metric, target: step.target, exercise: step.exercise ?? null };
    case 'record':
      return { kind: 'record', exercise: step.exercise ?? null };
    case 'sessions':
      return { kind: 'sessions', target: step.target, exercise: step.exercise ?? null };
  }
}

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
  challenges: unknown;
  quests: unknown;
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
    challenges: read('challenges'),
    quests: read('quests'),
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
      const quantity = { min: entry.min ?? 1, max: entry.max ?? entry.min ?? 1 };
      if (!entry.item.startsWith(GEAR_SHORTHAND_PREFIX)) {
        return [{ item: entry.item, weight: entry.weight * gear.slots.length, ...quantity }];
      }
      const tier = entry.item.slice(GEAR_SHORTHAND_PREFIX.length);
      return gear.slots.map((slot) => ({ item: `${tier}_${slot.key}`, weight: entry.weight, ...quantity }));
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
      measure: exercise.measure ?? 'reps',
      loadType: exercise.load_type ?? null,
      equipment: exercise.equipment,
      shares: Object.entries(exercise.shares).map(([skill, shareBp]) => ({ skill, shareBp })),
      variationOf: exercise.variation_of ?? null,
      cardio:
        exercise.cardio === undefined
          ? null
          : {
              referencePaceSPerKm: exercise.cardio.reference_pace_s_per_km ?? null,
              paceUnit: exercise.cardio.pace_unit,
              maxEffort: exercise.cardio.max_effort,
              recordMinDistanceM: exercise.cardio.record_min_distance_m ?? null,
              tracksDistance: exercise.cardio.distance ?? true,
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
    challenges: challengesSchema.parse(sources.challenges).map((challenge) => ({
      key: challenge.key,
      name: challenge.name,
      ...expandChallengeDefinition(challenge.kind, challenge.supersets, challenge.volume),
    })),
    quests: questsSchema.parse(sources.quests).map((quest) => ({
      key: quest.key,
      name: quest.name,
      description: quest.description,
      questPoints: quest.quest_points,
      requiredLevels: Object.entries(quest.requires?.levels ?? {}).map(([skill, level]) => ({ skill, level })),
      requiredQuests: quest.requires?.quests ?? [],
      steps: quest.steps.map(expandQuestStep),
      rewardXp: Object.entries(quest.rewards.xp).map(([skill, xp]) => ({ skill, xp })),
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
  challenge: (key: string) => `challenge:${key}`,
  quest: (key: string) => `quest:${key}`,
  item: (key: string) => `item:${key}`,
  dropTable: (key: string) => `drop_table:${key}`,
  recipe: (key: string) => `recipe:${key}`,
};
