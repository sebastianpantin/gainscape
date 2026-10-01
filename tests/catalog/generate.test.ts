import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { generateSeed, SEED_PATH } from '../../scripts/catalog/generate.ts';
import { catalogNames, expandCatalog, loadCatalogData, readCatalogSources } from '../../scripts/catalog/load.ts';
import { CATALOG_NAMESPACE } from '../../scripts/catalog/namespace.ts';
import { idFor, renderSeed, renderStatements } from '../../scripts/catalog/sql.ts';

const PINNED_NAMESPACE = '67cd74e5-e6ca-47c9-831c-1f8d246d8948';

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

  it('expands 58 items, 36 recipes and 2 drop tables', () => {
    const catalog = loadCatalogData();
    expect(catalog.items).toHaveLength(58);
    expect(catalog.recipes).toHaveLength(36);
    expect(catalog.dropTables.map((table) => table.key)).toEqual(['regular', 'rare']);
    const countOf = (kind: string) => catalog.items.filter((item) => item.kind === kind).length;
    expect([countOf('gear'), countOf('material'), countOf('pet'), countOf('scroll')]).toEqual([42, 6, 4, 6]);
    expect(catalog.items.map((item) => item.sortOrder)).toEqual(catalog.items.map((_, index) => index + 1));
  });

  it('lists eight skills, the two cardio skills outside combat', () => {
    const skills = loadCatalogData().skills;
    expect(skills.map((skill) => skill.key)).toEqual([
      'chest',
      'back',
      'shoulders',
      'arms',
      'legs',
      'core',
      'endurance',
      'agility',
    ]);
    const cardio = skills.filter((skill) => skill.modality === 'cardio');
    expect(cardio.map(({ key, sortOrder, combatWeight }) => ({ key, sortOrder, combatWeight }))).toEqual([
      { key: 'endurance', sortOrder: 7, combatWeight: 0 },
      { key: 'agility', sortOrder: 8, combatWeight: 0 },
    ]);
  });

  it('renders the skill modality and the cardio exercise columns', () => {
    const statements = renderStatements(loadCatalogData());
    const skills = statements.find((statement) => statement.startsWith('insert into public.skills'))!;
    expect(skills).toContain('(id, key, name, sort_order, combat_weight, modality)');
    expect(skills).toContain(`'endurance', 'Endurance', 7, 0, 'cardio')`);
    expect(skills).toContain(`'chest', 'Chest', 1, 2, 'lift')`);
    expect(skills).toContain('modality = excluded.modality');
    const exercises = statements.find((statement) => statement.startsWith('insert into public.exercises'))!;
    expect(exercises).toContain(
      '(id, key, name, modality, load_type, equipment, requires_unlock, variation_of_id, reference_pace_s_per_km, pace_unit, max_effort, record_min_distance_m)',
    );
    expect(exercises).toContain(
      `'running', 'Running', 'cardio', null, 'bodyweight', false, null, 360, 'per_km', 'max', 1000)`,
    );
    expect(exercises).toContain(
      `'walking', 'Walking', 'cardio', null, 'bodyweight', false, null, null, 'per_km', 'moderate', null)`,
    );
    expect(exercises).toContain(`'rowing', 'Rowing', 'cardio', null, 'machine', false, null,`);
    expect(exercises).toContain(
      `'swimming', 'Swimming', 'cardio', null, 'bodyweight', false, null, 1200, 'per_100m', 'max', 100)`,
    );
    expect(exercises).toContain(
      `'barbell_bench_press', 'Barbell Bench Press', 'lift', 'external', 'barbell', false, null, null, null, null, null)`,
    );
    expect(exercises).toContain('modality = excluded.modality');
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
    expect(grinderGear.every((entry) => entry.weight === 3)).toBe(true);
    for (const table of catalog.dropTables) {
      expect(table.entries.reduce((sum, entry) => sum + entry.weight, 0)).toBe(98);
    }
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

    const trimmed = expandCatalog({
      ...sources,
      items: (sources.items as { key: string }[]).filter((item) => item.key !== 'plate_crab'),
      dropTables: (sources.dropTables as { key: string }[]).filter((table) => table.key !== 'regular'),
    });
    trimmed.recipes = trimmed.recipes.filter((recipe) => recipe.key !== 'grinder_belt');
    const trimmedStatements = renderStatements(trimmed);
    expect(retireStatement(trimmedStatements, 'items')).not.toContain(plateCrab);
    expect(retireStatement(trimmedStatements, 'drop_tables')).not.toContain(regular);
    expect(retireStatement(trimmedStatements, 'recipes')).not.toContain(grinderBelt);
    expect(retireStatement(trimmedStatements, 'items')).toMatch(
      /^update public\.items set retired_at = coalesce\(retired_at, now\(\)\)\nwhere id <> all\(array\[/,
    );
    expect(renderSeed(trimmed)).not.toContain(`${plateCrab}, 'plate_crab'`);
  });
});
