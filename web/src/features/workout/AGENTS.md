# Workout Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The Train tab at `/`. It logs a workout as an offline-first draft (`../../offline/`) and previews XP and records per set locally. On Finish it sends the draft to `complete-session` with retries, then navigates to `/reveal`. History, programs and collection reuse its widgets: set rows, the effort selector, the exercise picker and the bodyweight prompt.

## Map

- Entry point: `WorkoutScreen.tsx`. It composes: it calls the hooks, builds the `LiftCardContext` and renders `TodayView` (no draft), `SavingWorkoutView` (finished or syncing), `LiftExerciseCard`, `LiftSupersetCard`, `CardioExerciseCard`, `HoldExerciseCard` and `ChallengeBanner`. Each data effect and each group of commands lives in its own `use-*.ts` hook, called in a fixed order before the loading early return, so the hooks take a nullable draft.
- Commands: `use-workout-commands.ts` and `use-finish-workout.ts`; `use-workout-previews.ts` builds the XP and record previews and set feedback. Per-workout state goes through `useSessionState`, which resets when `sessionId` changes.
- Lift cards: `LiftExerciseCard.tsx` (one lift), `LiftSupersetCard.tsx` (a group, around `SupersetCard`), both built from `LiftExerciseIntro.tsx` and `LiftSetRow.tsx`. They read everything from one `LiftCardContext` prop (`lift-card-context.ts`), as the cardio and hold cards read `ExerciseCardActions`.
- Pure rules: `*-rules.ts`, `workout-help.ts`, `xp-preview.ts` and `record-preview.ts`, each tested in `tests/web/<name>.test.ts`. `workout-rules.ts` holds the finish and saving text, counts and steps.
- Hooks are `use-*.ts`. `use-finish-sync.ts` is a thin adapter over `offline/finish-retries.ts` and `finish-lock.ts`.
- Rows: `SetRow.tsx` (lifts), `HoldSetRow.tsx`, `CardioSetRow.tsx` with `BoutFields.tsx`; history reuses their field exports. `SupersetCard.tsx` is presentational (the screen passes `renderCell`).
- `ActiveWorkoutBar.tsx` is mounted by `App.tsx` on every route except `/` and `/reveal`.
- `WorkoutClock.tsx` (the elapsed time in `.finish-bar`) ticks itself once a second so the screen does not re-render; its `timer` name changes once a minute and nothing announces the ticks.

## Rules and gotchas

