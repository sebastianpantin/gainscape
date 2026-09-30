import { afterAll, describe, expect, it } from 'vitest';
import { catalogNames, expandCatalog, loadCatalogData, readCatalogSources } from '../../scripts/catalog/load.ts';
import { CATALOG_NAMESPACE } from '../../scripts/catalog/namespace.ts';
import { renderStatements } from '../../scripts/catalog/sql.ts';
import { db } from './local-stack.ts';

afterAll(async () => {
  await db.end();
});

async function mismatchedIds(table: string, nameExpression: string, where = 'true') {
  return await db.unsafe(
    `select id, key from public.${table}
     where ${where} and id <> extensions.uuid_generate_v5($1::uuid, ${nameExpression})`,
    [CATALOG_NAMESPACE],
  );
}

class RolledBack extends Error {}

describe('catalog ids', () => {
  it.each([
    ['skills', 'key', 'true'],
    ['exercises', 'key', 'owner_user_id is null'],
    ['programs', "'program:' || key", 'owner_user_id is null'],
    ['items', "'item:' || key", 'true'],
    ['drop_tables', "'drop_table:' || key", 'true'],
    ['recipes', "'recipe:' || key", 'true'],
  ])('derives every %s id from the pinned namespace and its name', async (table, name, where) => {
    expect(await mismatchedIds(table, name, where)).toEqual([]);
    const [{ count }] = await db.unsafe(`select count(*)::int as count from public.${table} where ${where}`);
    expect(count).toBeGreaterThan(0);
  });

  it('derives every built-in program day id from program:<key>:<day key>', async () => {
    const catalog = loadCatalogData();
    const expected = catalog.programs.flatMap((program) =>
      program.days.map((day) => ({
        program: program.key,
        name: day.name,
        idName: catalogNames.programDay(program.key, day.key),
      })),
    );
    const [{ count }] = await db`
      select count(*)::int as count
      from public.program_days d join public.programs p on p.id = d.program_id
      where p.owner_user_id is null`;
    expect(count).toBe(expected.length);
    for (const day of expected) {
      const [row] = await db`
        select d.id = extensions.uuid_generate_v5(${CATALOG_NAMESPACE}::uuid, ${day.idName}) as matches
        from public.program_days d join public.programs p on p.id = d.program_id
        where p.key = ${day.program} and d.name = ${day.name}`;
      expect(row?.matches, day.idName).toBe(true);
    }
  });

  it('seeds the loot content and the locked variations', async () => {
    const [counts] = await db`
      select (select count(*) from public.items where retired_at is null)::int as items,
             (select count(*) from public.recipes where retired_at is null)::int as recipes,
             (select count(*) from public.drop_tables where retired_at is null)::int as tables,
             (select count(*) from public.exercises where requires_unlock)::int as locked`;
    expect(counts).toEqual({ items: 58, recipes: 36, tables: 2, locked: 6 });
  });
});

describe('seed retirement', () => {
  it('retires an item, a drop table and a recipe removed from the YAML, and keeps the rest active', async () => {
    const sources = readCatalogSources();
    const trimmed = expandCatalog({
      ...sources,
      items: (sources.items as { key: string }[]).filter((item) => item.key !== 'plate_crab'),
      dropTables: (sources.dropTables as { key: string; entries: { item: string }[] }[])
        .filter((table) => table.key !== 'regular')
        .map((table) => ({ ...table, entries: table.entries.filter((entry) => entry.item !== 'plate_crab') })),
    });
    trimmed.recipes = trimmed.recipes.filter((recipe) => recipe.key !== 'grinder_belt');

    const outcome = db.begin(async (tx) => {
      await tx.unsafe(renderStatements(trimmed).join('\n\n'));
      const retired = await tx`
        select 'item' as kind, key from public.items where retired_at is not null
        union all select 'drop_table', key from public.drop_tables where retired_at is not null
        union all select 'recipe', key from public.recipes where retired_at is not null
        order by 1, 2`;
      const [inputs] = await tx`
        select count(*)::int as count from public.recipe_inputs i join public.recipes r on r.id = i.recipe_id
        where r.key = 'grinder_belt'`;
      throw new RolledBack(JSON.stringify({ retired, grinderBeltInputs: inputs.count }));
    });
    const error = await outcome.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(RolledBack);
    expect(JSON.parse((error as RolledBack).message)).toEqual({
      retired: [
        { kind: 'drop_table', key: 'regular' },
        { kind: 'item', key: 'plate_crab' },
        { kind: 'recipe', key: 'grinder_belt' },
      ],
      grinderBeltInputs: 0,
    });
    const [still] = await db`select count(*)::int as count from public.items where retired_at is not null`;
    expect(still.count).toBe(0);
  });
});
