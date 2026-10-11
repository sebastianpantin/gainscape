# tests/balance

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-08

## Purpose

Simulation-backed tests. `balance-bands.test.ts` proves the committed balance constants in `domain/balance.ts` still meet the progression design bands; `seeded-simulation.test.ts` locks the seeded simulator output exactly. Both run behind `make sim-check` in about 1 s.

## Key Files

| File                        | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `balance-bands.test.ts`     | Also the `gear bonus bands` (`GEAR_BANDS`: full Ascendant against gearless on every lift skill and on cardio, Ascendant belt only on core and chest) and the `with a challenge passed every session` bands (`CHALLENGE_BANDS`: about 25% more XP, about 35% with full Ascendant gear). Runs `simulateCommittedConstantsUntilLegsReach99()` once in `beforeAll` (120 s hook timeout), then asserts via `evaluateBands`: legs is the first skill to 99; a balanced 3x/week lifter needs the years in `BANDS.balancedLifterYears`; hypertrophy vs strength gap is within `BANDS.focusedLifterMaxGap`; casual time scales with effort within `BANDS.casualRatioTolerance`; the balanced lifter ends week 1 at a legs level within `BANDS.balancedWeekOneLevel`; every profile reaches level 99 within the 40-year horizon. A second `beforeAll` runs `simulateCommittedCardioConstantsUntilBothReach99()` and asserts via `evaluateCardioBands`, per cardio skill, (a-c) 99 in `CARDIO_BANDS.balancedYears` and (e-c) week-1 level in `CARDIO_BANDS.balancedWeekOneLevel`, then (g) the Agility/Endurance rate ratio and (h) a steady Agility bout earning no more than an interval session. A `mobility balance bands` block simulates `MOBILITY_PROFILES.mobility_regular` and asserts (m) 99 in `MOBILITY_BANDS.regularYears`, (m-e) the week-1 level and no gear bonus on Mobility. |
| `seeded-simulation.test.ts` | Golden values that lock determinism: the first `seededRandom(42)` draws, `integerBetween` bounds (fast-check), and the exact weeks, week-to-99 and first-week XP of every lifter profile and the balanced cardio profile under the committed constants. A change to the order of random draws fails it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## For AI Agents

### Working In This Directory

- The bands live in `scripts/balance/bands.ts`, the simulator in `scripts/balance/simulate.ts` and `scripts/balance/tune.ts`. This test only asserts; change thresholds there, with justification, never by loosening an assertion here.
- Any edit to constants in `supabase/functions/_shared/domain/balance.ts` must keep this test green. Run `make test-domain` and `make sim-check` together.

### Testing Requirements

- Run with `make sim-check` or `npx vitest run tests/balance`. No stack needed. CI runs it in the `checks` job.
- A new balance band starts as a failing assertion here plus a field in `evaluateBands`' report.
- `make sim` (`scripts/balance/report.ts`) prints the full report for tuning.

### Common Patterns

- One expensive `beforeAll` computes `results` and `report`; each `it` asserts a single band, named with the design letter, for example `(a)`, `(b)`, `(d)`, `(e)`.

## Dependencies

### Internal

- `@domain/index.ts` (`DEFAULT_BALANCE`)
- `../../scripts/balance/bands.ts`, `simulate.ts`, `tune.ts`

### External

- Vitest

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
