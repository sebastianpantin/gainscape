# Summary Feature

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-13

## Purpose

The post-workout reveal at `/reveal`: XP per skill, level-ups, gear and challenge bonuses, personal records and loot from the server's `SessionSummary`, plus the session-scoped memory that lets other screens re-find that summary.

## Map

- `RevealScreen.tsx`: the screen and its choreography.
- `reveal-rules.ts`: pure timeline, skip rules and every text the reveal shows (records, bonuses, challenge outcome, notices). Put new decisions here.
- `last-summary.ts`: `sessionStorage` memory of the last summary.
- The summary types live in `@domain/types.ts` and are produced by `complete-session`.

## Rules and gotchas

- The summary comes from router state or `recallLastSummary(userId)`, else `fetchSession`. Offline, names come from the saved standing, exercise list and items caches instead of waiting on requests.
- `last-summary.ts` stores `{ userId, summary }` under `gainscape.last-summary`. Recall returns nothing for another account, so a different sign-in in the same tab never sees it. `forgetLastSummary` clears only when the cached session id is in the list; history delete and edit (`../history/SessionDetailScreen.tsx`) call it so a removed session is not revealed. Keep that coupling when changing keys. A recalled `plannedChallenge` is re-validated with `parsedDraftChallenge`.
- Choreography: every delay comes from `revealTimeline(revealShape(summary))`, compressed so the loot beat never starts after 1.5 s whatever the skill count. Skip with the floating `Skip` button, a pointer press, Escape, or Enter away from a link, button or field. A skip from the button moves focus to the `Workout complete!` heading.
- Nothing plays for a history-only save or without a summary: `reveal-still` on `main` turns animations off. It stays on once the choreography settles, so rows that load late appear without animating. Under `prefers-reduced-motion` it starts settled; `e2e/a11y.spec.ts` asserts that.
- The level-up cue (chime and vibration via `../../lib/celebration-effects.ts`, as the training-device settings allow) primes audio on mount, waits for a suspended context to resume, fires at the peak of the `Level up!` pop and never after a skip.
- Loot with drops is a separate tap on `Open loot`; a skip never opens it. Opening fills a `role="status"` region and moves focus to the `Loot` heading. A rare or legendary drop plays the fanfare and flashes the panel.
- Notices: `challengeNotAppliedText` when the draft planned a challenge but the summary has none (history-only saves keep the scroll; otherwise `complete-session` could not claim a scroll or the challenge or scroll is retired). `unappliedChangesText` when `storedContentDiffers` is set: the server already had this session with other content and stored nothing.
- `challengeFailReason` says the target rose when the server's `targetLoadsKg` floor is above the planned load, which happens when the e1RM rose since the challenge started.
- A hold or carry record (a `cardio` summary on a lift with a measure) reads in metres or seconds in either unit setting.
- The gear bonus line is hidden when the bonus is 0 or the summary predates gear.
- The reveal marks the PWA install card due (`markInstallCardDue`).

## Testing

- Unit (`make test-web`): `tests/web/reveal-rules.test.ts`, `tests/web/last-summary.test.ts` (storage stubbed with `tests/web/memory-storage.ts`).
- E2E (stack): `reveal.spec.ts` (skip, cue, loot tap, reduced motion), `loot.spec.ts`, `challenges.spec.ts`, `a11y.spec.ts`, and the flows that finish a workout.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
