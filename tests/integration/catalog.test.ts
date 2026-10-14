import { afterAll, describe, expect, it } from 'vitest';
import { questDefinitionFromStored } from '@domain/index.ts';
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
    ['challenges', "'challenge:' || key", 'true'],
    ['quests', "'quest:' || key", 'true'],
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

  it('seeds the loot content', async () => {
    const [counts] = await db`
      select (select count(*) from public.items where retired_at is null)::int as items,
             (select count(*) from public.recipes where retired_at is null)::int as recipes,
             (select count(*) from public.drop_tables where retired_at is null)::int as tables`;
    expect(counts).toEqual({ items: 88, recipes: 36, tables: 2 });
  });

  it('seeds 36 challenges, each granted by exactly one scroll', async () => {
    const challenges = await db`
      select c.key, count(i.id)::int as scrolls
      from public.challenges c left join public.items i on i.grants_challenge_id = c.id and i.kind = 'scroll'
      where c.retired_at is null
      group by c.key order by c.key`;
    expect(challenges).toHaveLength(36);
    expect(challenges.every((challenge) => challenge.scrolls === 1)).toBe(true);
    const [{ ungranted }] = await db`
      select count(*)::int as ungranted from public.items where kind = 'scroll' and grants_challenge_id is null`;
    expect(ungranted).toBe(0);
  });

  it('stores each challenge definition with exercise ids', async () => {
    const [deadliftAndPullUp] = await db`
      select c.kind, c.definition from public.challenges c where c.key = 'deadlift_and_pull_up'`;
    const [deadlift] = await db`select id from public.exercises where key = 'deadlift' and owner_user_id is null`;
    const [pullUp] = await db`select id from public.exercises where key = 'pull_up' and owner_user_id is null`;
    expect(deadliftAndPullUp).toEqual({
      kind: 'prescription',
      definition: {
        kind: 'prescription',
        groups: [
          {
            rounds: 5,
            exercises: [
              { exerciseId: deadlift.id, reps: 5, pct: 70 },
              { exerciseId: pullUp.id, reps: 5, pct: null },
            ],
          },
        ],
      },
    });
    const [tenTon] = await db`select definition from public.challenges where key = 'ten_ton_day'`;
    expect(tenTon.definition).toEqual({ kind: 'volume', metric: 'kg', target: 10000, exerciseId: null, minPct: null });
  });

  it('seeds the starter quests, each stored in the shape the domain reads', async () => {
    const quests = await db`
      select id, key, name, quest_points, definition from public.quests where retired_at is null order by sort_order`;
    expect(quests.map((quest) => quest.key)).toEqual(loadCatalogData().quests.map((quest) => quest.key));
    const definitions = quests.map((quest) =>
      questDefinitionFromStored(
        { questId: quest.id, key: quest.key, name: quest.name, questPoints: quest.quest_points },
        quest.definition,
      ),
    );
    const [backSquat] = await db`select id from public.exercises where key = 'back_squat' and owner_user_id is null`;
    const [legs] = await db`select id from public.skills where key = 'legs'`;
    const [back] = await db`select id from public.skills where key = 'back'`;
    const [squatRack] = quests;
    expect(definitions.find((definition) => definition.key === 'the_heavy_single')).toMatchObject({
      requiredLevels: [{ skillId: legs.id, level: 15 }],
      requiredQuestIds: [squatRack.id],
      steps: [
        { kind: 'record', exerciseId: backSquat.id },
        {
          kind: 'workout',
          challenge: { kind: 'volume', metric: 'reps', target: 50, exerciseId: backSquat.id, minPct: 70 },
        },
      ],
      rewardXp: { [legs.id]: 1500, [back.id]: 300 },
    });
  });
});

