import { type CatalogData, catalogNames } from './load.ts';
import { CATALOG_NAMESPACE } from './namespace.ts';

type SqlValue = string | number | boolean | null | { raw: string };

export function literal(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function idFor(name: string): { raw: string } {
  return { raw: `extensions.uuid_generate_v5(${literal(CATALOG_NAMESPACE)}::uuid, ${literal(name)})` };
}

function render(value: SqlValue): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return literal(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return value.raw;
}

function insert(table: string, columns: readonly string[], rows: readonly SqlValue[][], suffix = ''): string {
  const values = rows.map((row) => `  (${row.map(render).join(', ')})`).join(',\n');
  return `insert into public.${table} (${columns.join(', ')}) values\n${values}${suffix ? `\n${suffix}` : ''};`;
}

function upsertSuffix(updated: readonly string[], touchesUpdatedAt: boolean): string {
  const assignments = updated.map((column) => `${column} = excluded.${column}`);
  if (touchesUpdatedAt) assignments.push('updated_at = now()');
  return `on conflict (id) do update set ${assignments.join(', ')}`;
}

function retiredAtFor(retired: boolean): SqlValue {
  return retired ? { raw: 'now()' } : null;
}

function retiredAtAssignment(table: string): string {
  return `retired_at = case when excluded.retired_at is null then null else coalesce(${table}.retired_at, excluded.retired_at) end`;
}

function retireAllExcept(table: string, names: readonly string[]): string {
  const ids = names.map((name) => render(idFor(name))).join(',\n  ');
  return `update public.${table} set retired_at = coalesce(retired_at, now())\nwhere id <> all(array[\n  ${ids}\n]);`;
}

export function renderStatements(catalog: CatalogData): string[] {
  const exerciseId = (key: string) => idFor(catalogNames.exercise(key));
  const skillId = (key: string) => idFor(catalogNames.skill(key));
  const programId = (key: string) => idFor(catalogNames.program(key));
  const itemId = (key: string) => idFor(catalogNames.item(key));
  const tableId = (key: string) => idFor(catalogNames.dropTable(key));
  const recipeId = (key: string) => idFor(catalogNames.recipe(key));
  const days = catalog.programs.flatMap((program) => program.days.map((day, position) => ({ program, day, position })));

  return [
    insert(
      'skills',
      ['id', 'key', 'name', 'sort_order', 'combat_weight'],
      catalog.skills.map((skill) => [skillId(skill.key), skill.key, skill.name, skill.sortOrder, skill.combatWeight]),
      'on conflict (id) do update set name = excluded.name, sort_order = excluded.sort_order, combat_weight = excluded.combat_weight',
    ),
    insert(
      'exercises',
      ['id', 'key', 'name', 'load_type', 'equipment', 'requires_unlock', 'variation_of_id'],
      catalog.exercises.map((exercise) => [
        exerciseId(exercise.key),
        exercise.key,
        exercise.name,
        exercise.loadType,
        exercise.equipment,
        exercise.requiresUnlock,
        exercise.variationOf === null ? null : exerciseId(exercise.variationOf),
      ]),
      upsertSuffix(['name', 'load_type', 'equipment', 'requires_unlock', 'variation_of_id'], true),
    ),
    'delete from public.exercise_skills where exercise_id in (select id from public.exercises where owner_user_id is null);',
    insert(
      'exercise_skills',
      ['exercise_id', 'skill_id', 'share_bp'],
      catalog.exercises.flatMap((exercise) =>
        exercise.shares.map((share) => [exerciseId(exercise.key), skillId(share.skill), share.shareBp]),
      ),
    ),
    insert(
      'programs',
      ['id', 'key', 'owner_user_id', 'name'],
      catalog.programs.map((program) => [programId(program.key), program.key, null, program.name]),
      'on conflict (id) do update set key = excluded.key, name = excluded.name, updated_at = now()',
    ),
    'delete from public.program_days where program_id in (select id from public.programs where owner_user_id is null);',
    insert(
      'program_days',
      ['id', 'program_id', 'position', 'name'],
      days.map(({ program, day, position }) => [
        idFor(catalogNames.programDay(program.key, day.key)),
        programId(program.key),
        position,
        day.name,
      ]),
    ),
    insert(
      'program_day_exercises',
      ['day_id', 'position', 'exercise_id', 'target_sets', 'target_reps_min', 'target_reps_max'],
      days.flatMap(({ program, day }) =>
        day.exercises.map((entry, position) => [
          idFor(catalogNames.programDay(program.key, day.key)),
          position,
          exerciseId(entry.exercise),
          entry.sets,
          entry.repsMin,
          entry.repsMax,
        ]),
      ),
    ),
    insert(
      'items',
      [
        'id',
        'key',
        'name',
        'kind',
        'rarity',
        'tier',
        'gear_slot',
        'icon_key',
        'description',
        'grants_exercise_id',
        'sort_order',
        'retired_at',
      ],
      catalog.items.map((item) => [
        itemId(item.key),
        item.key,
        item.name,
        item.kind,
        item.rarity,
        item.tier,
        item.gearSlot,
        item.icon,
        item.description,
        item.grants === null ? null : exerciseId(item.grants),
        item.sortOrder,
        retiredAtFor(item.retired),
      ]),
      `${upsertSuffix(
        [
          'key',
          'name',
          'kind',
          'rarity',
          'tier',
          'gear_slot',
          'icon_key',
          'description',
          'grants_exercise_id',
          'sort_order',
        ],
        true,
      )}, ${retiredAtAssignment('items')}`,
    ),
    insert(
      'drop_tables',
      ['id', 'key', 'name', 'retired_at'],
      catalog.dropTables.map((table) => [tableId(table.key), table.key, table.name, retiredAtFor(table.retired)]),
      `${upsertSuffix(['key', 'name'], true)}, ${retiredAtAssignment('drop_tables')}`,
    ),
    'delete from public.drop_entries;',
    insert(
      'drop_entries',
      ['drop_table_id', 'item_id', 'weight', 'min_quantity', 'max_quantity'],
      catalog.dropTables.flatMap((table) =>
        table.entries.map((entry) => [tableId(table.key), itemId(entry.item), entry.weight, entry.min, entry.max]),
      ),
    ),
    insert(
      'recipes',
      ['id', 'key', 'output_item_id', 'output_quantity', 'retired_at'],
      catalog.recipes.map((recipe) => [
        recipeId(recipe.key),
        recipe.key,
        itemId(recipe.output),
        recipe.outputQuantity,
        null,
      ]),
      `${upsertSuffix(['key', 'output_item_id', 'output_quantity'], true)}, ${retiredAtAssignment('recipes')}`,
    ),
    'delete from public.recipe_inputs;',
    insert(
      'recipe_inputs',
      ['recipe_id', 'item_id', 'quantity'],
      catalog.recipes.flatMap((recipe) =>
        recipe.inputs.map((input) => [recipeId(recipe.key), itemId(input.item), input.quantity]),
      ),
    ),
    retireAllExcept(
      'items',
      catalog.items.map((item) => catalogNames.item(item.key)),
    ),
    retireAllExcept(
      'drop_tables',
      catalog.dropTables.map((table) => catalogNames.dropTable(table.key)),
    ),
    retireAllExcept(
      'recipes',
      catalog.recipes.map((recipe) => catalogNames.recipe(recipe.key)),
    ),
  ];
}

export function renderSeed(catalog: CatalogData): string {
  return `begin;\n\n${renderStatements(catalog).join('\n\n')}\n\ncommit;\n`;
}
