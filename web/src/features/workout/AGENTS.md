# Workout Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-01

## Purpose

The Train tab at `/`. It logs a workout as an offline-first draft (IndexedDB via `../../offline/`), previews XP per set locally, and on Finish sends the draft to the `complete-session` Edge Function with retries, then navigates to `/reveal` with the returned `SessionSummary`. Its widgets (set rows, effort selector, exercise picker, bodyweight prompt) are reused by history and programs.

## Key Files

| File                          | Description                                                                                                                                                                                                                                                                                                                        |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WorkoutScreen.tsx`           | Route `/`. Composes `useWorkoutDraft(userId)`, cache-first exercise loading (`loadExercisesCacheFirst`), strength views (`fetchExerciseStrength`), `useFinishSync`, program day starts, install card, other-account notice and the bodyweight prompt. Navigates to `/reveal` on sync and links to `/skills` and `/exercises?new=1` |
| `use-finish-sync.ts`          | `useFinishSync` hook: when a draft has `finishedAt`, runs `startFinishRetries` with `attemptFinish` (cross-tab lock) and `syncFinishedWorkout`; reports `onSynced`, `onSuperseded`, `onDeleted`; returns `status` (`FinishStatus`) and `retryNow`                                                                                  |
| `xp-preview.ts`               | Pure XP preview for one draft set: `previewSet` returns `{ xp, basis: 'logged' \| 'estimated' \| 'cold_start' \| 'unknown', rir }` using domain `setXp`, `effectiveReps`, `intensityBonus`, `resolveEffort`, `estimateRir`; also `formatXp` (en-US grouping), used app-wide                                                        |
| `SetRow.tsx`                  | `SetRow` plus exported `WeightField` and `RepsField` (reused by `history/HistorySetRow.tsx`); handles load type, unit conversion, `WEIGHT_INPUT_STEP` and the XP preview chip                                                                                                                                                      |
| `EffortSelector.tsx`          | RIR or RPE picker for a set depending on `EffortInputMode`; produces `EffortInput`                                                                                                                                                                                                                                                 |
| `ExercisePicker.tsx`          | Searchable exercise select using `exerciseLabels`; reused by collection, history and programs                                                                                                                                                                                                                                      |
| `ProgramDayStarts.tsx`        | Start buttons for program days (`ownPrograms`, cache-first with `cachedPrograms`), `programLabelFor` for the draft label, link to `/programs`                                                                                                                                                                                      |
| `BodyweightPrompt.tsx`        | Asks for bodyweight (bounded by `LOWEST_BODYWEIGHT_KG`/`HIGHEST_BODYWEIGHT_KG`) before a finish that needs it; also used by session detail                                                                                                                                                                                         |
| `OtherAccountDraftNotice.tsx` | Notice when IndexedDB holds a draft owned by another account (`storedSessionId` check against `DraftStore`)                                                                                                                                                                                                                        |

## For AI Agents

### Working In This Directory

- Draft shape and mutations belong to `../../offline/draft-format.ts` and `draft-session.ts`. Do not mutate drafts in components; call the functions from `useWorkoutDraft`.
- A finished draft must never be lost or sent twice. Retry, lock and sync semantics live in `../../offline/finish-retries.ts`, `finish-lock.ts` and `sync-workout.ts`; keep `use-finish-sync.ts` a thin adapter and put behavior changes there under test.
- The XP preview is only a hint. The server result is authoritative, and `previewSet` must stay consistent with the domain functions in `supabase/functions/_shared/domain/`. If balance or effort rules change, update `xp-preview.ts` and re-check the preview e2e.
- Another account's draft is kept but never sent (see `OtherAccountDraftNotice`).
- Controls between sets must stay 44px touch targets (checked by `e2e/a11y.spec.ts`).

### Testing Requirements

- Unit (`make test-web`): the logic this UI drives is tested in `tests/web/draft-format.test.ts`, `draft-session.test.ts`, `draft-store.idb.test.ts`/`draft-store.local.test.ts` (shared `draft-store.contract.ts`), `finish-sync.test.ts`, `finish-retries.test.ts`, `units.test.ts`.
- No test imports `xp-preview.ts` or `use-finish-sync.ts` directly. A failing test for a preview change goes in a new `tests/web/xp-preview.test.ts`; the domain math is tested in `tests/domain/`.
- E2E (stack needed): `e2e/drafts.spec.ts`, `e2e/multi-tab.spec.ts`, `e2e/token-refresh.spec.ts`, `e2e/workout-records.spec.ts`, `e2e/programs.spec.ts`, `e2e/profile.spec.ts` (RPE logging, pounds), `e2e/loot.spec.ts`, `e2e/custom-exercise.spec.ts`, `e2e/a11y.spec.ts`, and `e2e/pwa/offline.spec.ts` (offline logging and later sync).

### Common Patterns

- Props-driven small components; screen owns state, widgets are controlled.
- Rate limit and timeout messages use `RATE_LIMITED_CODE`, `waitText`, `REQUEST_TIMEOUT_MS`.

## Dependencies

### Internal

- `../../offline/{use-workout-draft,draft-format,draft-session,draft-store,finish-lock,finish-retries,sync-workout}.ts`, `../../lib/{catalog,catalog-cache,collection-data,function-client,preferences,profile,programs,rate-limit,standing,supabase,units}.ts`, `../../pwa/InstallCard.tsx`, `../../components/Icon.tsx`, `../summary/last-summary.ts`, `@domain/{index,types}.ts`.

### External

- React, React Router.
