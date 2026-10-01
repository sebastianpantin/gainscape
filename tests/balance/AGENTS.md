# tests/balance

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

A single simulation-backed test that proves the committed balance constants in `domain/balance.ts` still meet the progression design bands. It is the test behind `make sim-check` and takes about 15 s.

## Key Files

| File                    | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `balance-bands.test.ts` | Runs `simulateCommittedConstantsUntilLegsReach99()` once in `beforeAll` (120 s hook timeout), then asserts via `evaluateBands`: legs is the first skill to 99; a focused 4x/week lifter needs the years in `BANDS.focusedLifterYears` for both profiles; hypertrophy vs strength gap is within `BANDS.focusedLifterMaxGap`; casual time scales with effort within `BANDS.casualRatioTolerance`; every profile reaches level 99 within the 40-year horizon. |

## For AI Agents

### Working In This Directory

- The bands live in `scripts/balance/bands.ts`, the simulator in `scripts/balance/simulate.ts` and `scripts/balance/tune.ts`. This test only asserts; change thresholds there, with justification, never by loosening an assertion here.
- Any edit to constants in `supabase/functions/_shared/domain/balance.ts` must keep this test green. Run `make test-domain` and `make sim-check` together.
- The test logs a `balance report` line; do not remove it, it is the quickest way to see how far a constant change moved the years.

### Testing Requirements

- Run with `make sim-check` or `npx vitest run tests/balance`. No stack needed. CI runs it in the `static` job.
- A new balance band starts as a failing assertion here plus a field in `evaluateBands`' report.
- `make sim` (`scripts/balance/report.ts`) prints the full report for tuning.

### Common Patterns

- One expensive `beforeAll` computes `results` and `report`; each `it` asserts a single band, named with the design letter, for example `(a)`, `(b)`, `(d)`.

## Dependencies

### Internal

- `@domain/index.ts` (`DEFAULT_BALANCE`)
- `../../scripts/balance/bands.ts`, `simulate.ts`, `tune.ts`

### External

- Vitest

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
