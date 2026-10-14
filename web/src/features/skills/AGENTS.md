# Skills Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-14

## Purpose

The Skills tab (`/skills`): every skill's level, XP and progress, total level, the exercises that train a picked skill, the Recovery panel (a body map of recent hard sets), the weekly sets per muscle panel, and the link to the quest board (`../quests/`, `/skills/quests`).

## Map

- `SkillsScreen.tsx`: standing from `useStanding(userId)` (`../../lib/progress/standing.ts`), exercises from `../../lib/progress/skill-map.ts`.
- `RecoveryPanel.tsx`: rules in `../../lib/progress/recovery-rules.ts`, drawn with `components/BodyMap.tsx`.
- `WeeklyVolumePanel.tsx`: rules in `../../lib/progress/weekly-volume-rules.ts`; it reuses `recentSetsQuery`, so it refreshes with Recovery.

## Rules and gotchas

- Level math comes from the domain (`xpForLevel`, `MAX_LEVEL`); never re-derive thresholds here.
- A skill with `combat_weight` 0 reads "does not count toward combat".
- Offline, the saved standing shows at once with its notice.
- The picked skill's panel keeps `aria-live` on the XP lines only, not on the exercise list.
- Recovery computes at the later of mount time and the recent sets' `dataUpdatedAt`. It renders nothing while loading and needs a connection. The body map's colour is the only state cue in the figure, so the legend must list skill names.
- Recovery here (recent days) is separate from the server's in-session fatigue check.
- Weekly volume:
  - "This week" is sessions with `local_date` on or after the Monday of the profile time zone (`weekStartIn`), the same week as `weekly_goal_weeks()`. It cannot read the weekly goal's `weekStart`, because that RPC returns no rows for a user who never set a goal.
  - Every working lift or hold set counts, whatever its effort, and adds `share / 10000` to each body skill it trains, so one bench set is 0.7 chest. Sums run in basis points, so totals are exact. Cardio trains no body skill and adds nothing.
  - The band (10 to 20 sets) is shown in words as well as on the bar. Each row's visible text is its accessible name (WCAG 2.5.3), so it starts with the muscle, like the skill cards. e2e specs therefore find skill cards inside the `Skill levels` list (`skillCard` in `e2e/support/app.ts`), never with a page-wide `/^Chest\b/`.
  - The contribution list is always rendered (toggled with `hidden`), so the row's `aria-controls` always points at an element.

## Testing

- Unit: `tests/web/recovery-rules.test.ts`, `tests/web/weekly-volume-rules.test.ts`; level thresholds in `tests/domain/`; sprites in `tests/web/pixel-sprites.test.ts`.
- E2E (stack): `e2e/a11y.spec.ts` (pixel art for every skill, axe), `e2e/recovery-and-companion.spec.ts`, `e2e/weekly-volume.spec.ts`; integration `tests/integration/recent-sets.test.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
