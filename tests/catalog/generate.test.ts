import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { questDefinitionFromStored } from '@domain/index.ts';
import { generateSeed, SEED_PATH } from '../../scripts/catalog/generate.ts';
import { catalogNames, expandCatalog, loadCatalogData, readCatalogSources } from '../../scripts/catalog/load.ts';
import { CATALOG_NAMESPACE } from '../../scripts/catalog/namespace.ts';
import {
  CatalogRef,
  idFor,
  questDefinition,
  renderSeed,
  renderStatements,
  type StoredJson,
} from '../../scripts/catalog/sql.ts';

const PINNED_NAMESPACE = '67cd74e5-e6ca-47c9-831c-1f8d246d8948';

function storedValue(value: StoredJson): unknown {
  if (value instanceof CatalogRef) return value.name;
  if (value instanceof Map) {
    return Object.fromEntries(
      [...value].map(([key, entry]) => [key instanceof CatalogRef ? key.name : key, storedValue(entry)]),
    );
  }
  if (Array.isArray(value)) return value.map(storedValue);
  return value;
}

function retireStatement(statements: string[], table: string): string {
  const statement = statements.find((candidate) => candidate.startsWith(`update public.${table} set retired_at`));
  if (statement === undefined) throw new Error(`no retire statement for ${table}`);
  return statement;
}

