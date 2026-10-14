# Catalog Generator

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Turns the YAML in `catalog/` into `supabase/seed.sql`. The pipeline is `readCatalogSources` (parse YAML), `expandCatalog` (zod schemas, gear expansion, drop-table shorthand), `validateCatalog` (cross-reference and policy rules) and `renderSeed` (idempotent upsert SQL with deterministic UUID v5 ids). Catalog content rules are listed in `catalog/AGENTS.md`.

## Map

- `generate.ts`: the CLI (`make catalog`, `make catalog-check` with `--check`). Always validates before rendering, so an invalid catalog never reaches the seed. Appends program template rows after checking the lock.
- `load.ts`: strict zod schemas per YAML file and `expandCatalog`. Shape errors (unknown field, wrong type, bad enum) fail here.
- `validate.ts`: every semantic problem in one pass. Add a rule by pushing a message onto `problems` in the matching `check*` function; quote the offending key.
- `sql.ts`: upserts per table, retiring rows removed from the YAML (`retireAllExcept`).
- `program-templates.ts`: template schema (its type equals the domain `ProgramDefinition`), rendering with `on conflict (key, version) do nothing`, and the lock hash.
- `namespace.ts`: `CATALOG_NAMESPACE`.

## Rules and gotchas

- Never change `CATALOG_NAMESPACE` or the names in `catalogNames` (`item:<key>`, `program:<key>`, `program:<program>:<day>`, `challenge:<key>`, `quest:<key>`, `drop_table:<key>`, `recipe:<key>`): they derive every row id, so a change re-keys every row.
- Output must be deterministic: `generate.test.ts` and `make catalog-check` compare strings byte for byte. `validate.test.ts` locks the problem report order.
- jsonb definitions (challenges, quests) are built as a `StoredJson` tree (`Map` for objects, `CatalogRef` for an id) and rendered by one function, so a test can read the same tree the seed renders. Quest definitions must parse with `questDefinitionFromStored`; challenge checks take a `where` prefix so quest workout steps reuse them with the challenge messages unchanged.
- Program limits in `validate.ts` mirror the database checks (at most 14 days, day names up to 40 characters, 20 exercises a day, 1-10 sets, `1 <= reps_min <= reps_max <= 100`). Change both together.
- Changing the `CatalogData` shape can break `tests/web/items.test.ts` and `tests/domain/crafting.test.ts`, which load the catalog.
- The only I/O is reading YAML and the denylist and writing the seed; everything else is pure over `CatalogData`.

## Testing

- `make test-catalog` (no stack): `tests/catalog/validate.test.ts` for rules, `generate.test.ts` for loading, ids and SQL, `program-templates.test.ts` for templates and the lock. Write the failing case first, then `make catalog` and `make catalog-check`.
- `tests/integration/catalog.test.ts` checks the seed against a real database (stack).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
