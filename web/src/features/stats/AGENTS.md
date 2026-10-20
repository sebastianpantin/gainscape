# Stats Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-20 · **Updated:** 2026-10-20

## Purpose

The Stats screen at `/collection/stats`, linked from the Collection Records tab: every long-range analytics view (training calendar, month compare, volume history, relative strength, PR timeline, loot stats) lives here, on one screen, instead of a sixth bottom tab.

## Map

- `StatsScreen.tsx`: the screen, with a `‹ Collection` back link like the other sub-screens.
- Training calendar and month compare: `TrainingCalendarTable.tsx` and `MonthCompareTable.tsx` over `../../lib/stats/training-calendar-rules.ts` and `period-compare-rules.ts`. Both read `trainingDaysQuery(userId, month)`, one `training_days` RPC call (migration 059) for the shown month and the month before (`trainingDaysRange`).
- Charts: `../../components/BarChart.tsx` and `LineChart.tsx`, over `../../lib/ui/bar-chart-rules.ts` and `line-chart-rules.ts`. Week (Monday first) and month keys: `../../lib/ui/date-bucket-rules.ts`.

## Rules and gotchas

- Keep the screen thin: each section's decisions go in a pure `lib/**/*-rules.ts` with a unit test.
- Read history through aggregate RPCs that return one jsonb, never by paging the History list client-side (it embeds every set and pages in 50s).
- Every Stats query loads through `loadStatCacheFirst` (`../../offline/stats-cache.ts`), so the last answer shows offline with `OFFLINE_STATS_NOTICE`. Its root goes in `workout-changed` and `account-reset` in `query-freshness-rules.ts`.
- History-only workouts light their day (heat 1 at least) and count as workouts and volume, but add 0 XP. Heat is relative to the best day of the shown month, in four steps.
- Days are a plain `table` (caption = month title); each cell's name is a visually hidden label, today has `aria-current="date"`. Next month is disabled at the current month.
- Sums stay in kg; convert only for display with `../../lib/units.ts`.
- A sub-route (for example a full list) is declared before any `:param` route under `/collection` and added to `SCREEN_TITLES`.

## Testing

- Unit: `tests/web/date-bucket-rules.test.ts`, `bar-chart-rules.test.ts`, `training-days-rules.test.ts`, `training-calendar-rules.test.ts`, `period-compare-rules.test.ts`, `stats-cache.test.ts`, the title in `route-title-rules.test.ts`.
- RPC: `supabase/tests/34_training_days.test.sql` (pgTAP) and `tests/integration/training-days.test.ts` (numbers through finish, edit and delete).
- E2E (stack): `e2e/stats.spec.ts` (opens from Collection, title, focus, back link, axe; a workout lights today, month compare, month buttons, the saved copy offline), `e2e/a11y.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
