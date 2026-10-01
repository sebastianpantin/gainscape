# Balance Simulator

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Simulates years of training for four lifter profiles using the real domain engine (`processSession`, strength history) and checks that the committed constants in `domain/balance.ts` (`DEFAULT_BALANCE`) keep leveling pace inside target bands: a focused lifter reaches level 99 in 5 to 7 years, hypertrophy and strength profiles stay within 15% of each other, and the casual profile's time and effort ratios stay within tolerance. `make sim` prints a tuning table; `make sim-check` asserts the bands.

## Key Files

| File          | Description                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report.ts`   | Entry for `make sim`. Prints each tuning candidate, the feasible count and the exact simulation of the committed constants.                                      |
| `tune.ts`     | `tune()` grid search over `intensityBonusMax` and `intensityBonusFull`, best XP per rep search; `simulateCommittedConstantsUntilLegsReach99()` used by the test. |
| `bands.ts`    | `BANDS` targets, `yearsToLevel99`, `evaluateBands` returning a `BandReport` with pass flags a, b, d and a violation score.                                       |
| `simulate.ts` | `simulateProfile`, `firstSkillToLevel99`, `SimulationResult`; seeded (42) week-by-week session generation with deloads and strength growth.                      |
| `profiles.ts` | `PROFILES` (`hypertrophy`, `strength`, `balanced`, `casual`) and `STARTING_E1RM_KG`.                                                                             |
| `catalog.ts`  | `SIM_CATALOG`, `SIM_SKILLS`, `SIM_EXERCISE_SHARES`: a hard-coded subset of the real catalog.                                                                     |
| `random.ts`   | `seededRandom` (mulberry32-style) so results are deterministic.                                                                                                  |

## For AI Agents

### Working In This Directory

- `SIM_EXERCISE_SHARES` and `SIM_SKILLS` duplicate `catalog/exercises.yaml` and `catalog/skills.yaml`. When those shares change, update `catalog.ts`; `tests/integration/sim-catalog.test.ts` fails on drift.
- Imports from the domain must go through `supabase/functions/_shared/domain/index.ts`.
- Keep the simulation deterministic: use `seededRandom`, never `Math.random` or the real clock (the start date is a constant).
- If `make sim-check` fails after changing balance constants, tune with `make sim` and update `domain/balance.ts`, not the bands, unless the design targets change.
- The `.omc/` directory here is tool state and ignored; do not touch it.

### Testing Requirements

- `tests/balance/balance-bands.test.ts` (`make sim-check`, about 15 s) runs the committed constants through the bands and unit-tests `evaluateBands`. Put a failing band or `yearsToLevel99` case there first.
- `tests/integration/sim-catalog.test.ts` (`make test-integration`, needs the stack) guards catalog drift.
- `report.ts` is a console report with no test of its own.

### Common Patterns

- Frozen constants for targets (`Object.freeze`); named constants for simulation parameters; pure functions returning plain result records.

## Dependencies

### Internal

- `../../supabase/functions/_shared/domain/index.ts` (`DEFAULT_BALANCE`, `processSession`, `xpForLevel`, strength helpers)

### External

- None beyond Node and TypeScript.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
