# Skills Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-14

## Purpose

The Skills tab (`/skills`) and its subpages. The tab itself stays short: totals, links to the quest board (`../quests/`, `/skills/quests`) and the Body page with a one-line summary, and the skill grid. Each skill card links to its skill page (`/skills/:skillKey`): level, XP, combat weight, then, for a body skill, its recovery and this week's sets, then the exercises that train it. The Body page (`/skills/body`) holds the Recovery body map and the weekly sets per muscle.

## Map

- `SkillsScreen.tsx`: standing from `useStanding(userId)`; the Body summary from `../../lib/progress/body-summary-rules.ts`.
- `SkillScreen.tsx`: one skill; exercises from `../../lib/progress/skill-map.ts`; `MuscleStatus.tsx` for body skills.
- `BodyScreen.tsx`: `RecoveryPanel.tsx` (rules in `recovery-rules.ts`, drawn with `components/BodyMap.tsx`) and `WeeklyVolumePanel.tsx` (rules in `weekly-volume-rules.ts`).
- `body-status.ts`: `useBodyStatus`, the one place that loads recent sets, exercises and profile for the summary, the skill page and the Body page; the states and failure sentences come from the pure `bodyStatusFrom` in `../../lib/progress/body-status-rules.ts`. `VolumeBar.tsx` and `VolumeContributionList.tsx` are shared by the Body page rows and the skill page. `StatusSection.tsx` is the one loading and failure scaffold for Recovery and Sets this week on both pages, so they show the same `problem`: `RECENT_SETS_FAILED_TEXT` when recent sets or exercises fail (it wins over a profile failure), `PROFILE_FAILED_TEXT` on Sets this week when only the profile fails.

## Rules and gotchas

- Level math comes from the domain (`xpForLevel`, `MAX_LEVEL`); never re-derive thresholds here.
- A skill with `combat_weight` 0 reads "Does not count toward combat".
- Offline, the saved standing shows at once with its notice. Recovery and weekly sets need a connection and say so.
- `/skills/quests` and `/skills/body` are static routes, so React Router ranks them above `/skills/:skillKey`; `route-title-rules.ts` also matches fixed patterns first. A key that is no skill renders "Skill not found" with a link back.
- The skill page reads exercises through `useSkillMapExercises`, which shares `exerciseListQuery`'s key with `useBodyStatus`, so a body skill page loads the list once. `exerciseListLoadQuery` (which `exerciseListQuery` selects from) seeds from the device's exercise cache (`skillExercisesSeed`, stale at once), so every consumer, Program plan included, starts from the same offline copy; `exercisesTrainingSkill` drops archived ones.
- Only body skills (`isBodySkill`) get recovery and weekly sets; cardio skills train no muscle. `MuscleStatus` owns the `useBodyStatus` call, so a cardio page fetches no recent sets.
- The Body summary uses the Recovery legend's groups: "n recovering" when any muscle is recovering, else "n almost fresh", else "all fresh"; and every muscle below the band as under target. The skill page's "Fresh in 14h" covers both recovering and almost fresh. Until either half loads the link reads just "Body". Its `aria-label` (`Body, <summary>`) supplies the pause; a visually hidden comma inside the flex label comes out as `Body ,`.
- Recovery computes at the later of mount time and the recent sets' `dataUpdatedAt`. The panels render nothing while loading. The body map's colour is the only state cue in the figure, so the legend must list skill names.
- Recovery here (recent days) is separate from the server's in-session fatigue check.
- Weekly volume:
  - "This week" is sessions with `local_date` on or after the Monday of the profile time zone (`weekStartIn`), the same week as `weekly_goal_weeks()`. It cannot read the weekly goal's `weekStart`, because that RPC returns no rows for a user who never set a goal.
  - Every working lift or hold set counts, whatever its effort, and adds `share / 10000` to each body skill it trains, so one bench set is 0.7 chest. Sums run in basis points, so totals are exact. Cardio trains no body skill and adds nothing.
  - The band (10 to 20 sets) is shown in words as well as on the bar. Each row's visible text is its accessible name (WCAG 2.5.3), so it starts with the muscle, like the skill cards. e2e specs therefore find skill cards inside the `Skill levels` list (`skillCard` in `e2e/support/app.ts`), never with a page-wide `/^Chest\b/`.
  - A row's details (contributions and the link to the skill page) are always rendered (toggled with `hidden`), so the row's `aria-controls` always points at an element. The open row lives in `?open=<muscle>` (replace navigation), so Back from a skill page reopens it.

## Testing

- Unit: `tests/web/recovery-rules.test.ts`, `tests/web/weekly-volume-rules.test.ts`, `tests/web/body-summary-rules.test.ts`, `tests/web/body-status-rules.test.ts`, the exercise list seed in `tests/web/queries.test.ts`, titles in `tests/web/route-title-rules.test.ts`; level thresholds in `tests/domain/`; sprites in `tests/web/pixel-sprites.test.ts`.
- E2E (stack): `e2e/skill-pages.spec.ts` (skill pages, Body link and summary, unknown key), `e2e/recovery-and-companion.spec.ts`, `e2e/weekly-volume.spec.ts`, `e2e/a11y.spec.ts` (pixel art, axe on both new pages), `e2e/pwa/offline.spec.ts` (skill page exercises offline); integration `tests/integration/recent-sets.test.ts`. Use `openSkill` and `openBody` from `e2e/support/app.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