describe('catalog generator', () => {
  it('generates identical output twice', () => {
    expect(generateSeed()).toBe(generateSeed());
  });

  it('matches the committed seed', () => {
    expect(readFileSync(SEED_PATH, 'utf8')).toBe(generateSeed());
  });

  it('uses only the pinned namespace', () => {
    expect(CATALOG_NAMESPACE).toBe(PINNED_NAMESPACE);
    const seed = generateSeed();
    expect(seed).toContain(`uuid_generate_v5('${PINNED_NAMESPACE}'::uuid`);
    const namespaces = new Set([...seed.matchAll(/uuid_generate_v5\('([^']*)'::uuid/g)].map((match) => match[1]));
    expect([...namespaces]).toEqual([PINNED_NAMESPACE]);
  });

  it('wraps the seed in one transaction with no comments', () => {
    const seed = generateSeed();
    expect(seed.startsWith('begin;\n')).toBe(true);
    expect(seed.endsWith('commit;\n')).toBe(true);
    expect(seed.match(/^begin;$/gm)).toHaveLength(1);
    expect(seed).not.toMatch(/--|\/\*/);
    expect(seed).not.toContain('\r');
  });

  it('expands 88 items, 36 recipes with 72 inputs and 2 drop tables with 62 entries', () => {
    const catalog = loadCatalogData();
    expect(catalog.items).toHaveLength(88);
    expect(catalog.recipes).toHaveLength(36);
    expect(catalog.recipes.flatMap((recipe) => recipe.inputs)).toHaveLength(72);
    expect(catalog.dropTables.flatMap((table) => table.entries)).toHaveLength(62);
    expect(catalog.dropTables.map((table) => table.key)).toEqual(['regular', 'rare']);
    const countOf = (kind: string) => catalog.items.filter((item) => item.kind === kind).length;
    expect([countOf('gear'), countOf('material'), countOf('pet'), countOf('scroll')]).toEqual([42, 6, 4, 36]);
    expect(catalog.items.map((item) => item.sortOrder)).toEqual(catalog.items.map((_, index) => index + 1));
  });

  it('drops some scroll from the rare table exactly as often as the first twelve scrolls did, each scroll equally', () => {
    const catalog = loadCatalogData();
    const scrollKeys = new Set(catalog.items.filter((item) => item.kind === 'scroll').map((item) => item.key));
    const rare = catalog.dropTables.find((table) => table.key === 'rare')!;
    const scrollWeights = rare.entries.filter((entry) => scrollKeys.has(entry.item)).map((entry) => entry.weight);
    const scrollWeight = scrollWeights.reduce((sum, weight) => sum + weight, 0);
    const totalWeight = rare.entries.reduce((sum, entry) => sum + entry.weight, 0);
    expect(scrollWeights).toHaveLength(scrollKeys.size);
    expect(new Set(scrollWeights).size).toBe(1);
    expect(scrollWeight * 98).toBe(totalWeight * 36);
  });

  it('lists ten skills, grip a lift skill of combat weight 1, the three cardio skills outside combat', () => {
    const skills = loadCatalogData().skills;
    expect(skills.map((skill) => skill.key)).toEqual([
      'chest',
      'back',
      'shoulders',
      'arms',
      'legs',
      'core',
      'grip',
      'endurance',
      'agility',
      'mobility',
    ]);
    const grip = skills.find((skill) => skill.key === 'grip')!;
    expect({ sortOrder: grip.sortOrder, combatWeight: grip.combatWeight, modality: grip.modality }).toEqual({
      sortOrder: 7,
      combatWeight: 1,
      modality: 'lift',
    });
    const cardio = skills.filter((skill) => skill.modality === 'cardio');
    expect(cardio.map(({ key, sortOrder, combatWeight }) => ({ key, sortOrder, combatWeight }))).toEqual([
      { key: 'endurance', sortOrder: 8, combatWeight: 0 },
      { key: 'agility', sortOrder: 9, combatWeight: 0 },
      { key: 'mobility', sortOrder: 10, combatWeight: 0 },
    ]);
  });

  it('trains Mobility only through moderate or hard steady activities', () => {
    const mobility = loadCatalogData().exercises.filter((exercise) =>
      exercise.shares.some((share) => share.skill === 'mobility'),
    );
    expect(
      mobility.map((exercise) => [exercise.key, exercise.modality, exercise.cardio?.maxEffort, exercise.shares]),
    ).toEqual([
      ['yoga', 'cardio', 'hard', [{ skill: 'mobility', shareBp: 10000 }]],
      ['static_stretching', 'cardio', 'moderate', [{ skill: 'mobility', shareBp: 10000 }]],
      ['foam_rolling', 'cardio', 'moderate', [{ skill: 'mobility', shareBp: 10000 }]],
      ['mobility_flow', 'cardio', 'moderate', [{ skill: 'mobility', shareBp: 10000 }]],
      ['dynamic_warm_up', 'cardio', 'moderate', [{ skill: 'mobility', shareBp: 10000 }]],
    ]);
  });

  it('lists the hold and carry exercises with their measure and Grip shares', () => {
    const holds = loadCatalogData().exercises.filter((exercise) => exercise.measure !== 'reps');
    expect(
      holds.map(({ key, measure, loadType, variationOf, shares }) => [key, measure, loadType, variationOf, shares]),
    ).toEqual([
      [
        'farmers_carry',
        'distance',
        'external',
        null,
        [
          { skill: 'grip', shareBp: 6000 },
          { skill: 'legs', shareBp: 2000 },
          { skill: 'core', shareBp: 2000 },
        ],
      ],
      [
        'suitcase_carry',
        'distance',
        'external',
        'farmers_carry',
        [
          { skill: 'grip', shareBp: 6000 },
          { skill: 'core', shareBp: 4000 },
        ],
      ],
      ['dead_hang', 'time', 'bodyweight', null, [{ skill: 'grip', shareBp: 10000 }]],
      ['towel_hang', 'time', 'bodyweight', 'dead_hang', [{ skill: 'grip', shareBp: 10000 }]],
      ['plate_pinch', 'time', 'external', null, [{ skill: 'grip', shareBp: 10000 }]],
    ]);
    const exercises = renderStatements(loadCatalogData()).find((statement) =>
      statement.startsWith('insert into public.exercises'),
    )!;
    expect(exercises).toContain(', tracks_distance, measure)');
    expect(exercises).toContain(
      `'dead_hang', 'Dead Hang', 'lift', 'bodyweight', 'bodyweight', null, null, null, null, null, true, 'time')`,
    );
  });

  it('renders the skill modality and the cardio exercise columns', () => {
    const statements = renderStatements(loadCatalogData());
    const skills = statements.find((statement) => statement.startsWith('insert into public.skills'))!;
    expect(skills).toContain('(id, key, name, sort_order, combat_weight, modality)');
    expect(skills).toContain(`'endurance', 'Endurance', 8, 0, 'cardio')`);
    expect(skills).toContain(`'grip', 'Grip', 7, 1, 'lift')`);
    expect(skills).toContain(`'mobility', 'Mobility', 10, 0, 'cardio')`);
    expect(skills).toContain(`'chest', 'Chest', 1, 2, 'lift')`);
    expect(skills).toContain('modality = excluded.modality');
    const exercises = statements.find((statement) => statement.startsWith('insert into public.exercises'))!;
    expect(exercises).toContain(
      '(id, key, name, modality, load_type, equipment, variation_of_id, reference_pace_s_per_km, pace_unit, max_effort, record_min_distance_m, tracks_distance, measure)',
    );
    expect(exercises).toContain(
      `'running', 'Running', 'cardio', null, 'bodyweight', null, 360, 'per_km', 'max', 1000, true, 'reps')`,
    );
    expect(exercises).toContain(
      `'walking', 'Walking', 'cardio', null, 'bodyweight', null, null, 'per_km', 'moderate', null, true, 'reps')`,
    );
    expect(exercises).toContain(`'rowing', 'Rowing', 'cardio', null, 'machine', null,`);
    expect(exercises).toContain(
      `'yoga', 'Yoga', 'cardio', null, 'bodyweight', null, null, 'per_km', 'hard', null, false, 'reps')`,
    );
    expect(exercises).toContain(
      `'swimming', 'Swimming', 'cardio', null, 'bodyweight', null, 1200, 'per_100m', 'max', 100, true, 'reps')`,
    );
    expect(exercises).toContain(
      `'barbell_bench_press', 'Barbell Bench Press', 'lift', 'external', 'barbell', null, null, null, null, null, true, 'reps')`,
    );
    expect(exercises).toContain('modality = excluded.modality');
  });

  it('seeds the curated strength library with its variations', () => {
    const statements = renderStatements(loadCatalogData());
    const exercises = statements.find((statement) => statement.startsWith('insert into public.exercises'))!;
    expect(exercises).toContain(
      `'hammer_curl', 'Hammer Curl', 'lift', 'external', 'dumbbell', null, null, null, null, null, true, 'reps')`,
    );
    expect(exercises).toContain(
      `'landmine_rotation', 'Landmine Rotation', 'lift', 'external', 'other', null, null, null, null, null, true, 'reps')`,
    );
    expect(exercises).toContain(
      `'pendlay_row', 'Pendlay Row', 'lift', 'external', 'barbell', extensions.uuid_generate_v5('${PINNED_NAMESPACE}'::uuid, 'barbell_row'),`,
    );
  });

  it('renders the challenges before the items, with exercise ids in each definition', () => {
    const catalog = loadCatalogData();
    expect(catalog.challenges.map((challenge) => challenge.key)).toEqual([
      'deadlift_and_pull_up',
      'bench_and_row',
      'press_and_chin',
      'dips_and_curls',
      'squat_century',
      'ten_ton_day',
      'front_squat_and_romanian_deadlift',
      'incline_and_pulldown',
      'raises_and_face_pulls',
      'leg_raise_and_rollout',
      'push_up_century',
      'twenty_ton_day',
      'clean_and_push_press',
      'snatch_and_overhead_squat',
      'close_grip_and_pendlay',
      'sumo_and_pull_up',
      'hack_squat_and_leg_curl',
      'split_squat_and_hinge',
      'goblet_and_swing',
      'arnold_and_rear_delt',
      'hammer_and_rope',
      'lunge_century',
      'sit_up_century',
      'thirty_ton_day',
      'incline_press_and_seal_row',
      'dips_and_pullovers',
      'thruster_and_pull_up',
      'zercher_and_good_morning',
      'box_squat_and_glute_ham',
      'thrust_and_kickback',
      'chin_up_and_dip',
      'kettlebell_clean_press_and_swing',
      'calf_raise_double_century',
      'shrug_century',
      'lateral_raise_century',
      'curl_century',
    ]);
    const statements = renderStatements(catalog);
    const challengesAt = statements.findIndex((statement) => statement.startsWith('insert into public.challenges'));
    const itemsAt = statements.findIndex((statement) => statement.startsWith('insert into public.items'));
    expect(challengesAt).toBeGreaterThan(-1);
    expect(challengesAt).toBeLessThan(itemsAt);
    const challenges = statements[challengesAt];
    const exercise = (key: string) => idFor(catalogNames.exercise(key)).raw;
    expect(challenges).toContain('(id, key, name, kind, definition, retired_at)');
    expect(challenges).toContain(
      `'deadlift_and_pull_up', 'Deadlift and Pull-up', 'prescription', jsonb_build_object('kind', 'prescription', 'groups', jsonb_build_array(jsonb_build_object('rounds', 5, 'exercises', jsonb_build_array(jsonb_build_object('exerciseId', ${exercise('deadlift')}, 'reps', 5, 'pct', 70), jsonb_build_object('exerciseId', ${exercise('pull_up')}, 'reps', 5, 'pct', null))))), null)`,
    );
    expect(challenges).toContain(
      `'squat_century', 'Squat Century', 'volume', jsonb_build_object('kind', 'volume', 'metric', 'reps', 'target', 100, 'exerciseId', ${exercise('back_squat')}, 'minPct', 50), null)`,
    );
    expect(challenges).toContain(
      `'ten_ton_day', 'Ten-Ton Day', 'volume', jsonb_build_object('kind', 'volume', 'metric', 'kg', 'target', 10000, 'exerciseId', null, 'minPct', null), null)`,
    );
    expect(challenges).toContain(
      `'kettlebell_clean_press_and_swing', 'Kettlebell Clean, Press and Swing', 'prescription', jsonb_build_object('kind', 'prescription', 'groups', jsonb_build_array(jsonb_build_object('rounds', 4, 'exercises', jsonb_build_array(jsonb_build_object('exerciseId', ${exercise('kettlebell_clean')}, 'reps', 5, 'pct', null), jsonb_build_object('exerciseId', ${exercise('kettlebell_press')}, 'reps', 5, 'pct', null), jsonb_build_object('exerciseId', ${exercise('kettlebell_swing')}, 'reps', 10, 'pct', null))))), null)`,
    );
    expect(challenges).toContain('definition = excluded.definition');
    const items = statements[itemsAt];
    expect(items).toContain('grants_challenge_id');
    expect(items).not.toContain('grants_exercise_id');
    expect(items).toContain(
      `'scroll_deficit_deadlift', 'Scroll: Deadlift and Pull-up', 'scroll', 'rare', null, null, 'scroll', '', ${idFor(catalogNames.challenge('deadlift_and_pull_up')).raw},`,
    );
    expect(retireStatement(statements, 'challenges').match(/extensions\.uuid_generate_v5\([^)]*\)/g)).toEqual(
      catalog.challenges.map((challenge) => idFor(catalogNames.challenge(challenge.key)).raw),
    );
  });

  it('renders the quests after the challenges, in catalog order, with their points and definitions', () => {
    const catalog = loadCatalogData();
    expect(catalog.quests.map((quest) => quest.key)).toEqual([
      'x_marks_the_squat',
      'the_restless_squat',
      'back_slayer',
      'bench_mysteries',
      'monkey_bar_madness',
      'the_grand_tread',
      'yogic_ritual',
      'ernest_the_crunch',
    ]);
    const statements = renderStatements(catalog);
    const challengesAt = statements.findIndex((statement) => statement.startsWith('insert into public.challenges'));
    const questsAt = statements.findIndex((statement) => statement.startsWith('insert into public.quests'));
    expect(questsAt).toBeGreaterThan(challengesAt);
    const quests = statements[questsAt];
    const id = (name: string) => idFor(name).raw;
    expect(quests).toContain('(id, key, name, description, quest_points, sort_order, definition, retired_at)');
    expect(quests).toContain(
      `(${id('quest:x_marks_the_squat')}, 'x_marks_the_squat', 'X Marks the Squat', 'The old spotter left a map to buried gains. Squat in two workouts, then dig up a hundred squat reps.', 1, 1, jsonb_build_object('requiredLevels', jsonb_build_array(), 'requiredQuestIds', jsonb_build_array(), 'steps', jsonb_build_array(jsonb_build_object('kind', 'sessions', 'target', 2, 'exerciseId', ${id('back_squat')}), jsonb_build_object('kind', 'volume', 'metric', 'reps', 'target', 100, 'exerciseId', ${id('back_squat')})), 'rewardXp', jsonb_build_object(${id('legs')}, 800, ${id('core')}, 200)), null)`,
    );
    expect(quests).toContain(
      `'the_restless_squat', 'The Restless Squat', 'A restless squat haunts the rack. Set a new back squat record, then lay it to rest with fifty reps at 70% of your best in one workout.', 2, 2, jsonb_build_object('requiredLevels', jsonb_build_array(jsonb_build_object('skillId', ${id('legs')}, 'level', 15)), 'requiredQuestIds', jsonb_build_array(${id('quest:x_marks_the_squat')}), 'steps', jsonb_build_array(jsonb_build_object('kind', 'record', 'exerciseId', ${id('back_squat')}), jsonb_build_object('kind', 'workout', 'challenge', jsonb_build_object('kind', 'volume', 'metric', 'reps', 'target', 50, 'exerciseId', ${id('back_squat')}, 'minPct', 70)))`,
    );
    expect(quests).toContain('definition = excluded.definition');
    expect(quests).toContain('quest_points = excluded.quest_points');
    expect(quests).toContain('retired_at = case when excluded.retired_at is null then null');
    expect(retireStatement(statements, 'quests').match(/extensions\.uuid_generate_v5\([^)]*\)/g)).toEqual(
      catalog.quests.map((quest) => id(catalogNames.quest(quest.key))),
    );
  });

  it('stores every quest definition in the shape the domain reads', () => {
    const catalog = loadCatalogData();
    const definitions = catalog.quests.map((quest) =>
      questDefinitionFromStored(
        { questId: catalogNames.quest(quest.key), key: quest.key, name: quest.name, questPoints: quest.questPoints },
        storedValue(questDefinition(quest)),
      ),
    );
    expect(definitions.map((definition) => definition.steps.length)).toEqual(
      catalog.quests.map((quest) => quest.steps.length),
    );
    expect(definitions.find((definition) => definition.key === 'the_restless_squat')).toEqual({
      questId: 'quest:the_restless_squat',
      key: 'the_restless_squat',
      name: 'The Restless Squat',
      questPoints: 2,
      requiredLevels: [{ skillId: 'legs', level: 15 }],
      requiredQuestIds: ['quest:x_marks_the_squat'],
      steps: [
        { kind: 'record', exerciseId: 'back_squat' },
        {
          kind: 'workout',
          challenge: { kind: 'volume', metric: 'reps', target: 50, exerciseId: 'back_squat', minPct: 70 },
        },
      ],
      rewardXp: { legs: 1500, back: 300 },
    });
    expect(definitions.find((definition) => definition.key === 'back_slayer')?.steps[1]).toEqual({
      kind: 'workout',
      challenge: {
        kind: 'prescription',
        groups: [
          {
            rounds: 3,
            exercises: [
              { exerciseId: 'back_squat', reps: 5, pct: 75 },
              { exerciseId: 'deadlift', reps: 5, pct: 70 },
            ],
          },
        ],
      },
    });
    expect(definitions.find((definition) => definition.key === 'yogic_ritual')).toMatchObject({
      requiredLevels: [],
      steps: [{ kind: 'sessions', target: 3, exerciseId: 'mobility_flow' }],
      rewardXp: { mobility: 600 },
    });
  });

  it('expands every gear shorthand into the 6 slots of that tier', () => {
    const catalog = loadCatalogData();
    const entriesOf = (table: string) => catalog.dropTables.find((candidate) => candidate.key === table)!.entries;
    const tierEntries = (table: string, tier: string) =>
      entriesOf(table).filter((entry) => catalog.items.find((item) => item.key === entry.item)?.tier === tier);
    const rookie = tierEntries('regular', 'rookie').filter((entry) => !entry.item.endsWith('_scraps'));
    expect(rookie.map((entry) => entry.item)).toEqual([
      'rookie_belt',
      'rookie_chalk',
      'rookie_straps',
      'rookie_sleeves',
      'rookie_shoes',
      'rookie_gloves',
    ]);
    expect(rookie.every((entry) => entry.weight === 5 && entry.min === 1 && entry.max === 1)).toBe(true);
    const grinderGear = tierEntries('rare', 'grinder').filter((entry) => !entry.item.endsWith('_scraps'));
    expect(grinderGear).toHaveLength(6);
    expect(grinderGear.every((entry) => entry.weight === 54)).toBe(true);
  });

  it('splits a gear shorthand weight across its slots, so the whole tier drops at that weight', () => {
    const catalog = loadCatalogData();
    const weightsOf = (table: string) => catalog.dropTables.find((candidate) => candidate.key === table)!.entries;
    const total = (entries: readonly { weight: number }[]) => entries.reduce((sum, entry) => sum + entry.weight, 0);
    const gearOfTier = (table: string, tier: string) =>
      weightsOf(table).filter((entry) => {
        const item = catalog.items.find((candidate) => candidate.key === entry.item);
        return item?.tier === tier && item.kind === 'gear';
      });
    const scraps = weightsOf('regular').find((entry) => entry.item === 'grinder_scraps')!;
    expect(total(gearOfTier('regular', 'rookie')) / total(weightsOf('regular'))).toBeCloseTo(5 / 73);
    expect(total(gearOfTier('regular', 'rookie')) / scraps.weight).toBeCloseTo(5 / 30);
    expect(total(gearOfTier('rare', 'grinder')) / total(weightsOf('rare'))).toBeCloseTo(18 / 98);
  });

  it('builds each gear recipe from the tier below plus scraps of its own tier', () => {
    const recipe = loadCatalogData().recipes.find((candidate) => candidate.key === 'grinder_belt')!;
    expect(recipe).toEqual({
      key: 'grinder_belt',
      output: 'grinder_belt',
      outputQuantity: 1,
      inputs: [
        { item: 'rookie_belt', quantity: 1 },
        { item: 'grinder_scraps', quantity: 8 },
      ],
    });
    const scrapsByTier = Object.fromEntries(
      loadCatalogData()
        .recipes.filter((candidate) => candidate.key.endsWith('_belt'))
        .map((candidate) => [candidate.output, candidate.inputs[1].quantity]),
    );
    expect(scrapsByTier).toEqual({
      grinder_belt: 8,
      tempered_belt: 8,
      forged_belt: 6,
      titan_belt: 6,
      mythic_belt: 4,
      ascendant_belt: 4,
    });
  });

  it('retires every catalog row that is no longer generated', () => {
    const sources = readCatalogSources();
    const statements = renderStatements(expandCatalog(sources));
    const plateCrab = idFor(catalogNames.item('plate_crab')).raw;
    const regular = idFor(catalogNames.dropTable('regular')).raw;
    const grinderBelt = idFor(catalogNames.recipe('grinder_belt')).raw;
    expect(retireStatement(statements, 'items')).toContain(plateCrab);
    expect(retireStatement(statements, 'drop_tables')).toContain(regular);
    expect(retireStatement(statements, 'recipes')).toContain(grinderBelt);
    const catalog = expandCatalog(sources);
    const listedIds = (table: string) =>
      retireStatement(statements, table).match(/extensions\.uuid_generate_v5\([^)]*\)/g);
    expect(listedIds('items')).toEqual(catalog.items.map((item) => idFor(catalogNames.item(item.key)).raw));
    expect(listedIds('drop_tables')).toEqual(
      catalog.dropTables.map((table) => idFor(catalogNames.dropTable(table.key)).raw),
    );
    expect(listedIds('recipes')).toEqual(catalog.recipes.map((recipe) => idFor(catalogNames.recipe(recipe.key)).raw));
    const looseLimbs = idFor(catalogNames.quest('yogic_ritual')).raw;
    expect(retireStatement(statements, 'quests')).toContain(looseLimbs);

    const trimmed = expandCatalog({
      ...sources,
      items: (sources.items as { key: string }[]).filter((item) => item.key !== 'plate_crab'),
      dropTables: (sources.dropTables as { key: string }[]).filter((table) => table.key !== 'regular'),
      quests: (sources.quests as { key: string }[]).filter((quest) => quest.key !== 'yogic_ritual'),
    });
    trimmed.recipes = trimmed.recipes.filter((recipe) => recipe.key !== 'grinder_belt');
    const trimmedStatements = renderStatements(trimmed);
    expect(retireStatement(trimmedStatements, 'items')).not.toContain(plateCrab);
    expect(retireStatement(trimmedStatements, 'drop_tables')).not.toContain(regular);
    expect(retireStatement(trimmedStatements, 'recipes')).not.toContain(grinderBelt);
    expect(retireStatement(trimmedStatements, 'quests')).not.toContain(looseLimbs);
    expect(retireStatement(trimmedStatements, 'items')).toMatch(
      /^update public\.items set retired_at = coalesce\(retired_at, now\(\)\)\nwhere id <> all\(array\[/,
    );
    expect(renderSeed(trimmed)).not.toContain(`${plateCrab}, 'plate_crab'`);
  });
});
