# History Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Past workouts under the Log tab: a paged session list and a detail screen where a recent session can be edited or deleted. Edits are sent to the server, which recomputes XP, records and loot.

## Key Files

| File                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `HistoryScreen.tsx`       | Route `/collection/history`. Shows `Offline: connect to load this screen.` at once while offline. Pages with `fetchSessionPage` and `HISTORY_PAGE_SIZE`; links to details; shows `CollectionTabs`, `isSessionEditable` from `@domain/edit-window.ts`, and `formatSessionDate`, `formatXp`, `sessionXp` from `../../lib/format.ts`, plus the length and session RPE from `sessionTimingParts` in each row                                                                                                                                                                                                                                                                                                      |
| `SessionDetailScreen.tsx` | Route `/collection/history/:sessionId` (fails fast offline like the list). Largest screen in the app (about 600 lines). Loads session and sets, shows the length and session RPE under the title (`sessionTimingParts`; an edit changes neither), shows `includes Gear bonus +N XP` under the `Workout XP` total when `sessionGearBonus` is above 0 (the total includes the gear bonus, while the per-set XP labels show `xp_awarded`, the base XP), drives edit mode, save, delete (sends the loaded revision as `ifRevision`; on `revision_conflict` it loads the latest version and asks to delete again), rebase after a concurrent change, bodyweight prompt, drops-at-risk warning, rate limit handling |
| `session-edit.ts`         | Pure edit model: `SessionEdit`/`EditExercise` (lift with `EditSet`s or cardio with `EditBout`s; a row with `durationS` becomes a bout), `editFromSession`, `editPayload`, `hasChanges`, add/remove/update helpers (`updateEditBout` for bouts), `swapEditExercise` (same kind only), `canAddSet` (cap `MAX_SETS_PER_SESSION`), `dropsAtRisk`, `rebaseEdit`/`rebaseNotice`, `failureAction` (maps `InvokeOutcome` failures) with `failureText`, `removalText`/`removedText` (collection-removal messages for drops at risk and revoked drops), `sameSetValues`. Effort labels come from `lib/effort-labels.ts`; `sessionXp` and `formatSessionDate` from `lib/format.ts`                                       |
| `HistorySetRow.tsx`       | Editable set row reusing `WeightField`/`RepsField` from `../workout/SetRow.tsx` and `EffortSelector`; `HistoryBoutRow` reuses `BoutFields`, `BoutModeToggle` and `CardioEffortSelector`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## For AI Agents

### Working In This Directory

- `HistoryScreen` and `SessionDetailScreen` import `isSessionEditable` from `@domain/edit-window.ts`, the same rule the `edit-session` and `delete-session` Edge Functions apply.
- Put every new edit rule in `session-edit.ts` as a pure function. Keep `SessionDetailScreen.tsx` to state and rendering.
- Row mapping and uuid checks are in `../../lib/history-rules.ts`; fetches and mutations (`fetchSession`, `editSession`, `deleteSession`) in `../../lib/history.ts`.
- Deleting or syncing must call `forgetLastSummary` so the reveal does not show a removed session.

### Testing Requirements

- Unit: `tests/web/session-edit.test.ts` (`make test-web`) is the place for the first failing test; `tests/web/history-rules.test.ts` covers `invokeWithRetries`, `tests/web/format.test.ts` and `tests/web/effort-labels.test.ts` the moved helpers. Paging is covered by `tests/integration/history-paging.test.ts` (stack needed).
- E2E (stack needed): `e2e/history.spec.ts` (edit a set and see XP change, delete, workout deleted elsewhere, concurrent edit rebase, delete after an edit elsewhere) and `e2e/a11y.spec.ts`. The server side is covered by `tests/integration/edit-session.test.ts` and `delete-session.test.ts`.

### Common Patterns

- Immutable updates returning a new `SessionEdit`; new set ids come from `withNewSetIds`.
- Failure handling goes through `failureAction` and `failureText` rather than ad hoc branches.

## Dependencies

### Internal

- `../../lib/{cardio-rules,catalog,catalog-rules,effort-labels,error-text,format,function-client-rules,history,history-rules,item-rules,items,preferences,profile,rate-limit,units}.ts`, `../../offline/{draft-format,session-payload,sync-workout}.ts`, `../workout/*`, `../summary/last-summary.ts`, `../collection/CollectionScreen.tsx`, `@domain/{balance,edit-window,effort,math,types}.ts`.

### External

- React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
