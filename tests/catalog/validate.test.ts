import { describe, expect, it } from 'vitest';
import { type CatalogData, loadCatalogData } from '../../scripts/catalog/load.ts';
import {
  CatalogValidationError,
  catalogProblems,
  readDenylist,
  validateCatalog,
} from '../../scripts/catalog/validate.ts';

const real = loadCatalogData();
const denylist = readDenylist();

function problemsAfter(mutate: (catalog: CatalogData) => void): string[] {
  const catalog = structuredClone(real);
  mutate(catalog);
  return catalogProblems(catalog, denylist);
}

const find = <T extends { key: string }>(rows: T[], key: string): T => rows.find((row) => row.key === key)!;

describe('catalog validation', () => {
  it('accepts the real catalog, denylist included', () => {
    expect(denylist).toContain('grand exchange');
    expect(catalogProblems(real, denylist)).toEqual([]);
    expect(() => validateCatalog(real)).not.toThrow();
  });

  it('lists every problem when it throws', () => {
    const catalog = structuredClone(real);
    catalog.skills[0].key = 'Bad Key';
    catalog.items[0].name = '';
    try {
      validateCatalog(catalog, denylist);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(CatalogValidationError);
      expect((error as CatalogValidationError).problems.length).toBeGreaterThanOrEqual(2);
    }
  });

  it.each<[string, (catalog: CatalogData) => void, RegExp]>([
    [
      'keys match the key pattern',
      (c) => (find(c.items, 'plate_crab').key = 'Plate-Crab'),
      /key "Plate-Crab" must match/,
    ],
    [
      'keys are unique per kind',
      (c) => (find(c.exercises, 'deadlift').key = 'back_squat'),
      /exercise key "back_squat" is not unique/,
    ],
    [
      'generated names are unique',
      (c) => c.programs[0].days.push({ ...c.programs[0].days[0], name: 'Another push' }),
      /generated id name "program:ppl:push" is not unique/,
    ],
    ['names are at least 1 character', (c) => (find(c.items, 'plate_crab').name = ''), /name must be 1-60 characters/],
    [
      'names are at most 60 characters',
      (c) => (find(c.items, 'plate_crab').name = 'x'.repeat(61)),
      /name must be 1-60/,
    ],
    [
      'names are unique per kind, case-insensitively',
      (c) => (find(c.items, 'plate_crab').name = 'SPOTTER PUP'),
      /item name "spotter pup" is not unique/,
    ],
    [
      'shares reference existing skills',
      (c) => (find(c.exercises, 'deadlift').shares[0].skill = 'neck'),
      /shares unknown skill "neck"/,
    ],
    ['shares sum to 10000', (c) => (find(c.exercises, 'deadlift').shares[0].shareBp = 4000), /shares sum to 9000/],
    [
      'variation_of references a built-in exercise',
      (c) => (find(c.exercises, 'pause_squat').variationOf = 'hack_squat'),
      /variation of unknown exercise "hack_squat"/,
    ],
    [
      'requires_unlock implies variation_of',
      (c) => (find(c.exercises, 'pause_squat').variationOf = null),
      /requires an unlock but is no variation/,
    ],
    [
      'every scroll grants a requires_unlock exercise',
      (c) => (find(c.items, 'scroll_pause_squat').grants = 'back_squat'),
      /scroll "scroll_pause_squat" must grant exactly one exercise that requires an unlock/,
    ],
    [
      'every requires_unlock exercise has exactly one scroll',
      (c) => (find(c.items, 'scroll_z_press').grants = 'pause_squat'),
      /"pause_squat" requires an unlock and needs exactly one scroll, has 2/,
    ],
    [
      'only scrolls grant exercises',
      (c) => (find(c.items, 'plate_crab').grants = 'pause_squat'),
      /item "plate_crab" grants an exercise but is no scroll/,
    ],
    [
      'drop entries reference items',
      (c) => (find(c.dropTables, 'rare').entries[0].item = 'golden_goose'),
      /drop table "rare" references unknown item "golden_goose"/,
    ],
    [
      'drop weights are integers in range',
      (c) => (find(c.dropTables, 'rare').entries[0].weight = 1.5),
      /weight must be an integer in 1-1000000/,
    ],
    [
      'drop weights are at most 1 000 000',
      (c) => (find(c.dropTables, 'rare').entries[0].weight = 1_000_001),
      /weight must be an integer/,
    ],
    [
      'drop quantities satisfy min <= max',
      (c) => Object.assign(find(c.dropTables, 'rare').entries[0], { min: 3, max: 2 }),
      /needs 1 <= min <= max <= 1000/,
    ],
    [
      'drop quantities are at least 1',
      (c) => Object.assign(find(c.dropTables, 'rare').entries[0], { min: 0 }),
      /needs 1 <= min <= max/,
    ],
    [
      'drop quantities are at most 1000',
      (c) => Object.assign(find(c.dropTables, 'rare').entries[0], { max: 1001 }),
      /needs 1 <= min <= max <= 1000/,
    ],
    [
      'recipe inputs reference items',
      (c) => (find(c.recipes, 'grinder_belt').inputs[0].item = 'golden_goose'),
      /recipe "grinder_belt" input references unknown item "golden_goose"/,
    ],
    [
      'recipe input quantities are 1-1000',
      (c) => (find(c.recipes, 'grinder_belt').inputs[1].quantity = 0),
      /input "grinder_scraps" quantity must be 1-1000/,
    ],
    [
      'a recipe output is never among its own inputs',
      (c) => (find(c.recipes, 'grinder_belt').inputs[0].item = 'grinder_belt'),
      /recipe "grinder_belt" consumes its own output/,
    ],
    [
      'the regular table exists',
      (c) => (c.dropTables = c.dropTables.filter((table) => table.key !== 'regular')),
      /drop table "regular" is required/,
    ],
    ['the rare table exists', (c) => (find(c.dropTables, 'rare').retired = true), /drop table "rare" is required/],
    [
      'icons are known icon kinds',
      (c) => (find(c.items, 'plate_crab').icon = 'crab'),
      /item "plate_crab" has unknown icon "crab"/,
    ],
    [
      'an active drop table has entries',
      (c) => (find(c.dropTables, 'rare').entries = []),
      /drop table "rare" has no entries/,
    ],
    [
      'program days never use a locked variation',
      (c) => (c.programs[0].days[0].exercises[0].exercise = 'pause_bench_press'),
      /program day "ppl:push" uses locked exercise "pause_bench_press"/,
    ],
    [
      'no retired item appears in an active table',
      (c) => (find(c.items, 'plate_crab').retired = true),
      /drop table "rare" uses retired item "plate_crab"/,
    ],
    [
      'no retired item appears in a recipe',
      (c) => (find(c.items, 'rookie_belt').retired = true),
      /recipe "grinder_belt" input uses retired item "rookie_belt"/,
    ],
    [
      'no denylisted term appears in a name',
      (c) => (find(c.items, 'plate_crab').name = 'Party Hat'),
      /"Party Hat" matches denylisted term "party hat"/,
    ],
    [
      'no denylisted term appears in a key',
      (c) => (find(c.items, 'plate_crab').key = 'rune_crab'),
      /"rune_crab" matches denylisted term "rune"/,
    ],
    [
      'no denylisted term appears in a description',
      (c) => (find(c.items, 'plate_crab').description = 'Found near Varrock.'),
      /matches denylisted term "varrock"/,
    ],
  ])('rejects a catalog when %s is broken', (_rule, mutate, expected) => {
    const problems = problemsAfter(mutate);
    expect(
      problems.some((problem) => expected.test(problem)),
      problems.join('\n'),
    ).toBe(true);
  });

  it('accepts a retired drop table without entries', () => {
    expect(
      problemsAfter((c) => c.dropTables.push({ key: 'old_table', name: 'Old table', retired: true, entries: [] })),
    ).toEqual([]);
  });

  it('matches denylisted terms as whole words only', () => {
    expect(problemsAfter((c) => (find(c.items, 'plate_crab').name = 'Prune Crab'))).toEqual([]);
    expect(problemsAfter((c) => (find(c.items, 'plate_crab').name = 'Dragonfly Crab'))).toEqual([]);
  });
});