describe('cardio catalog', () => {
  it('seeds Grip as a lift skill before Endurance, Agility and Mobility, the cardio skills outside combat', async () => {
    const skills = await db`
      select key, sort_order, combat_weight::float, modality from public.skills
      where key in ('grip', 'endurance', 'agility', 'mobility') order by sort_order`;
    expect(skills).toEqual([
      { key: 'grip', sort_order: 7, combat_weight: 1, modality: 'lift' },
      { key: 'endurance', sort_order: 8, combat_weight: 0, modality: 'cardio' },
      { key: 'agility', sort_order: 9, combat_weight: 0, modality: 'cardio' },
      { key: 'mobility', sort_order: 10, combat_weight: 0, modality: 'cardio' },
    ]);
    const [{ count }] = await db`select count(*)::int as count from public.skills`;
    expect(count).toBe(10);
  });

  it('seeds the hold and carry exercises with their measure', async () => {
    const holds = await db`
      select key, modality, load_type, measure from public.exercises
      where owner_user_id is null and measure <> 'reps' order by key`;
    expect(holds).toEqual([
      { key: 'dead_hang', modality: 'lift', load_type: 'bodyweight', measure: 'time' },
      { key: 'farmers_carry', modality: 'lift', load_type: 'external', measure: 'distance' },
      { key: 'plate_pinch', modality: 'lift', load_type: 'external', measure: 'time' },
      { key: 'suitcase_carry', modality: 'lift', load_type: 'external', measure: 'distance' },
      { key: 'towel_hang', modality: 'lift', load_type: 'bodyweight', measure: 'time' },
    ]);
  });

  it('seeds cardio exercises without a load type and with their cardio profile', async () => {
    const rows = await db`
      select key, load_type, equipment, reference_pace_s_per_km, pace_unit, max_effort, record_min_distance_m
      from public.exercises where key in ('running', 'walking', 'rowing_intervals') order by key`;
    expect(rows).toEqual([
      {
        key: 'rowing_intervals',
        load_type: null,
        equipment: 'machine',
        reference_pace_s_per_km: null,
        pace_unit: 'per_km',
        max_effort: 'max',
        record_min_distance_m: null,
      },
      {
        key: 'running',
        load_type: null,
        equipment: 'bodyweight',
        reference_pace_s_per_km: 360,
        pace_unit: 'per_km',
        max_effort: 'max',
        record_min_distance_m: 1000,
      },
      {
        key: 'walking',
        load_type: null,
        equipment: 'bodyweight',
        reference_pace_s_per_km: null,
        pace_unit: 'per_km',
        max_effort: 'moderate',
        record_min_distance_m: null,
      },
    ]);
    const shares = await db`
      select s.key, es.share_bp from public.exercise_skills es
      join public.exercises e on e.id = es.exercise_id join public.skills s on s.id = es.skill_id
      where e.key = 'rowing_intervals' order by s.sort_order`;
    expect(shares).toEqual([
      { key: 'endurance', share_bp: 5000 },
      { key: 'agility', share_bp: 5000 },
    ]);
  });

  it('re-applies the seed over itself with the modality lock in place', async () => {
    const outcome = db.begin(async (tx) => {
      for (const statement of renderStatements(loadCatalogData())) await tx.unsafe(statement);
      await tx`set constraints all immediate`;
      throw new RolledBack();
    });
    await expect(outcome).rejects.toBeInstanceOf(RolledBack);
  });
});

describe('seed retirement', () => {
  it('retires an item, a drop table, a recipe and a quest removed from the YAML, and keeps the rest active', async () => {
    const sources = readCatalogSources();
    const trimmed = expandCatalog({
      ...sources,
      quests: (sources.quests as { key: string }[]).filter((quest) => quest.key !== 'loose_limbs'),
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
        union all select 'quest', key from public.quests where retired_at is not null
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
        { kind: 'quest', key: 'loose_limbs' },
        { kind: 'recipe', key: 'grinder_belt' },
      ],
      grinderBeltInputs: 0,
    });
    const [still] = await db`
      select (select count(*)::int from public.items where retired_at is not null)
        + (select count(*)::int from public.quests where retired_at is not null) as count`;
    expect(still.count).toBe(0);
  });
});
