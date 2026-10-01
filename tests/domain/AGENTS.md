# tests/domain

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Fast, stack-free tests of the pure game engine in `supabase/functions/_shared/domain/`: XP and levels, effort and strength estimation, rep-max records, the session pipeline, loot, crafting, feed events and history replay. This is the lowest and cheapest test layer, so every game-rule change starts here. It also holds `purity.test.ts`, which enforces the domain import and global rules.

## Key Files

| File                  | Description                                                                                                                                                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fixtures.ts`         | Shared builders: `TEST_BALANCE` (frozen constants), a small `catalog`, `aSet`, `aBout` (cardio bouts; the catalog also holds Endurance and Agility skills and cardio activities), effort constants (`hard`, `nearFailure`, `failure`), `freshUser`. |
| `loot-fixtures.ts`    | Loot builders: `REGULAR_FIXTURE`, `RARE_FIXTURE`, `FIXTURE_TABLES`, `FRESH_DAY`, `candidate`, `fixedSeed`, `fixedRngFor`, `scriptedRng`.                                                                                                            |
| `xp.test.ts`          | Effort values, effective reps, XP split across skills.                                                                                                                                                                                              |
| `levels.test.ts`      | XP curve and combat level.                                                                                                                                                                                                                          |
| `strength.test.ts`    | Epley, predicted max reps, intensity bonus, effort resolution against a known e1RM, cold start in the baseline session (fast-check).                                                                                                                |
| `fatigue.test.ts`     | In-session fatigue check: repeated failure claims, honest declining sets, bodyweight, warm-ups, no-load sets.                                                                                                                                       |
| `records.test.ts`     | Rep-max records, bodyweight rep records, collection completion.                                                                                                                                                                                     |
| `cardio.test.ts`      | Cardio effort round-trip and kind mismatches, counted work, pace bonus, per-skill cardio XP, the 180-minute session cap.                                                                                                                            |
| `pipeline.test.ts`    | `processSession`, `HISTORY_ONLY_STEPS`, `carriedEffectiveLoadKg`, and a fast-check property that lift results are identical with or without interleaved cardio bouts.                                                                               |
| `replay.test.ts`      | Replaying history from a stored prior state, replay budget, determinism (fast-check).                                                                                                                                                               |
| `loot.test.ts`        | Chance and bad-luck protection, daily caps, qualification, `rngFor` discipline (fast-check).                                                                                                                                                        |
| `loot-seeds.test.ts`  | `lootSecret` handling.                                                                                                                                                                                                                              |
| `rng.test.ts`         | `sfc32FromSeed` and `lootSeedMessage` (fast-check).                                                                                                                                                                                                 |
| `crafting.test.ts`    | `canCraft` and `recipeFor`.                                                                                                                                                                                                                         |
| `events.test.ts`      | `isFeedLevelUp`, PR events, drop events, `feedEventsForSession`.                                                                                                                                                                                    |
| `edit-window.test.ts` | `isWithinEditWindow`.                                                                                                                                                                                                                               |
| `purity.test.ts`      | For every `.ts` in the domain directory: imports only sibling `./x.ts` files and uses no `Deno`, `process`, `window`, `document`, `localStorage` or `require`.                                                                                      |

## For AI Agents

### Working In This Directory

- Tests here import engine code through `@domain/index.ts` (or a specific `@domain/x.ts`). They must stay free of I/O, wall-clock time and real randomness; pass explicit dates and a seeded or scripted `Rng`.
- `purity.test.ts` reads the domain directory at run time with `readdirSync`, so a new domain file is covered automatically. Do not add a runtime global or a non-sibling import to the domain to make another test easier.
- Prefer `TEST_BALANCE` from `fixtures.ts` for balance-sensitive assertions so retuning production constants does not break unit tests. Some tests (`xp.test.ts`, `replay.test.ts`) still use `DEFAULT_BALANCE`; re-run them after retuning. `../balance/` covers the real constants.
- Server-side parity: `../integration/replay.test.ts` and `complete-session.test.ts` run the same engine through the Edge Function. If behaviour changes here, expect an integration expectation to move too.

### Testing Requirements

- Suite: `make test-domain`; one file: `npx vitest run tests/domain/xp.test.ts`. No stack.
- Red-green loop: add a failing `it` next to the closest existing `describe` (rule in `xp.test.ts`, loot rule in `loot.test.ts`, and so on), run just that file, confirm it fails for the right reason, change the engine file, rerun, then run `make test-domain && make sim-check` if balance constants or XP maths changed.
- For invariants over many inputs use fast-check as in `rng.test.ts` (`fc.assert(fc.property(...))`).
- A new domain module needs its own `*.test.ts` here; `purity.test.ts` needs no edit.

### Common Patterns

- `aSet(...)` from `fixtures.ts` for set rows; `freshUser` for a zero-XP user.
- Loot tests use `scriptedRng([...])` for exact rolls or `fixedRngFor(prefix)` for stable per-set randomness, never `Math.random`.
- `describe` blocks are named after the exported function or rule under test.

## Dependencies

### Internal

- `supabase/functions/_shared/domain/*` via `@domain/*`
- `../../vitest.config.ts` alias

### External

- Vitest, fast-check, `node:fs` and `node:crypto` (purity scan, `loot-fixtures.ts` hashing)

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
