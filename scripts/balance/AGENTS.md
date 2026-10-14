# Balance Simulator

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Simulates years of training for lifter, cardio and mobility profiles with the real domain engine and checks that the committed constants in `domain/balance.ts` keep leveling pace inside design bands. `make sim` prints a tuning table (`report.ts`); `make sim-check` asserts the bands.

## Map

- `bands.ts`: the design targets and their evaluation (strength, gear, challenge, cardio, mobility, quest XP budget). Example: a balanced 3x/week lifter reaches legs 99 in 2 to 3 years and ends week 1 between legs level 20 and 40.
- `simulate.ts` and `cardio-simulate.ts`: seeded week-by-week simulations; `profiles.ts`: the profiles; `tune.ts`: grid search and closed-form cardio tuning (CLI-free, so tests import it).
- `catalog.ts`: a hard-coded subset of the real catalog for the simulator.
- `random.ts` and `progress.ts`: the seeded RNG and shared bookkeeping.

## Rules and gotchas

- `SIM_EXERCISE_SHARES` and `SIM_SKILLS` duplicate `catalog/exercises.yaml` and `catalog/skills.yaml`. Update `catalog.ts` when shares change; `tests/catalog/sim-catalog.test.ts` fails on drift.
- Mobility is simulated on its own, so `cardio_balanced` still stops when Endurance and Agility reach 99.
- Import the domain only through `supabase/functions/_shared/domain/index.ts`.
- Keep it deterministic: `seededRandom` (seed 42) and a constant start date, never `Math.random` or the real clock.
- When `make sim-check` fails after a balance change, tune with `make sim` and change `domain/balance.ts`, not the bands, unless the design targets change.
- Hypertrophy and strength years are informational except band (b), the gap between them.
- Quest XP is a one-off reward outside the simulation, so `QUEST_BANDS` bound the catalog instead: each skill's total quest XP stays within 1% of level 99, a quest without requirements grants at most 1000 XP per skill, and week one with every such quest done still ends between legs level 20 and 40. `evaluateQuestBudget` takes the loaded catalog quests, so a new quest in `catalog/quests.yaml` is checked by `make sim-check`.

## Testing

- `tests/balance/balance-bands.test.ts` via `make sim-check` (about 1 s). Put a failing band case there first.
- `tests/catalog/sim-catalog.test.ts` (`make test-catalog`) guards catalog drift. `report.ts` has no test.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
