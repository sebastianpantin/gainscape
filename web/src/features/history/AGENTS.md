# History Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

Past workouts under the Collection tab: a paged session list (`/collection/history`) and a detail screen (`/collection/history/:sessionId`) where a recent session can be edited or deleted. Edits go to the server, which recomputes XP, records and loot.

## Map

- `HistoryScreen.tsx`: the paged list.
- `SessionDetailScreen.tsx`: state and rendering only; `load-session.ts` loads the session, `SessionHeader.tsx` and `StoredExerciseList.tsx` render the read-only parts.
- `session-edit.ts`: the pure edit model. Every new edit rule goes here as a pure function.
- `session-editor.ts`: `createSessionEditor(ports)`, the save and delete flow with every I/O injected. Every save or delete outcome goes here.
- `HistorySetRow.tsx`: editable set, bout and hold rows reusing the workout field components.
- Fetches and mutations live in `../../lib/history/history.ts`, row mapping in `../../lib/history/history-rules.ts`, set and exercise editing shared with the live draft in `../../lib/workout/exercise-edit-rules.ts`.

## Rules and gotchas

- Editability uses `isSessionEditable` from `@domain/edit-window.ts`, the same rule the `edit-session` and `delete-session` functions apply.
- Both screens fail fast offline (`Offline: connect to load this screen.`); edits need the server.
- The detail screen reads the exercise catalog through `exerciseListLoadQuery` and accepts its saved copy without a notice, like the program editor: names and load types only seed the edit, and every save re-checks load types against the live catalog (`latestExercises` falls back to the loaded list only when that live fetch fails).
- The list uses `useInfiniteQuery(historyQuery(userId))`, so loaded pages and scroll survive Back from a workout. Loading more waits while any fetch runs so it never cancels a refresh. The detail screen drops a deleted workout from the cached pages. After a failed page load only the `Load more` button retries. List items keep normal rendering, not `content-visibility: auto`: Back rebuilds the list, so its estimated item heights would move the restored scroll position off the workout.
- Save: an accepted save makes the sent sets the new original at the new revision before the refresh, so a failed refresh keeps Save disabled and Undo cannot write old values back. Per-set XP labels compare against `xpBasis`, the sets the stored XP belongs to.
- The `Workout XP` total includes the gear bonus; per-set labels show `xp_awarded`, the base XP.
- Delete sends the loaded revision as `ifRevision`; on `revision_conflict` it loads the latest version and asks again. A concurrent edit is rebased (`rebaseEdit`) with a notice.
- `set_id_conflict`: give the clashing sets new ids and resend, at most twice. `bodyweight_load_not_zero`: reset bodyweight loads from the latest exercises. Nothing changes once the abort signal fires.
- `summariesToForget` includes any remembered summary when a save was retried, because a retry after a lost reply gets the no-op answer with empty `replayedSessionIds` and `revokedDrops`. Deleting or syncing must call `forgetLastSummary` so the reveal never shows a removed session.
- In edit mode a lift's `Progress` link hides while there are unsaved changes, so leaving cannot drop edits.
- The edit model reuses the draft's shapes from `exercise-edit-rules.ts`: sets are `LiftSet`, `BoutSet` and `HoldSet`, lifts and holds are `LiftExerciseOf`/`HoldExerciseOf`, and adding a set or exercise and swapping loads go through `addSetTo`, `addExerciseTo` and `swapLoadedExercise`. Only the deliberate differences stay local: draft sets add `done` and program fields and draft exercises a `clientId`, because a draft is unsaved local state; an edit holds stored rows by their server ids under a `revision`; a cardio edit keeps only `paceUnit` and `tracksDistance`, because stored rows carry no activity. A draft swap always resets loads (no set is done yet), an edit swap keeps them for the same load type.
- Limits match the live draft: `canAddSetTo` caps sets and 4 hours of bouts; the picker then stops offering cardio.
- Swaps stay within one kind; a hold only swaps for a hold of the same measure. Swapping bouts onto an activity without distance tracking clears their distances. A row with `durationS` is a bout; a row with a weight and no reps or counted work is a hold.
- Warm-up rows are muted (`warmup` class) in both the read-only list and the edit rows, and always keep a non-colour cue: the ` · warm-up` text in the read-only list and the pressed `Warm-up set N` toggle (visible text `Warm-up`) when editing.
- Removing a set that is saved on the server asks first in a `ConfirmDialog` (`removingSetAsksFirst`); a set added in this edit goes straight away, since nothing is lost until Save and Undo my changes still restores it.
- An edit never changes the session length or RPE.
- Handle failures through `failureAction` and `failureText`, not ad hoc branches. New set ids come from `withNewSetIds`.

## Testing

- Unit (`make test-web`): `tests/web/session-edit.test.ts` is the place for the first failing test; `session-editor.test.ts` for the save and delete flow (fake ports); `history-rules.test.ts`, `history-overview-rules.test.ts`.
- Integration (stack): `tests/integration/history-paging.test.ts`, `edit-session.test.ts`, `delete-session.test.ts`.
- E2E (stack): `e2e/history.spec.ts` (edits, Back keeping 55 loaded workouts and scroll, conflicts, deletes elsewhere, a save whose refresh fails), `e2e/a11y.spec.ts`.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
