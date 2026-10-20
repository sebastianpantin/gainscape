# Workout Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The Train tab at `/`. It logs a workout as an offline-first draft (`../../offline/`) and previews XP and records per set locally. On Finish it sends the draft to `complete-session` with retries, then navigates to `/reveal`. History, programs and collection reuse its widgets: set rows, the effort selector, the exercise picker and the bodyweight prompt.

## Map

- Entry point: `WorkoutScreen.tsx`. It composes: it calls the hooks, builds the `LiftCardContext` and renders `TodayView` (no draft), `SavingWorkoutView` (finished or syncing), `LiftExerciseCard`, `LiftSupersetCard`, `CardioExerciseCard`, `HoldExerciseCard` and `ChallengeBanner`. Each data effect and each group of commands lives in its own `use-*.ts` hook, called in a fixed order before the loading early return, so the hooks take a nullable draft.
- Commands: `use-workout-commands.ts` (add, remove, swap, superset menu, set changes with feedback, discard) and `use-finish-workout.ts` (load type check, the planned-sets prompt, finish). `use-workout-previews.ts` holds the XP and record previews and builds set feedback. Per-workout state goes through `useSessionState`, which resets when `sessionId` changes.
- Lift cards: `LiftExerciseCard.tsx` (one lift), `LiftSupersetCard.tsx` (a group, around `SupersetCard`), both built from `LiftExerciseIntro.tsx` and `LiftSetRow.tsx`. They read everything from one `LiftCardContext` prop (`lift-card-context.ts`), as the cardio and hold cards read `ExerciseCardActions`.
- Pure rules, each tested in `tests/web/<name>.test.ts`:
  - Finish text, counts and steps: `workout-rules.ts`.
  - Screen decisions (picked exercise, swap list, add-button focus key, superset members): `workout-screen-rules.ts`.
  - Lift card decisions (menu, advice, warm-ups, when rest starts): `exercise-card-rules.ts`.
  - Today nudges: `today-rules.ts`.
  - This week strip: `week-strip-rules.ts`.
  - Highlights: `highlight-rules.ts`.
  - Last-session chips: `last-set-rules.ts`.
  - Per-set feedback: `set-feedback-rules.ts`.
  - Set menu: `set-menu-rules.ts`.
  - Help row keys: `workout-help.ts`.
  - XP preview: `xp-preview.ts`.
  - Record preview: `record-preview.ts`.
- Hooks:
  - `use-finish-sync.ts`: a thin adapter over `offline/finish-retries.ts` and `finish-lock.ts`.
  - `use-rest-timer.ts` with `RestTimerBar.tsx` and `NotifyPrompt.tsx`.
  - `use-rest-alert.ts` with `rest-alert-effects.ts`.
  - `use-wake-lock.ts` and `use-recent-lift-sessions.ts`.
- Row components:
  - `SetRow.tsx` for lifts. It exports `WeightField`/`RepsField`, which history reuses.
  - `HoldSetRow.tsx` for holds. It exports `HoldFields`, which history reuses.
  - `CardioSetRow.tsx` with `BoutFields.tsx` for cardio. History reuses `BoutFields`.
  - `SetMenu.tsx`: the per-row options menu.
  - `SupersetCard.tsx`: presentational; the screen passes `renderCell`.
- `ActiveWorkoutBar.tsx` is mounted by `App.tsx` on every route except `/` and `/reveal`.

## Rules and gotchas

