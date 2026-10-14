# tests/balance

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Simulation-backed tests. `quest-budget.test.ts` holds the quest XP rewards in `catalog/quests.yaml` to `QUEST_BANDS`. `balance-bands.test.ts` proves the committed constants in `domain/balance.ts` still meet the progression design bands (lifters, gear, challenges, cardio, mobility). `seeded-simulation.test.ts` locks the seeded simulator output exactly. Both run behind `make sim-check` in about 1 s.

## Rules and gotchas

- The bands live in `scripts/balance/bands.ts` and the simulator in `scripts/balance/`. This directory only asserts. Change thresholds there, with justification, never by loosening an assertion here.
- `seeded-simulation.test.ts` fails on any change to the order of random draws. That is intended: it proves determinism.
- One expensive `beforeAll` per block computes the simulation (with an explicit 120 s hook timeout); each `it` asserts one band, named with its design letter, such as `(a)` or `(b)`.
- A new band starts as a failing assertion here plus a field in the band report.
- Any edit to `supabase/functions/_shared/domain/balance.ts` must keep this green. Run `make test-domain` and `make sim-check` together.

## Testing

`make sim-check` or `npx vitest run tests/balance`. No stack. CI runs it in the `checks` job. `make sim` prints the full report for tuning.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
