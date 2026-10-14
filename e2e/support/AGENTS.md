# e2e/support

**Parent context:** `../AGENTS.md`
**Generated:** 2026-10-01 · **Updated:** 2026-10-14

## Purpose

Helpers shared by the Playwright specs: user flows (register, sign in, navigate, log sets and bouts, finish), browser storage access for drafts, direct database setup and checks, Mailpit access, accessibility and font assertions, PWA build manipulation, and the stack guard both Playwright configs call. These files are not specs and have no tests of their own; every spec exercises them.

## Map

- `fixtures.ts`: the `test` and `expect` every spec imports. Each page fails its test on an uncaught page error (asserted before the context closes, so the trace is kept), a blocked service worker registration rejects like a real browser, and `newPerson()` opens a fresh browser context that teardown closes, so a failing test never leaks a context.
- `app.ts`: UI flows and locators (`register`, `signIn`, `logExercise`, `logCardio`, `finishWorkout`, `exerciseCard`, `setRow`, `boutRow`, ...) plus raw draft and auth storage helpers.
- `db.ts`: direct SQL and admin API for setup and assertions (accounts, sessions, items, programs, quest progress, rate limits).
- Feature helpers: `challenge.ts` (scroll challenge), `program-enrollment.ts` and `program-seed.ts` (programs; the seed posts through `complete-session`), `friendship.ts`, `network.ts` (`failRequests` injects a PostgREST-shaped 500), `mailbox.ts`.
- Assertions: `a11y.ts` (axe, WCAG A/AA, fails on serious or critical; 44 px touch targets), `fonts.ts`.
- `pwa.ts`: PWA specs only; reads and mutates the built `web/dist`.
- `run-settings.ts`: CI and local settings shared by the three Playwright configs. `stack-guard.ts`: see below.

## Rules and gotchas

- `stack-guard.ts` throws when `.stack.env` sets `SUPABASE_PROJECT_ID` and the process environment differs, so e2e never drives another worktree's stack. It has no stack dependency, which is why the configs can import it.
- `db.ts` and `mailbox.ts` import `tests/integration/*`. Importing `local-stack.ts` runs `npx supabase status` and opens a database pool, so import them only from specs.
- `app.ts` hard-codes the draft store contract: IndexedDB `gainscape` version 1 store `drafts`, fallback key prefix `gainscape.workout-draft.v2.`, record `v: 3`, and the auth storage key `sb-localhost-auth-token`. Change these in the same commit as `web/src/offline/draft-store.ts`, `draft-format.ts` or the Supabase URL, or the drafts, multi-tab and token-refresh specs fail.
- Helpers repeat user-visible strings (button names, tab names, `Set N`, `Bout N`, `kg`/`reps` labels, the `Hard` effort radio, `+ Add bout`, Steady/Intervals, `Start workout`, `Create account`, `Sign in`). Renaming UI text in `web/src` means updating them.
- Locate set and bout rows with `setRow`, `setRows` and `boutRow`, not CSS. CSS selectors stay only in `a11y.ts`, which measures rendered controls.
- Extend `logExercise` and `logCardio` with parameters rather than copying them into specs.
- `register` creates a confirmed account through the admin API in the browser's time zone and skips onboarding, then signs in through the form. Use `fillRegistration` and `submitRegistration` to test the form itself.
- `forgetEmailSendLimit` backdates `confirmation_sent_at` so GoTrue's per-email `max_frequency` lets the next email through without a sleep.
- `forgetSessionCreateLimits` clears `session_create_*` rate limit hits so a seed can post more than 20 sessions.
- `grantItems` writes `item_ledger` and `user_items` together so the ledger parity invariants hold. Do the same in any new grant helper.
- `pauseClockNow` needs the page clock installed first.
- Browser-side helpers run in `page.evaluate` with serialisable arguments only; pass constants in, do not close over them.
- DB helpers look users up by `username` through `public.profiles`.
- `pwa.ts` mutates `web/dist`. Any test that calls `replaceBuildId` or `swapServiceWorker` must restore the original in `afterEach`.

## Testing

- No dedicated tests. Verify a helper change by running the specs that import it: `grep -rl "support/<file>" e2e`, then `npx playwright test <specs>` (stack required), or `make e2e` / `make e2e-pwa`.
- Logic worth unit testing (parsing, formatting) belongs in `web/src/lib` or `tests/`, not here.

## Manual Notes

Notes under this heading are written by humans and preserved on regeneration.