- Draft shape and mutations belong to `../../offline/` (`draft-format.ts`, `draft-edits.ts`, `draft-starts.ts`) and `draft-session.ts`. Never mutate a draft in a component; call the functions from `useWorkoutDraft`. Retry, lock and sync logic stays in `../../offline/`. A finished draft must never be lost or sent twice.
- The XP preview is only a hint. `xp-preview.ts` runs the domain `processSession` with the server's inputs: `exercise_strength_state` as of the draft start, and the profile bodyweight. That keeps the cold-start cap, fatigue check, cardio caps and bonuses at parity. Keep the rules in the domain. `tests/web/xp-preview.test.ts` has a parity test.
- In the preview, only `unknown` shows `~?` and adds nothing to the total. `cold_start` and `unrated` show flat XP, and warm-ups show 0 XP.
- Hold record previews match the server through the domain `applyHoldToRecords`: a 20 kg floor for an external load, gains of 1 s or 1 m, and nothing in a hold's first session.
- Cards are keyed by the draft exercise's stable `clientId`, and so is the open Swap picker. Removing an identical exercise then leaves the others in place.
- The Swap picker lists up to 6 similar lifts until the user types (`similarExercises`): a shared top skill only (ties count), lifts that share a name word other than a setup word such as `barbell` or `seated` first, then by skill-share overlap. There is no movement-pattern field, so the name stands in for one.
- A replaced draft does not remount the screen. All per-workout state therefore resets when `sessionId` changes (`useSessionState`): the finish problem, Swap picker, focus, discard and remove confirms, strength views and the `useRecentLiftSessions` scope.
- Finish waits `FINISH_WINDOW_MS` after the persisted `finishedAt` before the first send (`finishSyncDelayMs`), so tabs and reloads agree and a close in the wait syncs on the next open. Only during the wait the saving view offers Save now and Keep training (a reopen). Back to editing stays `stalled`-only: in `syncing` a send may be in flight and a reopen would race the commit. Only DEV builds honour the `gainscape.finish-window-ms` override (e2e: 0).
- `finishDraft` runs inside `updateDraft`. It leaves another session or an already finished draft alone. When a load type changed, it returns the draft unfinished with `changedNames`.
- `setFeedback` passes `preview`, `record` and `becameRecord` as thunks, so typing into a set costs no preview work. Feedback fires only on the not-done to done transition, except a set that becomes a record (`becomesRecord`), which plays `RECORD_CELEBRATION` through `celebrate` (the device cues) in place of the plain buzz, also when a done set is edited into one. Add set and a picked exercise create sets that are not done yet, prefilled from the last set or the last session, so the lifter logs each one with Done and gets its drop and rest, like a program set; Finish counts them as sets not ticked, names the rated ones apart (a rating means it was lifted), and Mark done and finish also logs a rated 5RM test or optional set. The `role="status"` text is keyed by the drop count, so re-logging the same set announces again.
- `workoutHelpKeys` reads only session-stable inputs, never set efforts, done flags, values or previews, so logging never adds or removes the help row. A fast-check property enforces this.
- Back-off chip (`lib/workout/backoff-rules.ts`): the heaviest done, rated working set (ties: latest) gives `e1RM × chart % at RPE − 1`, rounded down to the unit step, on the first not-done working row after it, in place of the Last chip, hidden once the row already holds that weight and reps; fills weight and the top set's reps. Off on any set with a program prescription (the program owns loads), off the RPE chart (reps 1–6) and unless the logged top set is RPE 8–10 (RPE − 1 must stay on the chart, 7–10), and for non-external loads.
- `lastSetForRow` gives warm-up rows no last value, because `recent_lift_sets` returns working sets only. Done rows never offer the "Last" fill, so one tap cannot overwrite a logged set.
- Adding an exercise never waits for last-session values. Known values seed the first set. Otherwise `seedUntouchedSet` fills it later, only if it is still untouched.
- In a superset, the rest timer starts only after the round's last exercise (`restsAfter`). Done moves focus to the next exercise in the round.
- Rest timer:
  - State lives in `../../lib/workout/rest-timer-store.ts`. Re-read it before every write; tabs follow it through the `storage` event.
  - `RestTimerBar` ticks itself every 250 ms so the screen does not re-render.
  - It stays one mounted `section` so focus survives adjusting and the rest running out.
  - Skip and Dismiss focus the next unticked Done (after the last ticked, else from the top), else Finish, else `.finish-bar` (`tabIndex={-1}`).
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
  - The five effort levels are a wrapping flex row of 44 px minimum buttons: one line on a stepped lift row from 360 px (its menu sits on the info line so effort gets the full width); at 320 px, and on hold rows that share their line with the menu, the last levels wrap.
  - The effort selector is always the last line of a row. A second tap keeps the effort; the set menu clears it (history rows still clear on a second tap). Picking an effort only rates the set: only the Done toggle completes it, and only completing a working set starts the rest (`startsRest`), so rating before or after Done never restarts it.
  - The `~ and new records are previews` note sits below `.finish-bar`, so it never adds sticky height.
  - The clock and sets done live in `.finish-bar`, not a sticky header: one bottom bar, no top chrome for the keyboard or iOS sticky quirks to fight, one `timer`. `useFinishBarClearance` publishes the bar's height as `--finish-bar-height` for `scroll-padding-bottom`. WebKit ignores that on focus, so the hook scrolls a focused field clear on `focusin` (`scrollToClearFinishBar`, `e2e/set-fields.spec.ts` on WebKit). Done scrolls its row clear, two frames later as the rest timer grows the bar, so rating effort needs no scroll.
  - `ActiveWorkoutBar` is one `--tap-target` tall and never wraps. Screens get extra bottom padding while it shows.