- Draft shape and mutations belong to `../../offline/` (`draft-format.ts`, `draft-edits.ts`, `draft-starts.ts`) and `draft-session.ts`. Never mutate a draft in a component; call the functions from `useWorkoutDraft`. Retry, lock and sync logic stays in `../../offline/`. A finished draft must never be lost or sent twice.
- The XP preview is only a hint. `xp-preview.ts` runs the domain `processSession` with the server's inputs: `exercise_strength_state` as of the draft start, and the profile bodyweight. That keeps the cold-start cap, fatigue check, cardio caps and bonuses at parity. Keep the rules in the domain. `tests/web/xp-preview.test.ts` has a parity test.
- In the preview, only `unknown` shows `~?` and adds nothing to the total. `cold_start` and `unrated` show flat XP, and warm-ups show 0 XP.
- Hold record previews match the server through the domain `applyHoldToRecords`: a 20 kg floor for an external load, gains of 1 s or 1 m, and nothing in a hold's first session.
- Cards are keyed by the draft exercise's stable `clientId`, and so is the open Swap picker. Removing an identical exercise then leaves the others in place.
- The Swap picker lists up to 6 similar lifts until the user types (`similarExercises`): a shared top skill only (ties count), lifts that share a name word other than a setup word such as `barbell` or `seated` first, then by skill-share overlap. There is no movement-pattern field, so the name stands in for one.
- A replaced draft does not remount the screen. All per-workout state therefore resets when `sessionId` changes (`useSessionState`): the finish problem, Swap picker, focus, discard and remove confirms, strength views and the `useRecentLiftSessions` scope.
- `finishDraft` runs inside `updateDraft`. It leaves another session or an already finished draft alone. When a load type changed, it returns the draft unfinished with `changedNames`.
- `setFeedback` passes `preview`, `record` and `becameRecord` as thunks, so typing into a set costs no preview work. Feedback fires only on the not-done to done transition. Add set and a picked exercise create sets that are not done yet, prefilled from the last set or the last session, so the lifter logs each one with Done (or an effort) and gets its drop and rest, like a program set; Finish counts them as sets not ticked. The `role="status"` text is keyed by the drop count, so re-logging the same set announces again.
- `workoutHelpKeys` reads only session-stable inputs, never set efforts, done flags, values or previews, so logging never adds or removes the help row. A fast-check property enforces this.
- `lastSetForRow` gives warm-up rows no last value, because `recent_lift_sets` returns working sets only. Done rows never offer the "Last" fill, so one tap cannot overwrite a logged set.
- Adding an exercise never waits for last-session values. Known values seed the first set. Otherwise `seedUntouchedSet` fills it later, only if it is still untouched.
- In a superset, the rest timer starts only after the round's last exercise (`restsAfter`). Done moves focus to the next exercise in the round.
- Rest timer:
  - State lives in `../../lib/workout/rest-timer-store.ts`. Re-read it before every write; tabs follow it through the `storage` event.
  - `RestTimerBar` ticks itself every 250 ms so the screen does not re-render.
  - It stays one mounted `section` so focus survives adjusting and the rest running out.
  - Skip and Dismiss move focus to Finish, or to `.finish-bar` (`tabIndex={-1}`) while Finish is disabled.
- Rest-end alerts:
  - One alert per rest across tabs and screens: a Web Lock plus `claimRestAlert` on `endsAt`.
  - No alert when the page thaws more than 5 s late.
  - `ActiveWorkoutBar` runs `useRestAlert` and is never mounted together with `WorkoutScreen`, which runs its own.
  - The audio context is primed on rest start (`primeAudio`), because browsers block audio created outside a gesture.
- A finished draft away from `/` shows `Workout not saved yet` in `ActiveWorkoutBar`, because finish sync runs only on `/`.
- `NotifyPrompt` decides once per mount, not on each timer tick. Turn on must call `askToNotify` inside the click handler, which the permission prompt requires.
- `use-wake-lock.ts` requests the lock again when the browser releases it while the page is visible.
- `SetMenu` uses `popover="auto"`. A passive capturing `scroll` listener closes it, because the fixed panel would drift. Without popover support (iOS before 17), `../../styles/workout.css` (`@supports not selector(:popover-open)`) hides the button and shows the actions inline.
- Layout:
  - Live set rows are a compact grid that must fit a 360 px phone. Below 360 px, reps and Done move to a second line and the effort selector takes the full width, so the weight field stays usable at 320 px (`e2e/a11y.spec.ts`).
  - Controls between sets stay 44 px touch targets (`e2e/a11y.spec.ts`).
  - The effort selector is always the last line of a row, because picking an effort also marks the set done.
  - The `~ and new records are previews` note sits below `.finish-bar`, so it never adds sticky height.
  - `ActiveWorkoutBar` is one `--tap-target` tall and never wraps. Screens get extra bottom padding while it shows.
