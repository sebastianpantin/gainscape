# tests/catalog

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Tests for the catalog toolchain in `scripts/catalog/`: the deterministic SQL seed generator and the validator that guards the YAML sources in `catalog/`. They run without the stack and read the real committed catalog.

## Key Files

| File                             | Description                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate.test.ts`               | Generator determinism (`generateSeed()` twice is identical), the committed `supabase/seed.sql` equals `generateSeed()`, the pinned UUID namespace, stable `idFor` ids, and retire statements from `renderStatements`.                                                                                                                                    |
| `validate.test.ts`               | Uses `catalogProblems`, `validateCatalog`, `readDenylist` and `CatalogValidationError`. Accepts the real catalog, then mutates a `structuredClone` per case to prove each rule (tiers, gear slots, denylist terms, references) reports a problem.                                                                                                        |
| `sim-catalog.test.ts`            | The balance simulator's `SIM_EXERCISE_SHARES` and `SIM_SKILLS` (`scripts/balance/catalog.ts`) equal the catalog's exercise shares and skills.                                                                                                                                                                                                            |
| `program-templates.test.ts`      | Every domain program fixture round-trips through the zod schema and passes `programTemplateProblems`; shape errors name file and path; the source, kg conversion, key and name rules; every shipped day named `Day 1` to `Day n` in schedule order; each YAML equals its fixture; `<key>@<n>.yaml` older versions; insert-only seed rows; its lock file. |
| `program-template-types.test.ts` | Type-level: the zod schema infers exactly the domain `ProgramDefinition`. Checked by `make typecheck`.                                                                                                                                                                                                                                                   |

## For AI Agents

### Working In This Directory

- `generate.test.ts` fails when `supabase/seed.sql` is stale. Fix it with `make catalog`, never by editing the seed or the test.
- The namespace constant `PINNED_NAMESPACE` in `generate.test.ts` is deliberately duplicated from `scripts/catalog/namespace.ts`. Changing the real namespace would re-id every row, so a failing pin test is a stop sign, not something to update.
- `validate.test.ts` reads `../ip-denylist.txt` through `readDenylist()`. It asserts the list contains `grand exchange`; keep that term.

### Testing Requirements

- Suite: `make test-catalog`, or one file with `npx vitest run tests/catalog/validate.test.ts`. No stack needed.
- A new validator rule starts with a failing case in `validate.test.ts` (use the `problemsAfter(mutate)` helper and the `find(rows, key)` helper), then the rule goes in `scripts/catalog/validate.ts`.
- A generator change starts in `generate.test.ts`; finish with `make catalog` and `make catalog-check`.
- The database view of the same catalog is checked by `../integration/catalog.test.ts` (stack needed).

### Common Patterns

- `problemsAfter((catalog) => { ... })` clones the real `CatalogData`, applies one mutation and returns `catalogProblems(catalog, denylist)`.
- Assertions check the problem message text, so message wording in `validate.ts` is part of the contract.

## Dependencies

### Internal

- `../../scripts/catalog/` (`generate.ts`, `load.ts`, `namespace.ts`, `sql.ts`, `validate.ts`)
- `../../catalog/*.yaml`, `../../supabase/seed.sql`, `../ip-denylist.txt`

### External

- Vitest

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
