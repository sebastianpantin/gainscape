# Stats Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-20 · **Updated:** 2026-10-20

## Purpose

The Stats screen at `/collection/stats`, linked from the Collection Records tab: every long-range analytics view (training calendar, month compare, volume history, relative strength, PR timeline, loot stats) lives here, on one screen, instead of a sixth bottom tab.

## Map

- `StatsScreen.tsx`: the screen, with a `‹ Collection` back link like the other sub-screens.
- Training calendar and month compare: `TrainingCalendarTable.tsx` and `MonthCompareTable.tsx` over `../../lib/stats/training-calendar-rules.ts` and `period-compare-rules.ts`. Both read `trainingDaysQuery(userId, month)`, one `training_days` RPC call (migration 059) for the shown month and the month before (`trainingDaysRange`).
- Volume history: `VolumeHistorySection.tsx` over `../../lib/stats/volume-history-rules.ts`. It reads `weeklyExerciseSetsQuery(userId)`, the `weekly_exercise_sets(weeks)` RPC (migration 060, working sets per exercise per Monday week, weeks clamped to 1..52), and the exercise list for skill shares.
- Charts: `../../components/BarChart.tsx` and `LineChart.tsx`, over `../../lib/ui/bar-chart-rules.ts` and `line-chart-rules.ts`. Week (Monday first) and month keys: `../../lib/ui/date-bucket-rules.ts`.

## Rules and gotchas

- Keep the screen thin: each section's decisions go in a pure `lib/**/*-rules.ts` with a unit test.
- Read history through aggregate RPCs that return one jsonb, never by paging the History list client-side (it embeds every set and pages in 50s).
- Every Stats query loads through `loadStatCacheFirst` (`../../offline/stats-cache.ts`), so the last answer shows offline with `OFFLINE_STATS_NOTICE`. Its root goes in `workout-changed` and `account-reset` in `query-freshness-rules.ts`.
- History-only workouts light their day (heat 1 at least) and count as workouts and volume, but add 0 XP. Heat is relative to the best day of the shown month, in four steps.
- Days are a plain `table` (caption = month title); each cell's name is a visually hidden label, today has `aria-current="date"`. Next month is disabled at the current month.
- Volume history counts sets exactly like the Body screen's weekly sets (`muscleVolumeFromExerciseSets`): every non-warm-up set, history-only workouts included, split by skill share. The RPC's current week follows the profile time zone, so its root is also in `timezone-changed`. Muscles are ordered by sets over the 12 weeks, the most trained first and shown by default.
- Sums stay in kg; convert only for display with `../../lib/units.ts`.
- A sub-route (for example a full list) is declared before any `:param` route under `/collection` and added to `SCREEN_TITLES`.

## Testing

- Unit: `tests/web/date-bucket-rules.test.ts`, `bar-chart-rules.test.ts`, `training-days-rules.test.ts`, `training-calendar-rules.test.ts`, `period-compare-rules.test.ts`, `volume-history-rules.test.ts`, `stats-cache.test.ts`, the title in `route-title-rules.test.ts`.
- RPC: `supabase/tests/34_training_days.test.sql` and `35_weekly_exercise_sets.test.sql` (pgTAP), `tests/integration/training-days.test.ts` and `weekly-exercise-sets.test.ts` (numbers through finish, edit and delete).
- E2E (stack): `e2e/stats.spec.ts` (opens from Collection, title, focus, back link, axe; a workout lights today, month compare, month buttons, the saved copy offline; volume history for the trained muscle and the muscle picker), `e2e/a11y.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
