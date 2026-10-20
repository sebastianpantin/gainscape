# Stats Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-20 · **Updated:** 2026-10-20

## Purpose

The Stats screen at `/collection/stats`, linked from the Collection Records tab: every long-range analytics view (training calendar, month compare, volume history, relative strength, PR timeline, loot stats) lives here, on one screen, instead of a sixth bottom tab.

## Map

- `StatsScreen.tsx`: the screen, with a `‹ Collection` back link like the other sub-screens.
- Charts: `../../components/BarChart.tsx` and `LineChart.tsx`, over `../../lib/ui/bar-chart-rules.ts` and `line-chart-rules.ts`. Week (Monday first) and month keys: `../../lib/ui/date-bucket-rules.ts`.

## Rules and gotchas

- Keep the screen thin: each section's decisions go in a pure `lib/**/*-rules.ts` with a unit test.
- Read history through aggregate RPCs that return one jsonb, never by paging the History list client-side (it embeds every set and pages in 50s).
- Sums stay in kg; convert only for display with `../../lib/units.ts`.
- A sub-route (for example a full list) is declared before any `:param` route under `/collection` and added to `SCREEN_TITLES`.

## Testing

- Unit: `tests/web/date-bucket-rules.test.ts`, `tests/web/bar-chart-rules.test.ts`, the title in `tests/web/route-title-rules.test.ts`.
- E2E (stack): `e2e/stats.spec.ts` (opens from Collection, title, focus, back link, axe), `e2e/a11y.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