- The number fields (`NumberTextField`, `BoutFields`) keep the typed text while focused, accept a decimal comma, and commit clamped values. Weights are bounded by the domain `MAX_SET_LOAD_KG`.
- Warm-up ramps (`warmupsToOffer`): a barbell lift ramps from the bar on loadable plates; another external lift (dumbbell, machine, cable) ramps 40/60/80% rounded to the unit's load step, with no bar step; bodyweight and `bodyweight_plus` lifts get one set at the working weight. Any ramp that comes out empty falls back to that single set (deliberate since `9febb3f`).
- Warm-up routines (`../../lib/workout/warmup-routine-rules.ts`, by catalog key) exist for Back Squat, Deadlift, Bench Press and Overhead Press. For those, `+ Add warm-ups` opens `WarmupChoiceDialog` (Ramp sets, the routine, Both); a single remaining choice applies in one tap. The routine inserts its mobility drills as cardio cards right above the lift, one 60 s bout each, not done, so they earn Mobility XP through the normal cardio path. Focus then moves to the first drill's first bout, or back to the warm-up button after Ramp sets (the closed dialog does not restore it). The routine is not offered while any of its drills sits in the run of cardio cards right above the lift, or when they would pass the set or 4-hour bout cap. Drill keys must stay mobility-only cardio with `distance: false` (`tests/catalog/warmup-routines.test.ts`).
- Remove set never asks; its toast offers Undo instead (`restoreRemovedSet`), which finds the card by `clientId` so moved cards still get the set back, and does nothing once the workout finished or is full.
- `Remove exercise` asks first (`removingAsksFirst`) when a set is logged or planned, or sets were added past the starting one, so tidying an unused card stays one tap. Edits to the starting set's values do not count: the draft keeps no baseline to compare with.
- Holds take no superset, warm-ups, quick fill or swap. Cardio cards keep a plain `Remove` instead of `ExerciseMenu`.
- At the set limit (`MAX_SETS_PER_SESSION`), or at 4 hours of bouts, the add buttons are disabled and the picker stops offering what will not fit. History edit behaves the same way.
- Train home order (checked at 360x780, `e2e/train-home.spec.ts`): header, notices, `ThisWeekCard`, the program summary and today's prescription, then `Start workout`, then the Follow a program card and program days, the progress and highlight cards, lift goals and friends. Start stays in the first screen for a lifter without a program; a program follower starts from the prescription above it. While the program offers a day (`offersProgramDay`), its start is the only primary and `Start workout` is a default button (one primary per screen). Keep new cards below Start.
- `ThisWeekCard` is the only streak: the weekly goal's (weeks in a row that met the goal). `TodayView` reads `trainingDaysQuery` once for the strip and the highlights: this month in the profile time zone (the RPC range includes the month before, so a week that starts there is whole), cache-first. While it loads, the card keeps an `aria-hidden` letter strip so nothing below shifts. Decisions live in `thisWeekView`.
- `HighlightsCard` rows each hide without data, and the card with them, so a new account never sees it. Last workout: those training days, or `lastWorkoutDateQuery` (one `sessions` row) only when they hold none. Latest record: the first `recordTimelineQuery` page; the exercise list loads only once it holds a record. Rarest drop: the `rarest_recent_drop` RPC ranks the last 30 days on the server; online only.
- The stat row under the title holds `LevelStat` and `DotsStat`, label above value (beside the title it wrapped at 360 px). DOTS reads as a level, so it sits there as a whole number, not in Highlights, hidden until ready. The collection (a network fetch online) loads only once the profile holds a sex and a bodyweight.
- `TrainingHero` (`Your progress`) hides when none of its parts has data, so a new account sees no empty card. `useCompanionPet` uses `ownedPetsQuery`, not `itemsQuery`, so Items and the reveal keep their own cache. Pet mood (`pet-mood-rules.ts`): profile-timezone calendar days since the last workout, from the training days or `lastWorkoutDateQuery` (online only); null until known, so `sleepy` never flashes.
- `streakRiskText` compares the server's `weekStart` with the profile-timezone day from `TodayView`, never the device day; it returns null when that day is outside the week.
- The picker gets only active exercises (`exercisePickerList`), but `exerciseListLoadQuery` saves the archived ones too, because Custom exercises, the program editor and reveal need them offline.
- `Create custom exercise` (`/exercises?new=1&from=workout`) returns to `/` with `addExerciseId` in route state; the screen adds it once the list holds it.
- `Discard workout` is left out on a challenge draft, whose banner has its own discard. Discarding a challenge keeps the scroll.
- `BodyweightPrompt` answers save through `../profile/save-bodyweight.ts`, the same path as session detail.

## Testing

- Unit (`make test-web`): `tests/web/<module>.test.ts` for each rules file here and in `../../lib/workout/`; the offline draft and finish tests are listed in `../../offline/AGENTS.md`. Domain math: `tests/domain/`.
- E2E (`make e2e`): `drafts`, `multi-tab`, `workout-chrome` (360 px chrome), `rest-timer`, `set-menu`, `set-fields`, `a11y`, and the other workout flow specs; `e2e/pwa/offline.spec.ts` (`make e2e-pwa`).

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
