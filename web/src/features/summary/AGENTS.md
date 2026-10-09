# Summary Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-08

## Purpose

The post-workout reveal: XP per skill, level-ups, personal records and loot drops from the server's `SessionSummary`, and the small session-scoped memory that lets other screens re-find that summary.

## Key Files

| File               | Description                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RevealScreen.tsx` | Route `/reveal`. While offline it names skills, exercises and items from the saved standing, exercise list and items caches instead of waiting on requests. Takes the summary from router `location.state` or `recallLastSummary(userId)`; if absent or stale it can refetch with `fetchSession`. Computes level bars with `levelProgress`, writes lift and cardio records through `describeRecord`, shows a `Gear bonus +N XP` line under each skill that got one (`gearBonusText`, hidden when the bonus is 0 or the summary predates gear), a `Challenge bonus +N XP` line beside it (`challengeBonusText`), a `Challenge` section for a session that used a scroll (`challengeHeadline`: `Challenge complete: <name>` or `Challenge failed: <name>`, and for a fail the `challengeFailReason` text under it), shows `LevelUpIcon`, `TrophyIcon`, `ItemIcon`, marks a PR loot drop with a `PR` tag that is a `role="img"` named `Personal record` (`GLOSSARY.pr.name`), shows the `unappliedChangesText` notice (with an `Open this workout` link to the session detail unless history-only) on both reveals when the summary has `storedContentDiffers`, shows the workout length and session RPE (`sessionTimingParts`, from the `startedAt`, `endedAt` and `sessionRpe` that `complete-session` reports) on both the full and the history-only reveal, marks the PWA install card due via `markInstallCardDue`, links to `/skills`, `/collection/items` and `/` |
| `last-summary.ts`  | `rememberLastSummary(userId, summary)`, `recallLastSummary(userId)`, `forgetLastSummary(sessionIds)`; stores `{ userId, summary }` JSON in `sessionStorage` under `gainscape.last-summary`, and recall returns nothing for another account (or an entry without one), so a different sign-in in the same tab never sees it; every access is try/catch guarded; forget only clears when the cached `sessionId` is in the list, whichever account remembered it. A remembered summary can carry `storedContentDiffers` and `plannedChallenge` (the draft's `DraftChallenge`, set by `finish-lock.ts`); `recallLastSummary` re-validates it with `parsedDraftChallenge`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `reveal-rules.ts`  | Pure `describeRecord(record, exercise, unit)`: headline and previous-value text for a personal record (cardio via `describeCardioGains`, bodyweight reps, or load via `formatLoad`). `gearBonusText(summary, skillKey)`: `Gear bonus +N XP` from `summary.gearBonusBySkill`, or null. `challengeHeadline(summary)` and `challengeBonusText(summary, skillKey)` read `summary.challenge` and `summary.challengeBonusBySkill`. `challengeFailReason(summary, planned, nameOf, unit)` is null for a pass or no challenge; for a fail it says `Target rose since you started: <exercise> <floor> (planned <load>)` when the server's `targetLoadsKg` floor is above the planned load, else `Not every prescribed set reached its reps and load` (prescription) or `Volume target not reached`, and `Challenge target not reached` when there is no `plannedChallenge`. `unappliedChangesText(summary)` is null unless `storedContentDiffers` is set (the server already had this session with other content and stored nothing); then it says the later changes were not applied and, unless history-only, to make them again in History                                                                                                                                                                                                                                                                                                                                  |

## For AI Agents

### Working In This Directory

- The reveal must respect reduced motion; `e2e/a11y.spec.ts` asserts no animation under `prefers-reduced-motion`.
- `forgetLastSummary` is called from history delete/edit flows (`../history/SessionDetailScreen.tsx`) so a removed session is not revealed. Keep that coupling when changing keys.
- Summary shape (`SessionSummary`, `DropSummary`, `PersonalRecordSummary`) is defined in `@domain/types.ts` and produced by `complete-session`.

### Testing Requirements

- E2E (stack needed): `e2e/loot.spec.ts` (loot on the reveal), `e2e/challenges.spec.ts` (passed and failed challenge reveal), `e2e/a11y.spec.ts` (reduced motion), `e2e/drafts.spec.ts` and `e2e/programs.spec.ts` (finishing leads to the reveal).
- Unit: `tests/web/last-summary.test.ts` (storage stubbed with `tests/web/memory-storage.ts`) and `tests/web/reveal-rules.test.ts` (`make test-web`).

### Common Patterns

- Storage access wrapped in try/catch with a null fallback.

## Dependencies

### Internal

- `../../lib/{cardio-rules,catalog,catalog-rules,format,history,item-rules,items,preferences,profile-rules,units}.ts`, `../../components/PixelArt.tsx`, `../../pwa/install.ts`, `@domain/{index,types}.ts`.

### External

- React Router.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