- The number fields (`NumberTextField`, `BoutFields`) keep the typed text while focused, accept a decimal comma, and commit clamped values. Weights are bounded by the domain `MAX_SET_LOAD_KG`.
- Warm-up ramps (`warmupsToOffer`): a barbell lift ramps from the bar on loadable plates; another external lift (dumbbell, machine, cable) ramps 40/60/80% rounded to the unit's load step, with no bar step; bodyweight and `bodyweight_plus` lifts get one set at the working weight. Any ramp that comes out empty falls back to that single set (deliberate since `9febb3f`).
- Remove set never asks; its toast offers Undo instead (`restoreRemovedSet`), which finds the card by `clientId` so moved cards still get the set back, and does nothing once the workout finished or is full.
- `Remove exercise` asks first (`removingAsksFirst`) when a set is logged or planned, or sets were added past the starting one, so tidying an unused card stays one tap. Edits to the starting set's values do not count: the draft keeps no baseline to compare with.
- Holds take no superset, warm-ups, quick fill or swap. Cardio cards keep a plain `Remove` instead of `ExerciseMenu`.
- At the set limit (`MAX_SETS_PER_SESSION`), or at 4 hours of bouts, the add buttons are disabled and the picker stops offering what will not fit. History edit behaves the same way.
- Train home order (checked at 360x780, `e2e/train-home.spec.ts`): header, notices, `ThisWeekCard`, the program summary and today's prescription, then `Start workout`, then program days, the progress and highlight cards, lift goals and friends. Start stays in the first screen for a lifter without a program; a program follower starts from the prescription above it. Keep new cards below Start.
- `ThisWeekCard` is the only streak: the weekly goal's (weeks in a row that met the goal). `TodayView` reads `trainingDaysQuery` once for the strip and the highlights: this month in the profile time zone (the RPC range includes the month before, so a week that starts there is whole), cache-first. While it loads, the card keeps an `aria-hidden` letter strip so nothing below shifts. Decisions live in `thisWeekView`.
- `HighlightsCard` rows each hide without data, and the card with them, so a new account never sees it. Last workout: those training days, or `lastWorkoutDateQuery` (one `sessions` row) only when they hold none. Latest record: the first `recordTimelineQuery` page; the exercise list loads only once it holds a record. Rarest drop: the `rarest_recent_drop` RPC ranks the last 30 days on the server; online only.
- `TrainingHero` (the `Your progress` card) shows the companion pet, the equipped gear (icon = slot sprite in the tier colour, from `loadoutQuery`), an XP bar for the skill nearest its next level and the first quest in progress (`activeQuestLine`). It hides when none of them has data, so a new account does not see an empty card. `useCompanionPet` uses `ownedPetsQuery`, not `itemsQuery`, so Items and the reveal keep their own cache.
- `streakRiskText` compares the server's `weekStart` with the profile-timezone day from `TodayView`, never the device day; it returns null when that day is outside the week.
- The picker gets only active exercises (`exercisePickerList`), but `exerciseListLoadQuery` saves the archived ones too, because the Exercises screen, program editor and reveal need them offline.
- `Discard workout` is left out on a challenge draft, whose banner has its own discard. Discarding a challenge keeps the scroll.
- `BodyweightPrompt` answers save through `../profile/save-bodyweight.ts`, the same path as session detail.

## Testing

- Unit (`make test-web`): `tests/web/<module>.test.ts` for each rules file above. The rules this screen drives are covered in:
  - `superset-rules`, `challenge-rules`, `warmup-rules`, `plate-rules`, `plate-settings-store`.
  - `session-baseline` (the strength and record baseline as of the draft start).
  - `active-workout-bar-rules`, `rest-timer-rules`, `program-today-rules`.
  - The offline draft and finish tests listed in `../../offline/AGENTS.md`.
- The domain math is tested in `tests/domain/`.
- E2E (stack needed, `make e2e`):
  - `drafts`, `multi-tab`, `token-refresh`, `workout-records`, `programs`, `profile` (RPE, pounds), `training-aids`.
  - `train-home`, `loot`, `weekly-goal`, `supersets`, `challenges`, `custom-exercise`, `notify-prompt`, `active-workout-bar`, `a11y`, `term-help`.
  - `e2e/pwa/offline.spec.ts` (`make e2e-pwa`).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
