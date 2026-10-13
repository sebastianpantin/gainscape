# Programs Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Training programs: list, copy from templates, create and edit own programs (days of planned exercises and sets). A program day starts from the Train tab (`workout/ProgramDayStarts.tsx`). Powerlifting programs (Madcow, 5/3/1, ...) and published own programs are followed through an enrollment: an enroll form generated from the template definition, a manage screen for training weights, and a plan screen; today's prescribed workout is on the Train tab (`workout/ProgramToday.tsx`).

## Map

- Routes: `ProgramsScreen.tsx` (`/programs`, with `PowerliftingPrograms.tsx`), `ProgramEditor.tsx` (`/programs/:programId` and `/programs/new`), `ProgramEnrollScreen.tsx` (`/programs/enroll/:key`), `ActiveProgramScreen.tsx` (`/programs/active`), `ProgramPlanScreen.tsx` (`/programs/active/plan`). `ProgramStatusScreen.tsx` stands in when there is no ready program.
- `program-edit.ts`: pure editor logic (day and exercise edits, limits, validation, progression and increments). Put new editor rules here and test them first.
- `use-active-program.ts`: the followed program from the saved cache; shared with `workout/WorkoutScreen.tsx`.
- Enrollment and prescription rules live in `../../lib/program-*-rules.ts`; persistence in `../../lib/programs.ts`.

## Rules and gotchas

- `PlannedExercise` is defined in `../../offline/draft-format.ts` and is what a started day copies into the draft. Its `progression` is not copied, so adding it needed no draft format bump; changing what the draft stores needs the draft versioning and `tests/web/draft-format.test.ts` updated.
- Only rep lifts are plannable (`isPlannableExercise`): `save_program` plans sets of reps and refuses holds and cardio.
- Following an own program publishes a snapshot first (`publishForEnroll`), then drops the cached `enrollChoicesQuery` so the enroll screen loads the new version. Publishing and enrolling need a connection and are disabled offline.
- Editing a followed program shows `You're following an earlier version`. The `followStatus` check passes `null` until the exercise list has loaded (status `undecided`, notice hidden), and uses `loadTypeOf` over the whole exercise list, holds included, so a legacy hold slot clamps like the server. "Use these changes" saves, publishes and opens the enroll form with router state `{ carried }` (unit and current working weights), which then re-follows the same template without the replace dialog.
- Deleting a followed program stops following it and forgets the cached enrollment; the confirm dialog says so.
- Increments are stored in both units: presets pair 1.25 kg/2.5 lb, 2.5/5, 5/10; a custom value converts to the nearest 0.25 kg or 0.5 lb within 0.25-20 kg / 0.5-45 lb. These bounds match the database checks.
- Validation order before save: `nameIssue`, `exerciseIssue`, `targetIssue`, `progressionIssue`. A Save or Use these changes problem clears on the next edit; a load problem stays.
- `addDay` names the new day `Day <n>` from the day count plus one, skipping taken names, so removing `Day 1` then adding gives `Day 4`, not a second `Day 3`.
- Offline: the program list, templates and exercise list open from saved copies (`../../offline/program-list-cache.ts` and the template caches). `useActiveProgram` skips its refresh offline and uses `offlineRefreshState`, so a user whose cache was refreshed online with no enrollment sees `You're not following a program.`
- The enroll form lists templates compiled from your own programs via `templateEntry` (so `custom_` keys load) but hides them from the Powerlifting list, and shows no Exercises section for them. A template the app cannot run shows "Update the app to use this program" with no link.
- `ActiveProgramScreen` sends one `adjust_enrollment` `set_reference` per changed field and needs a connection.

## Testing

- Unit (`make test-web`): `tests/web/program-edit.test.ts`, the `program-*-rules.test.ts` files for the lib rules, `names.test.ts`, `draft-format.test.ts`, `reorder.test.ts`, `term-help-rules.test.ts`.
- Integration (stack): `tests/integration/programs.test.ts` and the enrollment tests.
- E2E (stack): `programs.spec.ts`, `program-enrollment.spec.ts`, `term-help.spec.ts`, `a11y.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
