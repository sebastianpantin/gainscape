# History Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

Past workouts under the Log tab: a paged session list and a detail screen where a recent session can be edited or deleted. Edits are sent to the server, which recomputes XP, records and loot.

## Key Files

| File                      | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `HistoryScreen.tsx`       | Route `/collection/history`. Pages with `fetchSessionPage` and `HISTORY_PAGE_SIZE`; links to details; shows `CollectionTabs`, `formatSessionDate`, `isEditable`, `sessionXp`                                                                                                                                                                                                                                                                                                         |
| `SessionDetailScreen.tsx` | Route `/collection/history/:sessionId`. Largest screen in the app (about 600 lines). Loads session and sets, drives edit mode, save, delete, rebase after a concurrent change, bodyweight prompt, drops-at-risk warning, rate limit handling                                                                                                                                                                                                                                         |
| `session-edit.ts`         | Pure edit model: `SessionEdit`/`EditExercise` (lift with `EditSet`s or cardio with `EditBout`s; a row with `durationS` becomes a bout), `editFromSession`, `editPayload`, `hasChanges`, add/remove/update helpers (`updateEditBout` for bouts), `swapEditExercise` (same kind only), `canAddSet` (cap `MAX_SETS_PER_SESSION`), `dropsAtRisk`, `rebaseEdit`/`rebaseNotice`, `failureAction` (maps `InvokeOutcome` failures), `isEditable` (uses `isWithinEditWindow` from the domain) |
| `HistorySetRow.tsx`       | Editable set row reusing `WeightField`/`RepsField` from `../workout/SetRow.tsx` and `EffortSelector`; `HistoryBoutRow` reuses `BoutFields`, `BoutModeToggle` and `CardioEffortSelector`                                                                                                                                                                                                                                                                                              |

## For AI Agents

### Working In This Directory

- `isEditable` re-exports `isSessionEditable` from `@domain/edit-window.ts`, the same rule the `edit-session` and `delete-session` Edge Functions apply.
- Put every new edit rule in `session-edit.ts` as a pure function. Keep `SessionDetailScreen.tsx` to state and rendering.
- Row mapping and uuid checks are in `../../lib/history-rules.ts`; fetches and mutations (`fetchSession`, `editSession`, `deleteSession`) in `../../lib/history.ts`.
- Deleting or syncing must call `forgetLastSummary` so the reveal does not show a removed session.

### Testing Requirements

- Unit: `tests/web/session-edit.test.ts` (`make test-web`) is the place for the first failing test. `../../lib/history-rules.ts` is imported by `tests/web/session-edit.test.ts` but has no test file of its own; paging is covered by `tests/integration/history-paging.test.ts` (stack needed).
- E2E (stack needed): `e2e/history.spec.ts` (edit a set and see XP change, delete, workout deleted elsewhere, concurrent edit rebase) and `e2e/a11y.spec.ts`. The server side is covered by `tests/integration/edit-session.test.ts` and `delete-session.test.ts`.

### Common Patterns

- Immutable updates returning a new `SessionEdit`; new set ids come from `withNewSetIds`.
- Failure handling goes through `failureAction` rather than ad hoc branches.

## Dependencies

### Internal

- `../../lib/{catalog,format,history,history-rules,item-rules,items,preferences,profile,rate-limit,function-client}.ts`, `../../offline/{draft-format,sync-workout}.ts`, `../workout/*`, `../summary/last-summary.ts`, `../collection/CollectionScreen.tsx`, `@domain/{balance,edit-window,effort,strength,types}.ts`.

### External

- React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
