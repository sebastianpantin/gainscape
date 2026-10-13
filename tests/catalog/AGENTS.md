# tests/catalog

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Tests for the catalog toolchain in `scripts/catalog/`: the deterministic seed generator, the validator, the program templates and their lock, and the balance simulator's copy of the catalog. They run without the stack and read the real committed catalog.

## Map

- `generate.test.ts`: determinism, committed seed equals `generateSeed()`, the pinned namespace, stable ids, retire statements.
- `validate.test.ts`: accepts the real catalog, then mutates a clone per case (`problemsAfter(mutate)`) to prove each rule reports a problem.
- `program-templates.test.ts` and `program-template-types.test.ts` (type-level, checked by `make typecheck`): templates, fixtures, versions and the lock.
- `sim-catalog.test.ts`: `scripts/balance/catalog.ts` matches the catalog shares and skills.

## Rules and gotchas

- `generate.test.ts` fails when `supabase/seed.sql` is stale. Fix it with `make catalog`, never by editing the seed or the test.
- `PINNED_NAMESPACE` is deliberately duplicated from `scripts/catalog/namespace.ts`. Changing the real namespace would re-id every row, so a failing pin test is a stop sign, not something to update.
- `validate.test.ts` asserts the denylist contains `grand exchange`; keep that term.
- Assertions check problem message text, so message wording in `validate.ts` is part of the contract.

## Testing

`make test-catalog`, or `npx vitest run tests/catalog/validate.test.ts`. No stack. A new rule starts with a failing case in `validate.test.ts`; a generator change starts in `generate.test.ts` and ends with `make catalog` and `make catalog-check`. The database view is `tests/integration/catalog.test.ts` (stack).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
