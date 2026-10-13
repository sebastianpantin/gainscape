# tests/domain

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Fast, stack-free tests of the pure game engine in `supabase/functions/_shared/domain/`: XP and levels, effort and strength, records, the session pipeline, cardio and holds, challenges, gear, loot, crafting, feed events, edits, replay and the program engine. This is the cheapest layer, so every game-rule change starts here. It also holds `purity.test.ts`, which enforces the domain import and global rules.

## Map

- Test files are named after the domain module they cover (`xp.test.ts` for `domain/xp.ts`, `loot.test.ts` for `domain/loot.ts`). `describe` blocks are named after the exported function or rule under test.
- `program-*.test.ts`: the program engine. Per-template goldens in kg and lb (`program-531`, `program-madcow`, `program-gzclp`, ...), definition and validation (`program-definition`, `program-validation*`, `program-expressiveness`: every kept program validates, parses and resolves a full cycle), state folding, fact ordering, epochs, late facts and re-judging.
- `fixtures.ts`: `TEST_BALANCE`, a small catalog, `aSet`, `aBout`, effort constants, `freshUser`. `loot-fixtures.ts`: loot tables and deterministic RNGs (`scriptedRng`, `fixedRngFor`).
- `program-fixtures/`: one definition and enrollment per kept program, plus `follow.ts` (`followProgram` logs each next day as prescribed) and `prescription-helpers.ts` (`broken` mutates a definition for validation tests). `five_three_one.ts` and `madcow_5x5.ts` equal the catalog YAML. `ci-changes` treats this directory as backend input.
- Cross-module cases live where the stacking happens: challenge plus gear bonus stacking and caps are in `pipeline.test.ts`; a challenge verdict surviving an edit is in `replay.test.ts`.

## Rules and gotchas

- Import engine code through `@domain/index.ts` or `@domain/x.ts`. Tests stay free of I/O, wall-clock time and real randomness: pass explicit dates and a seeded or scripted `Rng`, never `Math.random`.
- `purity.test.ts` scans the domain directory at run time, so a new domain file is covered without editing it. It fails on a sibling-only import violation, a banned global (`Deno`, `process`, `window`, `document`, `localStorage`, `require`), a runtime import cycle anywhere in the domain, or any import cycle (type imports included) among `program-*.ts`. Never weaken the domain to make a test easier.
- Use `TEST_BALANCE` for balance-sensitive assertions so retuning production constants does not break unit tests. `xp.test.ts` and `replay.test.ts` still use `DEFAULT_BALANCE`; re-run them after a retune. `tests/balance/` covers the real constants.
- `tests/integration/replay.test.ts` and `complete-session.test.ts` run the same engine through the Edge Function. A behaviour change here usually moves an integration expectation too.

## Testing

- `make test-domain`; one file: `npx vitest run tests/domain/xp.test.ts`. No stack.
- Red-green: add a failing `it` next to the closest `describe`, run that file, confirm it fails for the right reason, change the engine, rerun. Run `make sim-check` too when balance constants or XP maths changed.
- Use fast-check (`fc.assert(fc.property(...))`) for invariants over many inputs.
- A new domain module gets its own `*.test.ts` here.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
