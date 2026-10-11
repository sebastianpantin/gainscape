# Balance Simulator

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-08

## Purpose

Simulates years of training for four lifter profiles using the real domain engine (`processSession`, strength history) and checks that the committed constants in `domain/balance.ts` (`DEFAULT_BALANCE`) keep leveling pace inside target bands: the balanced 3x/week lifter reaches legs level 99 in 2 to 3 years (target 2.5) and ends week 1 between legs level 20 and 40, hypertrophy and strength profiles stay within 15% of each other, and the casual profile's time and effort ratios stay within tolerance. `make sim` prints a tuning table; `make sim-check` asserts the bands.

## Key Files

| File                 | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `report.ts`          | Entry for `make sim`. Prints each tuning candidate, the feasible count and the exact simulation of the committed constants.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `tune.ts`            | `tune()` grid search over `intensityBonusMax` and `intensityBonusFull`, best XP per rep search; `simulateCommittedConstantsUntilLegsReach99()` used by the test; `tuneCardio()` solves each cardio rate in closed form from a unit-rate run and `simulateCommittedCardioConstantsUntilBothReach99()`.                                                                                                                                                                                                                                                                           |
| `bands.ts`           | `GEAR_BANDS` (full Ascendant XP ratio and Ascendant belt core ratio, both 1.09 to 1.11), `CHALLENGE_BANDS` (a passed challenge on every session 1.24 to 1.26 against none, and with full Ascendant gear 1.34 to 1.36), `BANDS` targets, `yearsToLevel99`, `evaluateBands` returning a `BandReport` with pass flags a, b, d, e and a violation score; `CARDIO_BANDS` and `evaluateCardioBands` (bands a-c and e-c per cardio skill, g, h). `MOBILITY_BANDS` (`mobility_regular` reaches 99 in 2.75 to 3.25 years and ends week 1 at level 20 to 40) and `evaluateMobilityBands`. |
| `cardio-simulate.ts` | `simulateCardioProfile` (seeded, real `processSession` over `CARDIO_SIM_CATALOG`; `options.skills` picks the tracked skills, `CARDIO_SIM_SKILLS` by default), `steadyAgilityBoutXp` and `intervalSessionAgilityXp` for band (h).                                                                                                                                                                                                                                                                                                                                                |
| `simulate.ts`        | `simulateProfile` (an optional `gearLoadout` and an optional `challenge` placed on every simulated session; both default to none), `ALWAYS_MET_CHALLENGE` (a volume challenge any session passes), `firstSkillToLevel99`, `SimulationResult`; seeded (42) week-by-week session generation with deloads and strength growth.                                                                                                                                                                                                                                                     |
| `profiles.ts`        | `PROFILES` (`hypertrophy`, `strength`, `balanced`, `casual`), `STARTING_E1RM_KG`, `CARDIO_PROFILES.cardio_balanced` (2 steady runs and 2 30x30 s interval sessions a week), `STEADY_AGILITY_BOUT` and `MOBILITY_PROFILES.mobility_regular` (three 20-minute moderate stretching sessions a week).                                                                                                                                                                                                                                                                               |
| `catalog.ts`         | `SIM_CATALOG`, `SIM_SKILLS`, `SIM_EXERCISE_SHARES`: a hard-coded subset of the real catalog; separate `CARDIO_SIM_SKILLS`, `CARDIO_SIM_EXERCISES`, `CARDIO_SIM_CATALOG` for cardio; `MOBILITY_SIM_SKILLS` (simulated on its own, so `cardio_balanced` still stops when Endurance and Agility reach 99) and `static_stretching` in `CARDIO_SIM_EXERCISES`.                                                                                                                                                                                                                       |
| `random.ts`          | `seededRandom` (mulberry32-style) so results are deterministic.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `progress.ts`        | `SIMULATION_SEED` (42), `DAY_MS`, `LEVEL_99_XP` and `skillProgress`, the weekly cumulative-XP and week-to-99 bookkeeping both simulators share.                                                                                                                                                                                                                                                                                                                                                                                                                                 |

## For AI Agents

### Working In This Directory

- `SIM_EXERCISE_SHARES` and `SIM_SKILLS` duplicate `catalog/exercises.yaml` and `catalog/skills.yaml`. When those shares change, update `catalog.ts`; `tests/catalog/sim-catalog.test.ts` fails on drift.
- Imports from the domain must go through `supabase/functions/_shared/domain/index.ts`.
- Keep the simulation deterministic: use `seededRandom`, never `Math.random` or the real clock (the start date is a constant).
- If `make sim-check` fails after changing balance constants, tune with `make sim` and update `domain/balance.ts`, not the bands, unless the design targets change.
- The `.omc/` directory here is tool state and ignored; do not touch it.

### Testing Requirements

- `tests/balance/balance-bands.test.ts` (`make sim-check`, about 1 s) runs the committed constants through the bands. Hypertrophy and strength years are informational except for band (b), the gap between them. Put a failing band or `yearsToLevel99` case there first.
- `tests/catalog/sim-catalog.test.ts` (`make test-catalog`, no stack) guards catalog drift for shares and skills.
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
