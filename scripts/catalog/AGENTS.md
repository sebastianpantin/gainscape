# Catalog Generator

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-08

## Purpose

Turns the YAML in `catalog/` into `supabase/seed.sql`. The pipeline is `readCatalogSources` (parse YAML), `expandCatalog` (Zod schemas, gear expansion, drop-table shorthand), `validateCatalog` (cross-reference and policy rules), and `renderSeed` (idempotent upsert SQL with deterministic UUID v5 ids).

## Key Files

| File                   | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate.ts`          | CLI. Appends the program template rows after checking them against `catalog/program-templates.lock.json`. `make catalog` writes `supabase/seed.sql`; `make catalog-check` (`--check`) exits 1 if the committed seed differs. Exports `generateSeed()` and `SEED_PATH`.                                                                                                                                                                                                                                                                                                                    |
| `load.ts`              | Zod `strictObject` schemas per YAML file, `CatalogData` types (including `CatalogChallenge`), `loadCatalogData()`, `expandCatalog()` (gear items `<tier>_<slot>`, `<tier>_scraps`, upgrade recipes, `gear:<tier>` shorthand, whose weight is the tier's total: every other entry's weight is multiplied by the slot count and each slot gets the shorthand's weight), and `catalogNames`. The cardio block's optional `distance: false` becomes `tracksDistance` (default true). An exercise's optional `measure` (`time`, `distance`) becomes `CatalogExercise.measure`, default `reps`. |
| `validate.ts`          | `catalogProblems()` returns a list of problem strings; `validateCatalog()` throws `CatalogValidationError` listing them all. Reads `tests/ip-denylist.txt`. An activity with `distance: false` may not have a reference pace. A `measure` only on lifts, a variation with its base's measure, and no hold exercise in a program day or a challenge.                                                                                                                                                                                                                                       |
| `sql.ts`               | `renderStatements()` and `renderSeed()`: upsert inserts per table (`challenges` carries its `definition` as `jsonb_build_object` of the exercise ids, percentages and counts), `retireAllExcept` to retire rows removed from the YAML. `idFor(name)` yields `uuid_generate_v5(namespace, name)`. Exercises render `tracks_distance` (true for lifts). Exercises also render `measure`.                                                                                                                                                                                                    |
| `namespace.ts`         | `CATALOG_NAMESPACE` UUID. Changing it changes every generated id. Never change it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `program-templates.ts` | Program templates in `catalog/program-templates/`: the strict zod `programDefinitionSchema` (its type equals the domain `ProgramDefinition`), `loadProgramTemplates()` (throws `ProgramTemplateShapeError` naming the file, or `CatalogValidationError` listing `programTemplateProblems`), `kgFromLb`, `renderProgramTemplates()` (insert with `on conflict (key, version) do nothing`), and the lock: `readProgramTemplateLock`, `programDefinitionHash`, `programTemplateLockProblems`.                                                                                                |

## For AI Agents

### Working In This Directory

- **How validate.ts enforces the schema.** Shape errors (unknown field, wrong type, bad enum) fail earlier, in the Zod schemas in `load.ts`. `validate.ts` then collects every semantic problem in one pass: key pattern `^[a-z0-9_]+$`, name length 1-60, uniqueness of keys, names, generated id names and skill `sort_order`; exercise shares sum to 10000 over known skills, each share 1-10000; `variation_of` targets; programs only use known lift exercises and match the DB checks (at most 14 days, day names at most 40 characters, at most 20 exercises a day, 1-10 sets, `1 <= reps_min <= reps_max <= 100`); gear tiers and slots equal `ITEM_TIERS` and `GEAR_SLOTS` in order; item icons within `ITEM_ICON_KINDS`; scrolls grant a known challenge and each challenge has exactly one scroll; challenge shape (prescription needs supersets and no volume, volume the reverse, at least 2 exercises per superset, no exercise repeated within or across supersets, rounds, reps and target above 0), lift-only exercises and percentages only on external-load exercises; drop-table and recipe references, weights and quantity ranges, required non-retired `regular` and `rare` tables, no duplicate entries; denylist terms.
- `generate.ts` always validates before rendering, so an invalid catalog never reaches the seed.
- Add a rule by pushing a message onto `problems` in the matching `check*` function (`checkExercises`, `checkProgramDays`, `checkGear`, `checkItems`, `checkChallenges`, `checkDropTables`, `checkRecipes`, `checkDenylist`) that `catalogProblems` calls in that order. Keep messages quoting the offending key; `validate.test.ts` locks the report order.
- Row identity comes from names in `catalogNames` (`item:<key>`, `program:<key>`, `program:<program>:<day>`, `challenge:<key>`, `drop_table:<key>`, `recipe:<key>`). Changing these functions or `CATALOG_NAMESPACE` re-keys every row.
- Output must be deterministic. `generate.test.ts` and `make catalog-check` compare strings byte for byte.
- When the `CatalogData` shape changes, `web` and tests that import `loadCatalogData` (`tests/web/items.test.ts`, `tests/domain/crafting.test.ts`) may break too.

### Testing Requirements

- `tests/catalog/validate.test.ts` for rules and `tests/catalog/generate.test.ts` for loading, ids and SQL, via `make test-catalog`. Write the failing case there first, then change the code, then `make catalog` and `make catalog-check`.
- No local stack needed. `tests/integration/catalog.test.ts` checks the seed against a real database and does need it.

### Common Patterns

- Pure functions over a `CatalogData` value; the only I/O is `readCatalogSources`, `readDenylist` and the writes in `generate.ts`.
- Optional YAML fields default during expansion (`retired ?? false`, `min ?? 1`, `max ?? min ?? 1`).

## Dependencies

### Internal

- `../../catalog/*.yaml`, `../../supabase/functions/_shared/domain/crafting.ts`, `../../tests/ip-denylist.txt`, `../../supabase/seed.sql`

### External

- `yaml`, `zod`, `node:fs`, `node:path`

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
